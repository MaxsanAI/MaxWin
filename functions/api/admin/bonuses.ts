import { Env, json, readJson, randomToken } from "../auth/_shared";

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
  if (!env.DB) return json({ error: "Bonus administration is not configured." }, 503);
  if (!env.MAXWIN_ADMIN_KEY) return json({ error: "Admin bonus issuance is disabled. Configure MAXWIN_ADMIN_KEY as a Cloudflare secret." }, 503);
  const supplied = request.headers.get("X-MAXWIN-ADMIN-KEY") || "";
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(env.MAXWIN_ADMIN_KEY);
  const suppliedBytes = encoder.encode(supplied);
  if (expectedBytes.length !== suppliedBytes.length) return json({ error: "Unauthorized." }, 401);
  let equal = true;
  for (let i = 0; i < expectedBytes.length; i++) equal = equal && expectedBytes[i] === suppliedBytes[i];
  if (!equal) return json({ error: "Unauthorized." }, 401);

  const body = await readJson(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const amount = typeof body?.amount === "string" || typeof body?.amount === "number" ? String(body.amount).trim() : "";
  if (!username || username.length > 32) return json({ error: "Enter the target username." }, 400);
  if (!title || title.length > 100) return json({ error: "Enter a bonus title up to 100 characters." }, 400);
  if (!amount || amount.length > 40 || /[<>\u0000-\u001f]/.test(amount)) return json({ error: "Enter a valid bonus description or amount." }, 400);

  try {
    await ensureBonusSchema(env.DB);
    const user = await env.DB.prepare("SELECT id, username FROM users WHERE username_key = ? OR lower(username) = lower(?) LIMIT 1")
      .bind(username.toLowerCase(), username).first<{ id: string; username: string }>();
    if (!user) return json({ error: "User account not found." }, 404);
    const id = randomToken(16);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO user_bonuses (id, user_id, title, amount, status, created_at) VALUES (?, ?, ?, ?, 'available', ?)")
      .bind(id, user.id, title, amount, now).run();
    return json({ created: true, bonus: { id, username: user.username, title, amount, status: "available", created_at: now } }, 201);
  } catch (error) {
    console.error("[MAXWIN admin bonuses] Create failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not create the bonus." }, 500);
  }
};
