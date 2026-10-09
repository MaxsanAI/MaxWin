import { Env, ensureWalletSchema, getUser, json } from "../auth/_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Wallet service is not configured.", diagnostic: "D1 binding DB is missing." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to view your wallet." }, 401);

  try {
    await ensureWalletSchema(env.DB);
    const [balanceResult, txResult, withdrawalResult] = await Promise.all([
      env.DB.prepare("SELECT asset, available_units, reserved_units, updated_at FROM wallet_balances WHERE user_id = ?").bind(user.id).all<{
        asset: "SOL" | "TON"; available_units: string; reserved_units: string; updated_at: string;
      }>(),
      env.DB.prepare("SELECT id, asset, kind, status, amount_units, tx_hash, address, created_at, updated_at FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(user.id).all(),
      env.DB.prepare("SELECT id, asset, amount_units, destination_address, status, tx_hash, created_at, updated_at FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").bind(user.id).all()
    ]);
    const balances = {
      SOL: { availableUnits: "0", reservedUnits: "0", decimals: 9 },
      TON: { availableUnits: "0", reservedUnits: "0", decimals: 9 }
    };
    for (const row of balanceResult.results || []) {
      if (row.asset === "SOL" || row.asset === "TON") {
        balances[row.asset] = {
          availableUnits: String(row.available_units),
          reservedUnits: String(row.reserved_units),
          decimals: 9
        };
      }
    }
    return json({
      user: { id: user.id, username: user.username },
      balances,
      deposits: {
        SOL: { address: env.SOL_DEPOSIT_ADDRESS || null, configured: Boolean(env.SOL_DEPOSIT_ADDRESS) },
        TON: { address: env.TON_DEPOSIT_ADDRESS || null, configured: Boolean(env.TON_DEPOSIT_ADDRESS) }
      },
      withdrawals: {
        requestsEnabled: true,
        automaticSendingEnabled: env.WITHDRAWALS_ENABLED === "true"
      },
      transactions: txResult.results || [],
      withdrawalRequests: withdrawalResult.results || [],
      notice: "Balances are credited only by a verified on-chain deposit processor. Sending funds to a displayed address does not credit the account until the transaction is detected and confirmed."
    });
  } catch (error) {
    console.error("[MAXWIN wallet] Status failed:", error);
    return json({ error: "Could not load wallet status." }, 500);
  }
};
