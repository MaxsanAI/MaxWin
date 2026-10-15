import { Env, ensureWalletSchema, json } from "../auth/_shared";
import { ensureFreeSpinSchema } from "../profile/_free-spins";

async function authorize(request: Request, env: Env): Promise<boolean> {
  const expected = env.MAXWIN_ADMIN_KEY || "";
  const supplied = request.headers.get("X-MAXWIN-ADMIN-KEY") || "";
  if (!expected || expected.length !== supplied.length) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(supplied);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function ensureAdminBonusSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_bonuses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    amount TEXT NOT NULL DEFAULT '0',
    status TEXT NOT NULL CHECK (status IN ('available','pending','claimed','expired','cancelled')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_bonuses_user_created ON user_bonuses(user_id, created_at DESC)`).run();
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Admin dashboard database is not configured." }, 503);
  if (!await authorize(request, env)) return json({ error: env.MAXWIN_ADMIN_KEY ? "Unauthorized admin access." : "Set MAXWIN_ADMIN_KEY as a Cloudflare secret before using the admin dashboard." }, 401);
  try {
    await ensureWalletSchema(env.DB);
    await ensureFreeSpinSchema(env.DB);
    await ensureAdminBonusSchema(env.DB);
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_hidden_wallet_transactions (
      transaction_id TEXT PRIMARY KEY,
      hidden_at TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'hidden_from_admin_recent_list'
    )`).run();
    const [users, walletTx, withdrawals, balances, spins, bonuses, recentTx, recentWithdrawals] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM wallet_transactions").first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM withdrawal_requests").first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM wallet_balances").first<{ count: number }>(),
      env.DB.prepare("SELECT COALESCE(SUM(available_spins),0) AS available, COALESCE(SUM(total_awarded),0) AS awarded FROM free_spin_wallets").first<{ available: number; awarded: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM user_bonuses").first<{ count: number }>(),
      env.DB.prepare("SELECT t.id, t.user_id AS userId, u.username, t.asset, t.kind, t.status, t.amount_units AS amountUnits, t.tx_hash AS txHash, t.address, t.created_at AS createdAt FROM wallet_transactions t JOIN users u ON u.id=t.user_id WHERE NOT EXISTS (SELECT 1 FROM admin_hidden_wallet_transactions h WHERE h.transaction_id=t.id) ORDER BY t.created_at DESC LIMIT 30").all(),
      env.DB.prepare("SELECT w.id, w.user_id AS userId, u.username, w.asset, w.amount_units AS amountUnits, w.destination_address AS address, w.status, w.tx_hash AS txHash, w.created_at AS createdAt FROM withdrawal_requests w JOIN users u ON u.id=w.user_id ORDER BY w.created_at DESC LIMIT 30").all()
    ]);
    const pendingDeposits = await env.DB.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE kind='deposit' AND status IN ('pending','confirming')").first<{ count: number }>();
    const pendingWithdrawals = await env.DB.prepare("SELECT COUNT(*) AS count FROM withdrawal_requests WHERE status IN ('pending','approved','processing')").first<{ count: number }>();
    return json({
      status: {
        realMoneyPlayEnabled: true,
        depositsEnabled: true,
        automaticWithdrawalsEnabled: false,
        manualWithdrawalApprovalEnabled: true,
        minimumDepositUsd: 5,
        depositStepUsd: 5,
        welcomeFreeSpins: 25,
        welcomeSpinValueUsd: 0.2,
        minimumWithdrawalUsd: 10
      },
      stats: {
        users: Number(users?.count || 0),
        walletTransactions: Number(walletTx?.count || 0),
        withdrawalRequests: Number(withdrawals?.count || 0),
        walletAccounts: Number(balances?.count || 0),
        freeSpinsAvailable: Number(spins?.available || 0),
        freeSpinsAwarded: Number(spins?.awarded || 0),
        bonusRecords: Number(bonuses?.count || 0),
        pendingDeposits: Number(pendingDeposits?.count || 0),
        pendingWithdrawals: Number(pendingWithdrawals?.count || 0)
      },
      recentTransactions: recentTx.results || [],
      recentWithdrawals: recentWithdrawals.results || [],
      notice: "Book of Ra real-mode spins and wallet settlement are enabled in the game API. SOL deposits are credited only after on-chain verification. Withdrawals remain manual: approve the request, send SOL yourself, then record the finalized transaction signature."
    });
  } catch (error) {
    console.error("[MAXWIN admin overview] Failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not load admin overview." }, 500);
  }
};
