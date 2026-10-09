import { Env, getUser, json } from "../auth/_shared";
import { ensureFreeSpinSchema } from "./_free-spins";

async function ensureProfileSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    avatar_data_url TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Profile service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to view your profile." }, 401);
  try {
    await ensureProfileSchema(env.DB);
    await ensureFreeSpinSchema(env.DB);
    const now = new Date();
    const fallbackNext = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO free_spin_wallets (user_id, available_spins, total_awarded, next_recurring_at, updated_at) VALUES (?, 0, 0, ?, ?)").bind(user.id, fallbackNext, now.toISOString()).run();
    const [profile, bonuses, spinWallet, spinGrants] = await Promise.all([
      env.DB.prepare("SELECT avatar_data_url AS avatarDataUrl FROM user_profiles WHERE user_id = ? LIMIT 1").bind(user.id).first<{ avatarDataUrl: string | null }>(),
      env.DB.prepare("SELECT id, title, amount, status, created_at FROM user_bonuses WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(user.id).all(),
      env.DB.prepare("SELECT available_spins AS availableSpins, total_awarded AS totalAwarded, next_recurring_at AS nextRecurringAt FROM free_spin_wallets WHERE user_id = ? LIMIT 1").bind(user.id).first<{ availableSpins: number; totalAwarded: number; nextRecurringAt: string }>(),
      env.DB.prepare("SELECT id, grant_type AS grantType, spins, created_at AS createdAt FROM free_spin_grants WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").bind(user.id).all()
    ]);
    return json({ profile: { avatarDataUrl: profile?.avatarDataUrl || null, bonuses: bonuses.results || [], freeSpins: { available: spinWallet?.availableSpins || 0, totalAwarded: spinWallet?.totalAwarded || 0, nextRecurringAt: spinWallet?.nextRecurringAt || null, grants: spinGrants.results || [] } } });
  } catch (error) {
    console.error("[MAXWIN profile] Load failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not load your profile." }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Profile service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to update your profile." }, 401);
  let body: Record<string, unknown> | null = null;
  try {
    const raw = await request.text();
    if (raw.length <= 210_000) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    }
  } catch { /* handled as invalid input below */ }
  if (!body || typeof body.avatarDataUrl !== "string") return json({ error: "Choose a valid profile image to upload." }, 400);
  const avatar = body.avatarDataUrl;
  if (avatar.length > 200_000) return json({ error: "That image is too large. Choose a smaller photo." }, 413);
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)) {
    return json({ error: "Upload a valid JPEG, PNG, or WebP image." }, 400);
  }
  try {
    await ensureProfileSchema(env.DB);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO user_profiles (user_id, avatar_data_url, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET avatar_data_url = excluded.avatar_data_url, updated_at = excluded.updated_at`)
      .bind(user.id, avatar, now).run();
    const bonuses = await env.DB.prepare("SELECT id, title, amount, status, created_at FROM user_bonuses WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(user.id).all();
    return json({ saved: true, profile: { avatarDataUrl: avatar, bonuses: bonuses.results || [] } });
  } catch (error) {
    console.error("[MAXWIN profile] Save failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not save your profile photo." }, 500);
  }
};
