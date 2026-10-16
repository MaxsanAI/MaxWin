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

export async function ensureRealSlotFeatureSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_real_features (
    user_id TEXT PRIMARY KEY,
    free_spins INTEGER NOT NULL DEFAULT 0,
    free_spin_bet INTEGER NOT NULL DEFAULT 20,
    expanding_symbol TEXT,
    updated_at TEXT NOT NULL,
    bonus_balance_cents INTEGER NOT NULL DEFAULT 0,
    bonus_funded_spins INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  const columns = await db.prepare("PRAGMA table_info(book_of_ra_real_features)").all<{ name: string }>();
  const names = new Set((columns.results || []).map(column => column.name));
  if (!names.has("bonus_balance_cents")) await db.prepare("ALTER TABLE book_of_ra_real_features ADD COLUMN bonus_balance_cents INTEGER NOT NULL DEFAULT 0").run();
  if (!names.has("bonus_funded_spins")) await db.prepare("ALTER TABLE book_of_ra_real_features ADD COLUMN bonus_funded_spins INTEGER NOT NULL DEFAULT 0").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS free_spin_migrations (
    user_id TEXT PRIMARY KEY,
    migrated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
}

export async function migrateLegacyFreeSpinsToRealSlot(db: D1Database, userId: string): Promise<void> {
  await ensureFreeSpinSchema(db);
  await ensureRealSlotFeatureSchema(db);
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO book_of_ra_real_features (user_id, free_spins, free_spin_bet, expanding_symbol, updated_at, bonus_balance_cents, bonus_funded_spins) VALUES (?, 0, 20, NULL, ?, 0, 0)")
    .bind(userId, now).run();
  const legacy = await db.prepare("SELECT available_spins AS available FROM free_spin_wallets WHERE user_id = ? LIMIT 1")
    .bind(userId).first<{ available: number }>();
  const available = Math.max(0, Number(legacy?.available || 0));
  const marker = await db.prepare("INSERT OR IGNORE INTO free_spin_migrations (user_id, migrated_at) SELECT user_id, ? FROM free_spin_wallets WHERE user_id = ?")
    .bind(now, userId).run();
  if (marker.meta.changes && available > 0) {
    await db.prepare("UPDATE book_of_ra_real_features SET free_spins = free_spins + ?, bonus_funded_spins = bonus_funded_spins + ?, updated_at = ? WHERE user_id = ?")
      .bind(available, available, now, userId).run();
  }
  if (marker.meta.changes) {
    await db.prepare("UPDATE free_spin_wallets SET available_spins = 0, updated_at = ? WHERE user_id = ?")
      .bind(now, userId).run();
  }
}

export async function grantWelcomeFreeSpins(db: D1Database, userId: string, now = new Date()): Promise<void> {
  await ensureFreeSpinSchema(db);
  await ensureRealSlotFeatureSchema(db);
  const createdAt = now.toISOString();
  const nextRecurringAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT OR IGNORE INTO free_spin_wallets (user_id, available_spins, total_awarded, next_recurring_at, updated_at) VALUES (?, 0, 0, ?, ?)")
    .bind(userId, nextRecurringAt, createdAt).run();
  await db.prepare("INSERT OR IGNORE INTO book_of_ra_real_features (user_id, free_spins, free_spin_bet, expanding_symbol, updated_at, bonus_balance_cents, bonus_funded_spins) VALUES (?, 0, 20, NULL, ?, 0, 0)")
    .bind(userId, createdAt).run();
  const grant = await db.prepare("INSERT OR IGNORE INTO free_spin_grants (id, user_id, grant_type, spins, created_at) VALUES (?, ?, 'welcome', 25, ?)")
    .bind(`welcome_${userId}`, userId, createdAt).run();
  if (grant.meta.changes) {
    await db.prepare("UPDATE book_of_ra_real_features SET free_spins = free_spins + 25, bonus_funded_spins = bonus_funded_spins + 25, updated_at = ? WHERE user_id = ?")
      .bind(createdAt, userId).run();
    await db.prepare("UPDATE free_spin_wallets SET total_awarded = total_awarded + 25, next_recurring_at = ?, updated_at = ? WHERE user_id = ?")
      .bind(nextRecurringAt, createdAt, userId).run();
  }
}

export async function claimRecurringFreeSpins(db: D1Database, userId: string, now = new Date()): Promise<{ granted: boolean; nextRecurringAt: string | null }> {
  await ensureFreeSpinSchema(db);
  await ensureRealSlotFeatureSchema(db);
  await migrateLegacyFreeSpinsToRealSlot(db, userId);
  const nowIso = now.toISOString();
  const update = await db.prepare(`UPDATE free_spin_wallets
    SET total_awarded = total_awarded + 30,
        next_recurring_at = datetime(next_recurring_at, '+15 days'),
        updated_at = ?
    WHERE user_id = ? AND datetime(next_recurring_at) <= datetime(?)`)
    .bind(nowIso, userId, nowIso).run();
  if (!update.meta.changes) {
    const wallet = await db.prepare("SELECT next_recurring_at AS nextRecurringAt FROM free_spin_wallets WHERE user_id = ? LIMIT 1")
      .bind(userId).first<{ nextRecurringAt: string }>();
    return { granted: false, nextRecurringAt: wallet?.nextRecurringAt || null };
  }
  await db.prepare("UPDATE book_of_ra_real_features SET free_spins = free_spins + 30, bonus_funded_spins = bonus_funded_spins + 30, updated_at = ? WHERE user_id = ?")
    .bind(nowIso, userId).run();
  await db.prepare("INSERT INTO free_spin_grants (id, user_id, grant_type, spins, created_at) VALUES (?, ?, 'recurring', 30, ?)")
    .bind(`recurring_${userId}_${now.getTime()}`, userId, nowIso).run();
  const wallet = await db.prepare("SELECT next_recurring_at AS nextRecurringAt FROM free_spin_wallets WHERE user_id = ? LIMIT 1")
    .bind(userId).first<{ nextRecurringAt: string }>();
  return { granted: true, nextRecurringAt: wallet?.nextRecurringAt || null };
}
