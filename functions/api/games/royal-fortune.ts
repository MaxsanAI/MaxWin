import { Env, getUser, json, readJson, randomToken } from "../auth/_shared";

type SymbolName = "crown" | "gem" | "shield" | "coins" | "star" | "flame" | "zap" | "coin" | "wild" | "scatter";
const SYMBOLS: SymbolName[] = ["crown", "gem", "shield", "coins", "star", "flame", "zap", "coin", "wild", "scatter"];
const PAYOUTS: Record<Exclude<SymbolName, "wild" | "scatter">, { 3: number; 4: number; 5: number }> = {
  crown: { 3: 60, 4: 300, 5: 3250 }, gem: { 3: 45, 4: 225, 5: 2450 },
  shield: { 3: 35, 4: 175, 5: 1900 }, coins: { 3: 25, 4: 125, 5: 1400 },
  star: { 3: 20, 4: 100, 5: 1100 }, flame: { 3: 15, 4: 75, 5: 850 },
  zap: { 3: 10, 4: 50, 5: 600 }, coin: { 3: 5, 4: 25, 5: 350 },
};
const PAYLINES: number[][] = [
  [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [3,3,3,3,3], [0,1,2,1,0],
  [3,2,1,2,3], [0,0,1,2,2], [3,3,2,1,1], [1,0,0,0,1], [2,3,3,3,2],
];
async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_features (user_id TEXT PRIMARY KEY, free_spins INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  // Repair inflated balances created by the previous overly-frequent scatter bug.
  await db.prepare("UPDATE royal_fortune_demo_features SET free_spins = 8 WHERE free_spins > 8").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_wallets (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 1000 CHECK (balance >= 0), updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL)`).run();
  const demoBalanceMigration = await db.prepare("INSERT OR IGNORE INTO royal_fortune_demo_settings (setting_key, setting_value) VALUES ('initial_balance_v2', '1000')").run();
  if (demoBalanceMigration.meta.changes > 0) await db.prepare("UPDATE royal_fortune_demo_wallets SET balance = 1000, updated_at = ? WHERE balance = 10000").bind(new Date().toISOString()).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_rounds (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('spin','buyBonus')), bet INTEGER NOT NULL, stake INTEGER NOT NULL, payout INTEGER NOT NULL DEFAULT 0, result_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_royal_fortune_rounds_user_created ON royal_fortune_demo_rounds(user_id, created_at DESC)").run();
}
async function getOrCreateWallet(db: D1Database, userId: string) {
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO royal_fortune_demo_wallets (user_id, balance, updated_at) VALUES (?, 1000, ?)").bind(userId, now).run();
  return db.prepare("SELECT balance FROM royal_fortune_demo_wallets WHERE user_id = ? LIMIT 1").bind(userId).first<{ balance: number }>();
}
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}
function spinReels(): SymbolName[] {
  // Scatter is intentionally rare: 2.5% per cell, instead of the old 10% chance.
  // The other symbols share the remaining probability evenly.
  return Array.from({ length: 20 }, () => {
    if (randomIndex(1000) < 25) return "scatter";
    const regularSymbols = SYMBOLS.filter(symbol => symbol !== "scatter");
    return regularSymbols[randomIndex(regularSymbols.length)];
  });
}
function evaluate(symbols: SymbolName[], totalBet: number) {
  const lineBet = totalBet / PAYLINES.length;
  let payout = 0;
  const wins: { line: number; symbol: SymbolName; count: number; payout: number; positions: number[] }[] = [];
  const winningPositions = new Set<number>();
  PAYLINES.forEach((line, lineIndex) => {
    // Read the five symbols on this payline from left to right.
    const lineSymbols = line.map((row, reel) => symbols[reel * 4 + row]);
    // WILD may lead a line; find the first regular symbol it can substitute for.
    const firstRegular = lineSymbols.find(symbol => symbol !== "wild" && symbol !== "scatter");
    if (!firstRegular) return;
    let count = 0;
    for (const symbol of lineSymbols) {
      if (symbol !== firstRegular && symbol !== "wild") break;
      count++;
    }
    if (count < 3) return;
    const regular = firstRegular as Exclude<SymbolName, "wild" | "scatter">;
    const linePayout = Math.floor(lineBet * PAYOUTS[regular][count as 3 | 4 | 5]);
    if (linePayout <= 0) return;
    const positions = Array.from({ length: count }, (_, reel) => reel * 4 + line[reel]);
    positions.forEach(position => winningPositions.add(position));
    wins.push({ line: lineIndex + 1, symbol: regular, count, payout: linePayout, positions });
    payout += linePayout;
  });
  return { payout, wins, winningPositions: [...winningPositions], outcome: wins.length ? "line-win" : "no-match" };
}
function playOne(totalBet: number) {
  const symbols = spinReels();
  const evaluated = evaluate(symbols, totalBet);
  const scatterCount = symbols.filter(s => s === "scatter").length;
  const awardedFreeSpins = scatterCount >= 5 ? 15 : scatterCount === 4 ? 12 : scatterCount === 3 ? 8 : 0;
  return { symbols, ...evaluated, scatterCount, awardedFreeSpins };
}
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Royal Fortune demo service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in to play Royal Fortune." }, 401);
  try {
    await ensureSchema(env.DB);
    const wallet = await getOrCreateWallet(env.DB, user.id);
    const features = await env.DB.prepare("SELECT free_spins AS freeSpins FROM royal_fortune_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number }>();
    return json({ balance: Number(wallet?.balance ?? 0), freeSpins: Number(features?.freeSpins ?? 0), mode: "demo", cashValue: false, initialCredits: 1000 });
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
  if (!Number.isSafeInteger(bet) || bet < 5 || bet > 100 || bet % 5 !== 0) return json({ error: "Bet must be 5 to 100 demo credits in steps of 5." }, 400);
  if (!/^[a-f0-9-]{16,64}$/i.test(requestId)) return json({ error: "Refresh the game and try again." }, 400);
  try {
    await ensureSchema(env.DB);
    await getOrCreateWallet(env.DB, user.id);
    const featureRow = await env.DB.prepare("SELECT free_spins AS freeSpins FROM royal_fortune_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number }>();
    const freeSpinsBefore = Number(featureRow?.freeSpins ?? 0);
    const isFreeSpin = action === "spin" && freeSpinsBefore > 0;
    const stake = action === "buyBonus" ? bet * 100 : isFreeSpin ? 0 : bet;
    const previous = await env.DB.prepare("SELECT result_json AS resultJson FROM royal_fortune_demo_rounds WHERE request_id = ? AND user_id = ? LIMIT 1").bind(requestId, user.id).first<{ resultJson: string }>();
    if (previous) {
      const balance = await getOrCreateWallet(env.DB, user.id);
      const currentFeatures = await env.DB.prepare("SELECT free_spins AS freeSpins FROM royal_fortune_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number }>();
      return json({ result: JSON.parse(previous.resultJson), balance: Number(balance?.balance ?? 0), freeSpins: Number(currentFeatures?.freeSpins ?? 0), replayed: true, cashValue: false });
    }
    const now = new Date().toISOString();
    const roundId = randomToken(16);
    let last = playOne(bet);
    let payout = 0;
    const bonusSpins = action === "buyBonus" ? 10 : 0;
    let awardedFreeSpins = 0;
    let freeSpinsAfter = freeSpinsBefore;
    if (action === "spin") {
      payout = last.payout;
      if (isFreeSpin) freeSpinsAfter = Math.max(0, freeSpinsBefore - 1);
      // No scatter retriggers while a free-spin feature is already active.
      // Once the feature is fully used, a later paid spin can trigger it again.
      awardedFreeSpins = freeSpinsBefore > 0 ? 0 : last.awardedFreeSpins;
      freeSpinsAfter += awardedFreeSpins;
    } else {
      for (let i = 0; i < bonusSpins; i++) {
        last = playOne(bet * 10);
        payout += last.payout;
        // A bonus purchase may award at most one free-spin feature, and only
        // when no free spins were already waiting.
        if (freeSpinsBefore === 0 && freeSpinsAfter === 0 && last.awardedFreeSpins > 0) {
          freeSpinsAfter += last.awardedFreeSpins;
          awardedFreeSpins = last.awardedFreeSpins;
        }
      }
    }
    const result = { id: roundId, symbols: last.symbols, outcome: last.outcome, bet, stake, payout, mode: action, wins: last.wins, winningPositions: last.winningPositions, awardedFreeSpins, freeSpinsRemaining: freeSpinsAfter, ...(action === "buyBonus" ? { bonusSpins } : {}) };
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO royal_fortune_demo_rounds (id, request_id, user_id, action, bet, stake, payout, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(roundId, requestId, user.id, action, bet, stake, payout, JSON.stringify(result), now).run();
    if (!inserted.meta.changes) {
      const duplicate = await env.DB.prepare("SELECT result_json AS resultJson FROM royal_fortune_demo_rounds WHERE request_id = ? AND user_id = ? LIMIT 1").bind(requestId, user.id).first<{ resultJson: string }>();
      const latest = await getOrCreateWallet(env.DB, user.id);
      return json({ result: duplicate ? JSON.parse(duplicate.resultJson) : result, balance: Number(latest?.balance ?? 0), replayed: true, cashValue: false });
    }
    const updated = await env.DB.prepare("UPDATE royal_fortune_demo_wallets SET balance = balance - ? + ?, updated_at = ? WHERE user_id = ? AND balance >= ?").bind(stake, payout, now, user.id, stake).run();
    if (!updated.meta.changes) {
      await env.DB.prepare("DELETE FROM royal_fortune_demo_rounds WHERE id = ? AND user_id = ?").bind(roundId, user.id).run();
      return json({ error: "Not enough demo credits. Lower your bet or play more demo rounds." }, 409);
    }
    await env.DB.prepare("INSERT INTO royal_fortune_demo_features (user_id, free_spins, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET free_spins = excluded.free_spins, updated_at = excluded.updated_at").bind(user.id, freeSpinsAfter, now).run();
    const latest = await getOrCreateWallet(env.DB, user.id);
    return json({ result, balance: Number(latest?.balance ?? 0), freeSpins: freeSpinsAfter, replayed: false, cashValue: false, message: "Demo result recorded." });
  } catch (error) {
    console.error("[Royal Fortune] Action failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not complete the demo action. Refresh and check your demo balance before retrying." }, 500);
  }
};
