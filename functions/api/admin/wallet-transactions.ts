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
  if (!env.DB) return json({ error: "Wallet transaction administration is not configured." }, 503);
  if (!await authorize(request, env)) return json({ error: "Unauthorized admin access." }, 401);

  const body = await readJson(request);
  const ids = Array.isArray(body?.transactionIds)
    ? [...new Set(body.transactionIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 128))]
    : [];
  if (!ids.length || ids.length > 30) return json({ error: "Select between 1 and 30 wallet transactions." }, 400);

  try {
    await ensureWalletSchema(env.DB);
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_hidden_wallet_transactions (
      transaction_id TEXT PRIMARY KEY,
      hidden_at TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'hidden_from_admin_recent_list'
    )`).run();

    const now = new Date().toISOString();
    const statements = [];
    for (const id of ids) {
      const exists = await env.DB.prepare("SELECT id FROM wallet_transactions WHERE id = ? LIMIT 1").bind(id).first<{ id: string }>();
      if (!exists) continue;
      statements.push(
        env.DB.prepare("INSERT INTO admin_hidden_wallet_transactions (transaction_id, hidden_at, reason) VALUES (?, ?, 'hidden_from_admin_recent_list') ON CONFLICT(transaction_id) DO UPDATE SET hidden_at = excluded.hidden_at, reason = excluded.reason").bind(id, now)
      );
    }
    if (statements.length) await env.DB.batch(statements);
    return json({
      ok: true,
      hiddenCount: statements.length,
      message: `${statements.length} transaction(s) removed from the Recent wallet transactions view. Financial ledger records were preserved.`
    });
  } catch (error) {
    console.error("[MAXWIN admin transaction visibility] Update failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not update recent transaction visibility." }, 500);
  }
};
