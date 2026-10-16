import { Env, getUser, json } from "../auth/_shared";
import { claimRecurringFreeSpins, ensureFreeSpinSchema, ensureRealSlotFeatureSchema, migrateLegacyFreeSpinsToRealSlot } from "./_free-spins";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Free-spin service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to claim your free spins." }, 401);
  try {
    await ensureFreeSpinSchema(env.DB);
    await ensureRealSlotFeatureSchema(env.DB);
    const security = await env.DB.prepare("SELECT free_spins_frozen FROM user_security WHERE user_id=? LIMIT 1").bind(user.id).first<{free_spins_frozen:number}>();
    if (Number(security?.free_spins_frozen || 0) === 1) return json({ error: "Free spins are temporarily paused on your account. Please contact support." }, 403);
    const now = new Date();
    const fallbackNext = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO free_spin_wallets (user_id, available_spins, total_awarded, next_recurring_at, updated_at) VALUES (?, 0, 0, ?, ?)")
      .bind(user.id, fallbackNext, now.toISOString()).run();
    await migrateLegacyFreeSpinsToRealSlot(env.DB, user.id);
    const result = await claimRecurringFreeSpins(env.DB, user.id, now);
    if (!result.granted) {
      return json({ claimed: false, nextRecurringAt: result.nextRecurringAt, message: "Your next 30 free spins are not ready yet." }, 409);
    }
    return json({ claimed: true, spinsGranted: 30, nextRecurringAt: result.nextRecurringAt, message: "30 bonus-funded free spins have been added for Temple of Ra Real Play." });
  } catch (error) {
    console.error("[MAXWIN free spins] Claim failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not claim free spins. Please try again." }, 500);
  }
};
