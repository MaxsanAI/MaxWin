import { Env, getUser, json } from "../auth/_shared";
import { claimRecurringFreeSpins, ensureFreeSpinSchema } from "./_free-spins";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Free-spin service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to claim your free spins." }, 401);
  try {
    await ensureFreeSpinSchema(env.DB);
    const now = new Date();
    const fallbackNext = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO free_spin_wallets (user_id, available_spins, total_awarded, next_recurring_at, updated_at) VALUES (?, 0, 0, ?, ?)")
      .bind(user.id, fallbackNext, now.toISOString()).run();
    const result = await claimRecurringFreeSpins(env.DB, user.id, now);
    if (!result.granted) {
      return json({ claimed: false, nextRecurringAt: result.nextRecurringAt, message: "Your next 30 free spins are not ready yet." }, 409);
    }
    return json({ claimed: true, spinsGranted: 30, nextRecurringAt: result.nextRecurringAt, message: "30 free spins have been added to your promotional spin balance." });
  } catch (error) {
    console.error("[MAXWIN free spins] Claim failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not claim free spins. Please try again." }, 500);
  }
};
