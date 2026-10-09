export async function ensureFreeSpinSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS free_spin_wallets (
    user_id TEXT PRIMARY KEY,
    available_spins INTEGER NOT NULL DEFAULT 0 CHECK (available_spins >= 0),
    total_awarded INTEGER NOT NULL DEFAULT 0 CHECK (total_awarded >= 0),
    next_recurring_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS free_spin_grants (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    grant_type TEXT NOT NULL CHECK (grant_type IN ('welcome','recurring')),
    spins INTEGER NOT NULL CHECK (spins > 0),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_free_spin_grants_user_created ON free_spin_grants(user_id, created_at DESC)").run();
}

export async function grantWelcomeFreeSpins(db: D1Database, userId: string, now = new Date()): Promise<void> {
  await ensureFreeSpinSchema(db);
  const createdAt = now.toISOString();
  const nextRecurringAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT OR IGNORE INTO free_spin_wallets (user_id, available_spins, total_awarded, next_recurring_at, updated_at) VALUES (?, 25, 25, ?, ?)")
    .bind(userId, nextRecurringAt, createdAt).run();
  await db.prepare("INSERT INTO free_spin_grants (id, user_id, grant_type, spins, created_at) SELECT ?, ?, 'welcome', 25, ? WHERE NOT EXISTS (SELECT 1 FROM free_spin_grants WHERE user_id = ? AND grant_type = 'welcome')")
    .bind(`welcome_${userId}`, userId, createdAt, userId).run();
}

export async function claimRecurringFreeSpins(db: D1Database, userId: string, now = new Date()): Promise<{ granted: boolean; nextRecurringAt: string | null }> {
  await ensureFreeSpinSchema(db);
  const nowIso = now.toISOString();
  const grantId = `recurring_${userId}_${now.getTime()}`;
  const update = await db.prepare(`UPDATE free_spin_wallets
    SET available_spins = available_spins + 30,
        total_awarded = total_awarded + 30,
        next_recurring_at = datetime(next_recurring_at, '+15 days'),
        updated_at = ?
    WHERE user_id = ? AND datetime(next_recurring_at) <= datetime(?)`)
    .bind(nowIso, userId, nowIso).run();
  if (!update.meta.changes) {
    const wallet = await db.prepare("SELECT next_recurring_at AS nextRecurringAt FROM free_spin_wallets WHERE user_id = ? LIMIT 1")
      .bind(userId).first<{ nextRecurringAt: string }>();
    return { granted: false, nextRecurringAt: wallet?.nextRecurringAt || null };
  }
  await db.prepare("INSERT INTO free_spin_grants (id, user_id, grant_type, spins, created_at) VALUES (?, ?, 'recurring', 30, ?)")
    .bind(grantId, userId, nowIso).run();
  const wallet = await db.prepare("SELECT next_recurring_at AS nextRecurringAt FROM free_spin_wallets WHERE user_id = ? LIMIT 1")
    .bind(userId).first<{ nextRecurringAt: string }>();
  return { granted: true, nextRecurringAt: wallet?.nextRecurringAt || null };
}
