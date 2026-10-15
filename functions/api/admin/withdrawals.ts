import { Env, ensureWalletSchema, json, readJson } from "../auth/_shared";

async function authorize(request: Request, env: Env): Promise<boolean> {
  const expected = env.MAXWIN_ADMIN_KEY || "";
  const supplied = request.headers.get("X-MAXWIN-ADMIN-KEY") || "";
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(supplied);
  if (!expected || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Withdrawal administration is not configured." }, 503);
  if (!await authorize(request, env)) return json({ error: "Unauthorized admin access." }, 401);
  const body = await readJson(request);
  const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
  const action = body?.action;
  const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";
  if (!requestId || requestId.length > 128) return json({ error: "A valid withdrawal request ID is required." }, 400);
  if (action !== "approve" && action !== "reject" && action !== "mark_sent") return json({ error: "Choose approve, reject, or mark_sent." }, 400);
  if (action === "mark_sent" && !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(txHash)) return json({ error: "Enter the confirmed Solana transaction signature before marking this payout as sent." }, 400);

  try {
    await ensureWalletSchema(env.DB);
    const row = await env.DB.prepare("SELECT id, user_id, asset, amount_units, destination_address, status FROM withdrawal_requests WHERE id = ? LIMIT 1")
      .bind(requestId).first<{ id: string; user_id: string; asset: string; amount_units: string; destination_address: string; status: string }>();
    if (!row) return json({ error: "Withdrawal request not found." }, 404);
    if (row.asset !== "SOL") return json({ error: "Only SOL withdrawals are enabled for manual processing." }, 400);
    const now = new Date().toISOString();

    if (action === "approve") {
      if (row.status !== "pending") return json({ error: "Only pending requests can be approved." }, 409);
      await env.DB.prepare("UPDATE withdrawal_requests SET status = 'approved', updated_at = ? WHERE id = ? AND status = 'pending'").bind(now, requestId).run();
      return json({ ok: true, status: "approved", message: "Approved for manual payout. Send SOL yourself, then record the confirmed transaction signature." });
    }

    if (action === "reject") {
      if (row.status !== "pending" && row.status !== "approved") return json({ error: "Only pending or approved requests can be rejected." }, 409);
      const balance = await env.DB.prepare("SELECT available_units, reserved_units FROM wallet_balances WHERE user_id = ? AND asset = 'SOL' LIMIT 1")
        .bind(row.user_id).first<{ available_units: string; reserved_units: string }>();
      const amount = BigInt(row.amount_units);
      if (!balance || BigInt(balance.reserved_units || "0") < amount) return json({ error: "Reserved wallet balance is inconsistent; request was not changed." }, 409);
      const available = BigInt(balance.available_units || "0") + amount;
      const reserved = BigInt(balance.reserved_units || "0") - amount;
      await env.DB.prepare("UPDATE wallet_balances SET available_units = ?, reserved_units = ?, updated_at = ? WHERE user_id = ? AND asset = 'SOL'")
        .bind(available.toString(), reserved.toString(), now, row.user_id).run();
      await env.DB.prepare("UPDATE withdrawal_requests SET status = 'rejected', updated_at = ? WHERE id = ? AND status IN ('pending','approved')").bind(now, requestId).run();
      await env.DB.prepare("UPDATE wallet_transactions SET status = 'rejected', updated_at = ? WHERE user_id = ? AND kind = 'withdrawal' AND metadata_json LIKE ? AND status IN ('pending','confirming')")
        .bind(now, row.user_id, '%"requestId":"' + requestId + '"%').run();
      return json({ ok: true, status: "rejected", message: "Request rejected and reserved SOL returned to the user's available balance." });
    }

    if (row.status !== "approved") return json({ error: "Approve the request first, send the SOL manually, then record the transaction signature." }, 409);
    const existing = await env.DB.prepare("SELECT id FROM wallet_transactions WHERE asset = 'SOL' AND tx_hash = ? LIMIT 1").bind(txHash).first<{ id: string }>();
    if (existing) return json({ error: "That Solana transaction signature is already recorded." }, 409);
    const balance = await env.DB.prepare("SELECT available_units, reserved_units FROM wallet_balances WHERE user_id = ? AND asset = 'SOL' LIMIT 1")
      .bind(row.user_id).first<{ available_units: string; reserved_units: string }>();
    const amount = BigInt(row.amount_units);
    if (!balance || BigInt(balance.reserved_units || "0") < amount) return json({ error: "Reserved wallet balance is inconsistent; payout was not marked sent." }, 409);
    const txUpdate = await env.DB.prepare("UPDATE wallet_transactions SET status = 'confirmed', tx_hash = ?, address = ?, updated_at = ? WHERE user_id = ? AND kind = 'withdrawal' AND status IN ('pending','confirming') AND metadata_json LIKE ?")
      .bind(txHash, row.destination_address, now, row.user_id, '%"requestId":"' + requestId + '"%').run();
    if (!txUpdate.meta || txUpdate.meta.changes !== 1) return json({ error: "Could not find the matching pending ledger entry; payout status was not changed." }, 409);
    await env.DB.prepare("UPDATE wallet_balances SET reserved_units = ?, updated_at = ? WHERE user_id = ? AND asset = 'SOL'")
      .bind((BigInt(balance.reserved_units) - amount).toString(), now, row.user_id).run();
    await env.DB.prepare("UPDATE withdrawal_requests SET status = 'sent', tx_hash = ?, updated_at = ? WHERE id = ? AND status = 'approved'")
      .bind(txHash, now, requestId).run();
    return json({ ok: true, status: "sent", txHash, message: "Manual payout recorded. The transaction signature is saved in the audit trail." });
  } catch (error) {
    console.error("[MAXWIN admin withdrawals] Update failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not update the withdrawal request." }, 500);
  }
};
