import { Env, getUser, json, readJson, randomToken } from "../auth/_shared";

type SymbolName = "crown" | "gem" | "shield" | "coins" | "star" | "flame" | "zap" | "coin";
const SYMBOLS: SymbolName[] = ["crown", "gem", "shield", "coins", "star", "flame", "zap", "coin"];
const PAYOUTS: Record<SymbolName, { 3: number; 4: number; 5: number }> = {
  crown: { 3: 60, 4: 300, 5: 3250 },
  gem: { 3: 45, 4: 225, 5: 2450 },
  shield: { 3: 35, 4: 175, 5: 1900 },
  coins: { 3: 25, 4: 125, 5: 1400 },
  star: { 3: 20, 4: 100, 5: 1100 },
  flame: { 3: 15, 4: 75, 5: 850 },
  zap: { 3: 10, 4: 50, 5: 600 },
  coin: { 3: 5, 4: 25, 5: 350 },
};
const PAYLINES: number[][] = [
  [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
  [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [0,1,1,1,0],
];

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
  const limit = Math.floor(0x100000000 / max) * max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}
function spinReels() {
  return Array.from({ length: 15 }, () => SYMBOLS[randomIndex(SYMBOLS.length)]);
}
function evaluate(symbols: SymbolName[], totalBet: number) {
  const lineBet = totalBet / PAYLINES.length;
  let payout = 0;
  const wins: { line: number; symbol: SymbolName; count: number; payout: number; positions: number[] }[] = [];
  const winningPositions = new Set<number>();
  PAYLINES.forEach((line, lineIndex) => {
    const first = symbols[line[0]];
    let count = 1;
    for (let reel = 1; reel < 5; reel++) {
      if (symbols[reel * 3 + line[reel]] !== first) break;
      count++;
    }
    if (count < 3) return;
    const linePayout = Math.floor(lineBet * PAYOUTS[first][count as 3 | 4 | 5]);
    if (linePayout <= 0) return;
    const positions = Array.from({ length: count }, (_, reel) => reel * 3 + line[reel]);
    positions.forEach(position => winningPositions.add(position));
    wins.push({ line: lineIndex + 1, symbol: first, count, payout: linePayout, positions });
    payout += linePayout;
  });
  return { payout, wins, winningPositions: [...winningPositions], outcome: wins.length ? "line-win" : "no-match" };
}
function playOne(totalBet: number) {
  const symbols = spinReels();
  const evaluated = evaluate(symbols, totalBet);
  return { symbols, ...evaluated };
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
  if (!Number.isSafeInteger(bet) || bet < 10 || bet > 100 || bet % 10 !== 0) return json({ error: "Bet must be 10 to 100 demo credits in steps of 10." }, 400);
  if (!/^[a-f0-9-]{16,64}$/i.test(requestId)) return json({ error: "Refresh the game and try again." }, 400);
  const stake = action === "buyBonus" ? bet * 100 : bet;
  try {
    await ensureSchema(env.DB);
    await getOrCreateWallet(env.DB, user.id);
    const previous = await env.DB.prepare("SELECT result_json AS resultJson FROM royal_fortune_demo_rounds WHERE request_id = ? AND user_id = ? LIMIT 1").bind(requestId, user.id).first<{ resultJson: string }>();
    if (previous) {
      const balance = await getOrCreateWallet(env.DB, user.id);
      return json({ result: JSON.parse(previous.resultJson), balance: Number(balance?.balance ?? 0), replayed: true, cashValue: false });
    }
    const now = new Date().toISOString();
    const roundId = randomToken(16);
    let last = { symbols: spinReels(), payout: 0, wins: [] as { line: number; symbol: SymbolName; count: number; payout: number; positions: number[] }[], winningPositions: [] as number[], outcome: "no-match" };
    let payout = 0;
    const bonusSpins = action === "buyBonus" ? 10 : 0;
    if (action === "spin") {
      last = playOne(bet);
      payout = last.payout;
    } else {
      for (let i = 0; i < bonusSpins; i++) {
        const round = playOne(bet * 10);
        last = round;
        payout += round.payout;
      }
    }
    const result = { id: roundId, symbols: last.symbols, outcome: last.outcome, bet, stake, payout, mode: action, wins: last.wins, winningPositions: last.winningPositions, ...(action === "buyBonus" ? { bonusSpins } : {}) };
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
