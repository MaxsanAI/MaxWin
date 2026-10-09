import { Env, getUser, json, readJson } from "../auth/_shared";

async function ensureBonusSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_bonuses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    amount TEXT NOT NULL DEFAULT '0',
    status TEXT NOT NULL CHECK (status IN ('available','pending','claimed','expired','cancelled')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_bonuses_user_created ON user_bonuses(user_id, created_at DESC)").run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Bonus service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to request a bonus." }, 401);
  const body = await readJson(request);
  const bonusId = typeof body?.bonusId === "string" ? body.bonusId.trim() : "";
  if (!bonusId || bonusId.length > 100) return json({ error: "Choose a valid bonus." }, 400);
  try {
    await ensureBonusSchema(env.DB);
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE user_bonuses SET status = 'pending' WHERE id = ? AND user_id = ? AND status = 'available'")
      .bind(bonusId, user.id).run();
    if (!result.meta.changes) {
      const existing = await env.DB.prepare("SELECT status FROM user_bonuses WHERE id = ? AND user_id = ? LIMIT 1")
        .bind(bonusId, user.id).first<{ status: string }>();
      if (!existing) return json({ error: "That bonus was not found in your account." }, 404);
      return json({ error: existing.status === "pending" ? "This bonus request is already pending review." : "This bonus is no longer available." }, 409);
    }
    await env.DB.prepare("INSERT INTO wallet_transactions (id, user_id, asset, kind, status, amount_units, tx_hash, address, idempotency_key, created_at, updated_at) SELECT ?, ?, 'SOL', 'bonus_request', 'pending', '0', NULL, NULL, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'wallet_transactions')")
      .bind(crypto.randomUUID(), user.id, "bonus-request:" + bonusId, now, now).run().catch(() => undefined);
    return json({ requested: true, status: "pending", message: "Bonus request submitted for review. It has not been added to your wallet balance." });
  } catch (error) {
    console.error("[MAXWIN bonus] Request failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not submit the bonus request." }, 500);
  }
};
