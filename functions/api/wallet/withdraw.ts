import { Env, ensureWalletSchema, getUser, json, readJson, randomToken } from "../auth/_shared";

function parseUsdCents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const input = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function usdCentsToLamports(usdCents: number, solUsd: number): bigint | null {
  const units = Math.floor((usdCents / 100 / solUsd) * 1_000_000_000);
  if (!Number.isSafeInteger(units) || units <= 0) return null;
  return BigInt(units);
}

function validSolAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

async function getSolUsd(): Promise<number | null> {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json() as { solana?: { usd?: number } };
    const value = data.solana?.usd;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Wallet service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in before requesting a withdrawal." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Submit a valid withdrawal request." }, 400);

  const amountUsdCents = parseUsdCents(body.amountUsd);
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (body.asset !== undefined && body.asset !== "SOL") return json({ error: "Only SOL withdrawals are available right now." }, 400);
  if (amountUsdCents === null || amountUsdCents < 1000) return json({ error: "The minimum withdrawal is $10.00 USD. Enter the amount in dollars." }, 400);
  if (!validSolAddress(address)) return json({ error: "The destination Solana address format is not valid." }, 400);

  try {
    await ensureWalletSchema(env.DB);
    const solUsd = await getSolUsd();
    if (!solUsd) return json({ error: "The live SOL/USD rate is unavailable. Please try again later." }, 503);
    const amount = usdCentsToLamports(amountUsdCents, solUsd);
    if (amount === null) return json({ error: "This dollar amount is too small to convert to SOL at the current rate." }, 400);

    const balance = await env.DB.prepare("SELECT available_units, reserved_units FROM wallet_balances WHERE user_id = ? AND asset = 'SOL' LIMIT 1")
      .bind(user.id).first<{ available_units: string; reserved_units: string }>();
    if (!balance || BigInt(balance.available_units || "0") < amount) return json({ error: "Insufficient available SOL balance for this withdrawal." }, 400);

    const now = new Date().toISOString();
    const requestId = randomToken(16);
    const transactionId = randomToken(16);
    const nextAvailable = BigInt(balance.available_units) - amount;
    const nextReserved = BigInt(balance.reserved_units || "0") + amount;
    const reserve = await env.DB.prepare("UPDATE wallet_balances SET available_units = ?, reserved_units = ?, updated_at = ? WHERE user_id = ? AND asset = 'SOL' AND available_units = ?")
      .bind(nextAvailable.toString(), nextReserved.toString(), now, user.id, balance.available_units).run();
    if (!reserve.meta || reserve.meta.changes !== 1) return json({ error: "Wallet balance changed while submitting. Refresh and try again." }, 409);

    try {
      await env.DB.prepare("INSERT INTO withdrawal_requests (id,user_id,asset,amount_units,destination_address,status,tx_hash,created_at,updated_at) VALUES (?,?,'SOL',?,?,'pending',NULL,?,?)")
        .bind(requestId, user.id, amount.toString(), address, now, now).run();
      await env.DB.prepare("INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) VALUES (?,?,'SOL','withdrawal','pending',?,NULL,?,NULL,?,?,?)")
        .bind(transactionId, user.id, amount.toString(), address, now, now, JSON.stringify({ requestId, manualApproval: true, solUsdAtRequest: solUsd })).run();
    } catch (error) {
      await env.DB.prepare("UPDATE wallet_balances SET available_units = ?, reserved_units = ?, updated_at = ? WHERE user_id = ? AND asset = 'SOL'")
        .bind(balance.available_units, balance.reserved_units || "0", now, user.id).run();
      throw error;
    }
    return json({
      ok: true,
      request: { id: requestId, asset: "SOL", amountUnits: amount.toString(), status: "pending", createdAt: now },
      message: "Withdrawal request submitted for admin approval. SOL is reserved and will not be sent automatically."
    }, 201);
  } catch (error) {
    console.error("[MAXWIN wallet] Withdrawal request failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not submit the withdrawal request." }, 500);
  }
};
