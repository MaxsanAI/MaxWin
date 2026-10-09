import { Env, getUser, json, readJson, randomToken } from "../auth/_shared";
import { ensureFreeSpinSchema } from "../profile/_free-spins";

const GAME_TITLES = new Set([
  "Royal Fortune", "Neon Dynasty", "Golden Vault", "Moon Temple",
  "Lucky 7s", "Cosmic Gems", "Crown of Gold", "Midnight Spin"
]);
const SYMBOLS = ["♛", "💎", "7️⃣", "🌙", "⭐", "🔔", "🍀", "👑"];

async function ensureRoundsSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS free_spin_rounds (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    game_title TEXT NOT NULL,
    symbols_json TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('pending','triple-match','pair-match','no-match')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_free_spin_rounds_user_created ON free_spin_rounds(user_id, created_at DESC)").run();
}

function randomIndex(max: number): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}

function createOutcome(): { symbols: string[]; outcome: "triple-match" | "pair-match" | "no-match" } {
  const symbols = [SYMBOLS[randomIndex(SYMBOLS.length)], SYMBOLS[randomIndex(SYMBOLS.length)], SYMBOLS[randomIndex(SYMBOLS.length)]];
  const outcome = symbols[0] === symbols[1] && symbols[1] === symbols[2]
    ? "triple-match"
    : (symbols[0] === symbols[1] || symbols[0] === symbols[2] || symbols[1] === symbols[2])
      ? "pair-match" : "no-match";
  return { symbols, outcome };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Free-spin game service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to play free spins." }, 401);
  try {
    await ensureFreeSpinSchema(env.DB);
    await ensureRoundsSchema(env.DB);
    const [wallet, rounds] = await Promise.all([
      env.DB.prepare("SELECT available_spins AS available FROM free_spin_wallets WHERE user_id = ? LIMIT 1").bind(user.id).first<{ available: number }>(),
      env.DB.prepare("SELECT id, game_title AS gameTitle, symbols_json AS symbolsJson, outcome, created_at AS createdAt FROM free_spin_rounds WHERE user_id = ? AND outcome <> 'pending' ORDER BY created_at DESC LIMIT 12").bind(user.id).all()
    ]);
    return json({
      availableSpins: wallet?.available ?? 0,
      history: (rounds.results || []).map((round: any) => ({
        id: round.id, gameTitle: round.gameTitle, symbols: JSON.parse(round.symbolsJson), outcome: round.outcome, createdAt: round.createdAt
      })),
      mode: "promotional-demo",
      cashValue: false
    });
  } catch (error) {
    console.error("[MAXWIN spin] Load failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not load free-spin history." }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Free-spin game service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in to play free spins." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Submit a valid spin request." }, 400);
  const gameTitle = typeof body.gameTitle === "string" ? body.gameTitle : "";
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!GAME_TITLES.has(gameTitle)) return json({ error: "That game is not available for promotional spins." }, 400);
  if (!/^[a-f0-9-]{16,64}$/i.test(requestId)) return json({ error: "Refresh the game and try again." }, 400);

  try {
    await ensureFreeSpinSchema(env.DB);
    await ensureRoundsSchema(env.DB);
    const existing = await env.DB.prepare("SELECT id, game_title AS gameTitle, symbols_json AS symbolsJson, outcome, created_at AS createdAt FROM free_spin_rounds WHERE request_id = ? AND user_id = ? LIMIT 1")
      .bind(requestId, user.id).first<{ id: string; gameTitle: string; symbolsJson: string; outcome: string; createdAt: string }>();
    if (existing && existing.outcome !== "pending") {
      return json({ spin: { id: existing.id, gameTitle: existing.gameTitle, symbols: JSON.parse(existing.symbolsJson), outcome: existing.outcome, createdAt: existing.createdAt }, replayed: true, cashValue: false });
    }
    if (existing) return json({ error: "This spin is still being processed. Refresh the game before trying again." }, 409);

    const now = new Date().toISOString();
    const id = randomToken(16);
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO free_spin_rounds (id, request_id, user_id, game_title, symbols_json, outcome, created_at) VALUES (?, ?, ?, ?, '[]', 'pending', ?)")
      .bind(id, requestId, user.id, gameTitle, now).run();
    if (!inserted.meta.changes) {
      const duplicate = await env.DB.prepare("SELECT id, game_title AS gameTitle, symbols_json AS symbolsJson, outcome, created_at AS createdAt FROM free_spin_rounds WHERE request_id = ? AND user_id = ? LIMIT 1")
        .bind(requestId, user.id).first<{ id: string; gameTitle: string; symbolsJson: string; outcome: string; createdAt: string }>();
      if (duplicate && duplicate.outcome !== "pending") return json({ spin: { id: duplicate.id, gameTitle: duplicate.gameTitle, symbols: JSON.parse(duplicate.symbolsJson), outcome: duplicate.outcome, createdAt: duplicate.createdAt }, replayed: true, cashValue: false });
      return json({ error: "This spin is already being processed. Refresh the game before trying again." }, 409);
    }

    const spent = await env.DB.prepare("UPDATE free_spin_wallets SET available_spins = available_spins - 1, updated_at = ? WHERE user_id = ? AND available_spins > 0")
      .bind(now, user.id).run();
    if (!spent.meta.changes) {
      await env.DB.prepare("DELETE FROM free_spin_rounds WHERE id = ? AND outcome = 'pending'").bind(id).run();
      return json({ error: "You have no free spins remaining." }, 409);
    }

    const result = createOutcome();
    await env.DB.prepare("UPDATE free_spin_rounds SET symbols_json = ?, outcome = ? WHERE id = ? AND user_id = ? AND outcome = 'pending'")
      .bind(JSON.stringify(result.symbols), result.outcome, id, user.id).run();
    return json({
      spin: { id, gameTitle, symbols: result.symbols, outcome: result.outcome, createdAt: now },
      availableSpins: Math.max(0, Number((await env.DB.prepare("SELECT available_spins AS available FROM free_spin_wallets WHERE user_id = ? LIMIT 1").bind(user.id).first<{ available: number }>())?.available ?? 0)),
      cashValue: false,
      message: result.outcome === "triple-match" ? "Three matching symbols!" : result.outcome === "pair-match" ? "Two matching symbols!" : "No match this time."
    });
  } catch (error) {
    console.error("[MAXWIN spin] Spin failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not complete this free spin. Refresh and check your balance before retrying." }, 500);
  }
};
