import { Env, getUser, json, readJson, randomToken } from "../auth/_shared";

type SymbolId = "mask" | "idol" | "crystal" | "relic" | "scarab" | "crescent" | "blueGem" | "starGem" | "wild" | "scatter";
type EnvContext = { request: Request; env: Env };
const NORMAL: SymbolId[] = ["mask", "idol", "crystal", "relic", "scarab", "crescent", "blueGem", "starGem"];
const WEIGHTS: Record<SymbolId, number> = {
  mask: 8, idol: 9, crystal: 10, relic: 11, scarab: 12, crescent: 13, blueGem: 14, starGem: 15, wild: 3, scatter: 1
};
// Multipliers are per winning way, applied to the total spin bet. The current Monte Carlo
// model estimates about 95.7% total RTP including the expected value of 8-spin bonuses.
const PAY: Record<Exclude<SymbolId, "wild" | "scatter">, Record<3 | 4 | 5, number>> = {
  mask: { 3: 0.029, 4: 0.122, 5: 0.611 },
  idol: { 3: 0.029, 4: 0.122, 5: 0.611 },
  crystal: { 3: 0.029, 4: 0.122, 5: 0.611 },
  relic: { 3: 0.029, 4: 0.122, 5: 0.611 },
  scarab: { 3: 0.029, 4: 0.122, 5: 0.611 },
  crescent: { 3: 0.029, 4: 0.122, 5: 0.611 },
  blueGem: { 3: 0.029, 4: 0.122, 5: 0.611 },
  starGem: { 3: 0.029, 4: 0.122, 5: 0.611 }
};
const MAX_CASCADES = 5;
const MAX_WIN_MULTIPLIER = 250;
type Win = { symbol: Exclude<SymbolId, "wild" | "scatter">; count: number; ways: number; payout: number; positions: number[] };
type Step = { symbols: SymbolId[]; winningPositions: number[]; payout: number; wins: Win[] };

async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS moon_temple_demo_wallets (
    user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 1000 CHECK(balance >= 0),
    updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS moon_temple_demo_features (
    user_id TEXT PRIMARY KEY, free_spins INTEGER NOT NULL DEFAULT 0,
    free_spin_bet INTEGER NOT NULL DEFAULT 20, updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS moon_temple_demo_rounds (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,
    action TEXT NOT NULL, bet INTEGER NOT NULL, stake INTEGER NOT NULL,
    payout INTEGER NOT NULL DEFAULT 0, result_json TEXT NOT NULL, created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
}
async function wallet(db: D1Database, userId: string) {
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO moon_temple_demo_wallets (user_id,balance,updated_at) VALUES (?,1000,?)").bind(userId, now).run();
  return await db.prepare("SELECT balance FROM moon_temple_demo_wallets WHERE user_id = ?").bind(userId).first<{ balance: number }>();
}
async function feature(db: D1Database, userId: string) {
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO moon_temple_demo_features (user_id,updated_at) VALUES (?,?)").bind(userId, now).run();
  return await db.prepare("SELECT free_spins,free_spin_bet FROM moon_temple_demo_features WHERE user_id = ?").bind(userId).first<{ free_spins: number; free_spin_bet: number }>();
}
function randomIndex(max: number) { return Math.floor(Math.random() * max); }
function draw(): SymbolId {
  const entries = Object.entries(WEIGHTS) as [SymbolId, number][];
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let pick = Math.random() * total;
  for (const [symbol, weight] of entries) { pick -= weight; if (pick < 0) return symbol; }
  return "starGem";
}
function newGrid(): SymbolId[][] {
  return Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => draw()));
}
function flatten(grid: SymbolId[][]): SymbolId[] {
  return Array.from({ length: 4 }, (_, row) => Array.from({ length: 5 }, (_, col) => grid[col][row])).flat();
}
function evaluate(grid: SymbolId[][], bet: number): { payout: number; wins: Win[]; positions: number[] } {
  const wins: Win[] = [];
  const winning = new Set<number>();
  let payout = 0;
  for (const symbol of NORMAL) {
    const matchingRows: number[][] = [];
    for (let col = 0; col < 5; col++) {
      const rows = grid[col].map((value, row) => value === symbol || value === "wild" ? row : -1).filter(row => row >= 0);
      if (!rows.length) break;
      matchingRows.push(rows);
    }
    const count = matchingRows.length;
    if (count < 3) continue;
    const ways = matchingRows.reduce((product, rows) => product * rows.length, 1);
    const winPayout = Math.round(bet * PAY[symbol][count as 3 | 4 | 5] * ways);
    if (winPayout <= 0) continue;
    const positions: number[] = [];
    for (let col = 0; col < count; col++) for (const row of matchingRows[col]) {
      const position = row * 5 + col;
      winning.add(position);
      positions.push(position);
    }
    payout += winPayout;
    wins.push({ symbol, count, ways, payout: winPayout, positions });
  }
  return { payout, wins, positions: [...winning].sort((a, b) => a - b) };
}
function cascade(grid: SymbolId[][], positions: number[]): SymbolId[][] {
  const removed = new Set(positions);
  return grid.map((column, col) => {
    const survivors = column.filter((_, row) => !removed.has(row * 5 + col));
    const newSymbols = Array.from({ length: 4 - survivors.length }, () => draw());
    return [...newSymbols, ...survivors];
  });
}
function round(bet: number) {
  let grid = newGrid();
  const steps: Step[] = [];
  let payout = 0;
  let cascadeCount = 0;
  let firstScatterCount = grid.flat().filter(s => s === "scatter").length;
  for (let index = 0; index < MAX_CASCADES; index++) {
    const evaluated = evaluate(grid, bet);
    if (!evaluated.positions.length || evaluated.payout <= 0) break;
    steps.push({ symbols: flatten(grid), winningPositions: evaluated.positions, payout: evaluated.payout, wins: evaluated.wins });
    payout += evaluated.payout;
    cascadeCount++;
    if (index < MAX_CASCADES - 1) grid = cascade(grid, evaluated.positions);
  }
  const awardedFreeSpins = firstScatterCount >= 3 ? 8 : 0;
  return {
    symbols: flatten(grid), initialSymbols: flatten(steps.length ? gridFromStep(steps[0]) : grid),
    steps, payout: Math.min(payout, bet * MAX_WIN_MULTIPLIER), cascadeCount,
    awardedFreeSpins, scatterCount: firstScatterCount
  };
}
function gridFromStep(step: Step): SymbolId[][] {
  return Array.from({ length: 5 }, (_, col) => Array.from({ length: 4 }, (_, row) => step.symbols[row * 5 + col]));
}

