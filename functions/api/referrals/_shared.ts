import { ensureWalletSchema, randomToken } from "../auth/_shared";

export async function ensureReferralSchema(db: D1Database): Promise<void> {
  await ensureWalletSchema(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS referrals (
    referred_user_id TEXT PRIMARY KEY,
    referrer_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id, created_at)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS referral_rewards (
    id TEXT PRIMARY KEY,
    referrer_user_id TEXT NOT NULL,
    reward_usd INTEGER NOT NULL DEFAULT 10 CHECK (reward_usd = 10),
    status TEXT NOT NULL CHECK (status IN ('eligible','requested','approved','paid','rejected')),
    choice TEXT CHECK (choice IN ('wallet','book_of_temple')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    admin_note TEXT,
    FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards(referrer_user_id, created_at DESC)").run();
}

export async function attachReferral(db: D1Database, referredUserId: string, referralUsername: unknown): Promise<void> {
  if (typeof referralUsername !== "string") return;
  const username = referralUsername.trim();
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return;
  const referrer = await db.prepare("SELECT id FROM users WHERE username_key=? LIMIT 1").bind(username.toLowerCase()).first<{id:string}>();
  if (!referrer || referrer.id === referredUserId) return;
  try {
    await db.prepare("INSERT OR IGNORE INTO referrals (referred_user_id, referrer_user_id, created_at) VALUES (?,?,?)")
      .bind(referredUserId, referrer.id, new Date().toISOString()).run();
  } catch (error) {
    console.error("[MAXWIN referral] Could not attach referral:", error instanceof Error ? error.message : String(error));
  }
}

export async function refreshReferralEligibility(db: D1Database, referrerUserId?: string): Promise<void> {
  await ensureReferralSchema(db);
  const owners = referrerUserId
    ? [{referrer_user_id: referrerUserId}]
    : (await db.prepare("SELECT DISTINCT referrer_user_id FROM referrals").all<{referrer_user_id:string}>()).results || [];
  for (const owner of owners) {
    const qualified = await db.prepare(`SELECT COUNT(*) AS count FROM referrals r
      WHERE r.referrer_user_id=? AND EXISTS (
        SELECT 1 FROM wallet_transactions t WHERE t.user_id=r.referred_user_id
          AND t.kind='deposit' AND t.status='confirmed'
      )`).bind(owner.referrer_user_id).first<{count:number}>();
    if (Number(qualified?.count || 0) < 10) continue;
    const existing = await db.prepare("SELECT id FROM referral_rewards WHERE referrer_user_id=? AND status IN ('eligible','requested','approved','paid') LIMIT 1")
      .bind(owner.referrer_user_id).first();
    if (!existing) {
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO referral_rewards (id,referrer_user_id,reward_usd,status,created_at,updated_at) VALUES (?,?,10,'eligible',?,?)")
        .bind(randomToken(16), owner.referrer_user_id, now, now).run();
    }
  }
}
