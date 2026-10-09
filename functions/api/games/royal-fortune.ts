import { Env, getUser, json, readJson, randomToken } from "../auth/_shared";

type SymbolName = "crown" | "gem" | "shield" | "coins" | "star" | "flame" | "zap" | "coin";
const SYMBOLS: SymbolName[] = ["crown", "gem", "shield", "coins", "star", "flame", "zap", "coin"];
const TRIPLE_MULTIPLIERS: Record<SymbolName, number> = { crown: 100, gem: 60, shield: 40, coins: 30, star: 25, flame: 20, zap: 15, coin: 10 };

async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_wallets (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 10000 CHECK (balance >= 0),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_rounds (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('spin','buyBonus')),
    bet INTEGER NOT NULL,
    stake INTEGER NOT NULL,
    payout INTEGER NOT NULL DEFAULT 0,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_royal_fortune_rounds_user_created ON royal_fortune_demo_rounds(user_id, created_at DESC)").run();
}

async function getOrCreateWallet(db: D1Database, userId: string) {
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO royal_fortune_demo_wallets (user_id, balance, updated_at) VALUES (?, 10000, ?)").bind(userId, now).run();
  return db.prepare("SELECT balance FROM royal_fortune_demo_wallets WHERE user_id = ? LIMIT 1").bind(userId).first<{ balance: number }>();
}
function randomIndex(max: number): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}
function playOne(stake: number) {
  const symbols = [SYMBOLS[randomIndex(8)], SYMBOLS[randomIndex(8)], SYMBOLS[randomIndex(8)]];
  let payout = 0;
  let outcome = "no-match";
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    payout = stake * TRIPLE_MULTIPLIERS[symbols[0]];
    outcome = "triple-match";
  } else if (symbols[0] === symbols[1] || symbols[0] === symbols[2] || symbols[1] === symbols[2]) {
    payout = Math.floor(stake * 1.125);
    outcome = "pair-match";
  }
  return { symbols, payout, outcome };
}
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Royal Fortune demo service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in to play Royal Fortune." }, 401);
  try {
    await ensureSchema(env.DB);
    const wallet = await getOrCreateWallet(env.DB, user.id);
    return json({ balance: Number(wallet?.balance ?? 0), mode: "demo", cashValue: false, initialCredits: 10000 });
  } catch (error) {
    console.error("[Royal Fortune] Load failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not load Royal Fortune demo balance." }, 500);
  }
};
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Royal Fortune demo service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in to play Royal Fortune." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Submit a valid game action." }, 400);
  const action = body.action === "buyBonus" ? "buyBonus" : body.action === "spin" ? "spin" : null;
  const bet = Number(body.bet);
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!action) return json({ error: "Unknown game action." }, 400);
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > 100) return json({ error: "Bet must be between 1 and 100 demo credits." }, 400);
  if (!/^[a-f0-9-]{16,64}$/i.test(requestId)) return json({ error: "Refresh the game and try again." }, 400);
  const stake = action === "buyBonus" ? bet * 100 : bet;
  try {
    await ensureSchema(env.DB);
    const wallet = await getOrCreateWallet(env.DB, user.id);
    const previous = await env.DB.prepare("SELECT result_json AS resultJson FROM royal_fortune_demo_rounds WHERE request_id = ? AND user_id = ? LIMIT 1").bind(requestId, user.id).first<{ resultJson: string }>();
    if (previous) {
      const balance = await getOrCreateWallet(env.DB, user.id);
      return json({ result: JSON.parse(previous.resultJson), balance: Number(balance?.balance ?? 0), replayed: true, cashValue: false });
    }
    const now = new Date().toISOString();
    const roundId = randomToken(16);
    let last = { symbols: ["crown", "gem", "coins"] as SymbolName[], payout: 0, outcome: "no-match" };
    let payout = 0;
    let bonusSpins = 0;
    if (action === "spin") {
      last = playOne(bet);
      payout = last.payout;
    } else {
      bonusSpins = 10;
      for (let i = 0; i < bonusSpins; i++) {
        const round = playOne(bet * 10);
        last = round;
        payout += round.payout;
      }
    }
    const result = { id: roundId, symbols: last.symbols, outcome: last.outcome, bet, stake, payout, mode: action, ...(action === "buyBonus" ? { bonusSpins } : {}) };
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO royal_fortune_demo_rounds (id, request_id, user_id, action, bet, stake, payout, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(roundId, requestId, user.id, action, bet, stake, payout, JSON.stringify(result), now).run();
    if (!inserted.meta.changes) {
      const duplicate = await env.DB.prepare("SELECT result_json AS resultJson FROM royal_fortune_demo_rounds WHERE request_id = ? AND user_id = ? LIMIT 1").bind(requestId, user.id).first<{ resultJson: string }>();
      const latest = await getOrCreateWallet(env.DB, user.id);
      return json({ result: duplicate ? JSON.parse(duplicate.resultJson) : result, balance: Number(latest?.balance ?? 0), replayed: true, cashValue: false });
    }
    const updated = await env.DB.prepare("UPDATE royal_fortune_demo_wallets SET balance = balance - ? + ?, updated_at = ? WHERE user_id = ? AND balance >= ?")
      .bind(stake, payout, now, user.id, stake).run();
    if (!updated.meta.changes) {
      await env.DB.prepare("DELETE FROM royal_fortune_demo_rounds WHERE id = ? AND user_id = ?").bind(roundId, user.id).run();
      return json({ error: "Not enough demo credits. Lower your bet or play more demo rounds." }, 409);
    }
    const latest = await getOrCreateWallet(env.DB, user.id);
    return json({ result, balance: Number(latest?.balance ?? 0), replayed: false, cashValue: false, message: "Demo result recorded." });
  } catch (error) {
    console.error("[Royal Fortune] Action failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not complete the demo action. Refresh and check your demo balance before retrying." }, 500);
  }
};