export const onRequestGet = async ({ request, env }: EnvContext) => {
  const user = await getUser(request, env);
  if (!user) return json({ error: "Please log in to play." }, 401);
  await ensureSchema(env.DB);
  const current = await wallet(env.DB, user.id);
  const currentFeature = await feature(env.DB, user.id);
  return json({ balance: Number(current?.balance ?? 1000), freeSpins: Number(currentFeature?.free_spins ?? 0), freeSpinBet: Number(currentFeature?.free_spin_bet ?? 20) });
};

export const onRequestPost = async ({ request, env }: EnvContext) => {
  const user = await getUser(request, env);
  if (!user) return json({ error: "Please log in to play." }, 401);
  await ensureSchema(env.DB);
  const body = await readJson<{ action?: string; bet?: number; requestId?: string }>(request);
  const action = body.action || "spin";
  const now = new Date().toISOString();
  const current = await wallet(env.DB, user.id);
  const currentFeature = await feature(env.DB, user.id);
  if (!current) return json({ error: "Could not load demo balance." }, 500);

  if (action === "resetDemo") {
    await env.DB.prepare("UPDATE moon_temple_demo_wallets SET balance = 1000, updated_at = ? WHERE user_id = ?").bind(now, user.id).run();
    const refreshed = await wallet(env.DB, user.id);
    return json({ balance: Number(refreshed?.balance ?? 1000), freeSpins: Number(currentFeature?.free_spins ?? 0) });
  }
  if (action !== "spin") return json({ error: "Unsupported action." }, 400);
  const requestId = typeof body.requestId === "string" && body.requestId.length >= 8 ? body.requestId : randomToken();
  const existing = await env.DB.prepare("SELECT result_json FROM moon_temple_demo_rounds WHERE request_id = ? AND user_id = ?").bind(requestId, user.id).first<{ result_json: string }>();
  if (existing) {
    const prior = JSON.parse(existing.result_json) as Record<string, unknown>;
    const latest = await wallet(env.DB, user.id);
    return json({ result: prior, balance: Number(latest?.balance ?? 1000), freeSpins: Number((await feature(env.DB, user.id))?.free_spins ?? 0) });
  }

  const freeSpinsBefore = Number(currentFeature?.free_spins ?? 0);
  const isFreeSpin = freeSpinsBefore > 0;
  const requestedBet = isFreeSpin ? Number(currentFeature?.free_spin_bet ?? 20) : Number(body.bet ?? 20);\n  const bet = Math.max(20, Math.min(100, Math.round(requestedBet / 10) * 10));
  const stake = isFreeSpin ? 0 : bet;
  const balanceBefore = Number(current.balance);
  if (balanceBefore < stake) return json({ error: "Not enough demo credits. Reset your demo balance to $10.00." }, 400);
  const spinResult = round(bet);
  const payout = spinResult.payout;
  const freeSpinsAfter = Math.max(0, freeSpinsBefore - (isFreeSpin ? 1 : 0)) + spinResult.awardedFreeSpins;
  if (stake > 0) {
    const debit = await env.DB.prepare("UPDATE moon_temple_demo_wallets SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?").bind(stake, now, user.id, stake).run();
    if (!debit.meta.changes) return json({ error: "Balance changed. Please spin again." }, 409);
  }
  await env.DB.prepare("UPDATE moon_temple_demo_wallets SET balance = balance + ?, updated_at = ? WHERE user_id = ?").bind(payout, now, user.id).run();
  await env.DB.prepare("UPDATE moon_temple_demo_features SET free_spins = ?, free_spin_bet = ?, updated_at = ? WHERE user_id = ?").bind(freeSpinsAfter, bet, now, user.id).run();
  const result = { ...spinResult, id: randomToken(), bet, stake, payout, mode: isFreeSpin ? "freeSpin" : "spin", freeSpinsRemaining: freeSpinsAfter };
  await env.DB.prepare("INSERT INTO moon_temple_demo_rounds (id,request_id,user_id,action,bet,stake,payout,result_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(result.id, requestId, user.id, result.mode, bet, stake, payout, JSON.stringify(result), now).run();
  const updated = await wallet(env.DB, user.id);
  return json({ result, balance: Number(updated?.balance ?? balanceBefore - stake + payout), freeSpins: freeSpinsAfter });
};
