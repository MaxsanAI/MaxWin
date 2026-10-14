import { Env, getUser, json, readJson, randomToken } from "../auth/_shared";

type SymbolName = "crown" | "gem" | "shield" | "coins" | "star" | "flame" | "zap" | "coin" | "wild" | "scatter";
const SYMBOLS: SymbolName[] = ["crown", "gem", "shield", "coins", "star", "flame", "zap", "coin", "wild", "scatter"];

// Darežljivije isplate za demo: 3 simbola uvek vraćaju solidan deo ili više od uloga
const PAYOUTS: Record<Exclude<SymbolName, "wild" | "scatter">, { 3: number; 4: number; 5: number }> = {
  crown: { 3: 15, 4: 50, 5: 350 },
  gem: { 3: 12, 4: 40, 5: 280 },
  shield: { 3: 10, 4: 30, 5: 220 },
  coins: { 3: 8, 4: 20, 5: 160 },
  star: { 3: 6, 4: 15, 5: 130 },
  flame: { 3: 5, 4: 12, 5: 100 },
  zap: { 3: 3, 4: 8, 5: 70 },
  coin: { 3: 2, 4: 5, 5: 40 },
};

const PAYLINES: number[][] = [
  [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [3,3,3,3,3], [0,1,2,1,0],
  [3,2,1,2,3], [0,0,1,2,2], [3,3,2,1,1], [1,0,0,0,1], [2,3,3,3,2],
];

// Olabavljeni parametri za demo verziju
const DEMO_BUY_BONUS_MULTIPLIER = 30; // Jeftiniji Buy Bonus za demo (30x umesto 75x)
const MAX_WIN_MULTIPLIER = 500;       // Razuman limit za demo

async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_features (user_id TEXT PRIMARY KEY, free_spins INTEGER NOT NULL DEFAULT 0, free_spin_bet INTEGER NOT NULL DEFAULT 20, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  const featureColumns = await db.prepare("PRAGMA table_info(royal_fortune_demo_features)").all<{ name: string }>();
  if (!featureColumns.results.some(column => column.name === "free_spin_bet")) await db.prepare("ALTER TABLE royal_fortune_demo_features ADD COLUMN free_spin_bet INTEGER NOT NULL DEFAULT 20").run();
  
  await db.prepare("UPDATE royal_fortune_demo_features SET free_spins = 15 WHERE free_spins > 15").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_wallets (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 1000 CHECK (balance >= 0), updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS royal_fortune_demo_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL)`).run();
  await db.prepare("INSERT OR IGNORE INTO royal_fortune_demo_settings (setting_key, setting_value) VALUES ('initial_balance_v2', '1000')").run();
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
  // Povećana šansa za Scatter u demo modu na 3% po polju da se češće ulazi u bonus
  return Array.from({ length: 20 }, () => {
    if (randomIndex(1000) < 30) return "scatter";
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
    const lineSymbols = line.map((row, reel) => symbols[reel * 4 + row]);
    const firstRegular = lineSymbols.find(symbol => symbol !== "wild" && symbol !== "scatter");
    if (!firstRegular) return;

    let count = 0;
    for (const symbol of lineSymbols) {
      if (symbol !== firstRegular && symbol !== "wild") break;
      count++;
    }

    if (count < 3) return;
    const regular = firstRegular as Exclude<SymbolName, "wild" | "scatter">;
    
    // Računanje isplate: osiguravamo da čak i 3 slaba simbola vrate bar ulog ili više
    const rawPayout = lineBet * PAYOUTS[regular][count as 3 | 4 | 5];
    const linePayout = Math.max(Math.round(totalBet * 0.2), Math.floor(rawPayout));
    
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
    let wallet = await getOrCreateWallet(env.DB, user.id);
    if (Number(wallet?.balance ?? 0) <= 0) {
      await env.DB.prepare("UPDATE royal_fortune_demo_wallets SET balance = 1000, updated_at = ? WHERE user_id = ?").bind(new Date().toISOString(), user.id).run();
      wallet = await getOrCreateWallet(env.DB, user.id);
    }
    const features = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet FROM royal_fortune_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number; freeSpinBet: number }>();
    return json({ balance: Number(wallet?.balance ?? 1000), freeSpins: Number(features?.freeSpins ?? 0), freeSpinBet: Number(features?.freeSpinBet ?? 20), mode: "demo", cashValue: false, initialCredits: 1000 });
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

  if (body.action === "resetDemo") {
    try {
      await ensureSchema(env.DB);
      await getOrCreateWallet(env.DB, user.id);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE royal_fortune_demo_wallets SET balance = 1000, updated_at = ? WHERE user_id = ?").bind(now, user.id).run();
      return json({ reset: true, balance: 1000, mode: "demo", cashValue: false });
    } catch (error) {
      console.error("[Royal Fortune] Demo reset failed:", error instanceof Error ? error.message : String(error));
      return json({ error: "Could not reset demo credits. Please try again." }, 500);
    }
  }

  const action = body.action === "buyBonus" ? "buyBonus" : body.action === "spin" ? "spin" : null;
  const bet = Number(body.bet);
  const requestId = typeof body.requestId === "string" ? body.requestId : "";

  if (!action) return json({ error: "Unknown game action." }, 400);
  if (!Number.isSafeInteger(bet) || bet < 20 || bet > 100 || bet % 20 !== 0) return json({ error: "Bet must be $0.20 to $1.00 in $0.20 steps." }, 400);
  if (!/^[a-f0-9-]{16,64}$/i.test(requestId)) return json({ error: "Refresh the game and try again." }, 400);

  try {
    await ensureSchema(env.DB);
    await getOrCreateWallet(env.DB, user.id);

    const featureRow = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet FROM royal_fortune_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number; freeSpinBet: number }>();
    const freeSpinsBefore = Number(featureRow?.freeSpins ?? 0);
    const freeSpinBetBefore = Number(featureRow?.freeSpinBet ?? 20);

    const isFreeSpin = action === "spin" && freeSpinsBefore > 0;
    const effectiveBet = isFreeSpin ? freeSpinBetBefore : bet;
    const stake = action === "buyBonus" ? bet * DEMO_BUY_BONUS_MULTIPLIER : isFreeSpin ? 0 : bet;

    if (action === "buyBonus" && freeSpinsBefore > 0) return json({ error: "Finish your current free-spin feature before buying another bonus." }, 409);

    const previous = await env.DB.prepare("SELECT result_json AS resultJson FROM royal_fortune_demo_rounds WHERE request_id = ? AND user_id = ? LIMIT 1").bind(requestId, user.id).first<{ resultJson: string }>();
    if (previous) {
      const balance = await getOrCreateWallet(env.DB, user.id);
      const currentFeatures = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet FROM royal_fortune_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number; freeSpinBet: number }>();
      return json({ result: JSON.parse(previous.resultJson), balance: Number(balance?.balance ?? 0), freeSpins: Number(currentFeatures?.freeSpins ?? 0), freeSpinBet: Number(currentFeatures?.freeSpinBet ?? 20), replayed: true, cashValue: false });
    }

    const now = new Date().toISOString();
    const roundId = randomToken(16);

    let last = playOne(effectiveBet);
    let payout = 0;
    let bonusSpins = 0;
    let awardedFreeSpins = 0;
    let freeSpinsAfter = freeSpinsBefore;
    let freeSpinBetAfter = freeSpinBetBefore;

    let resultSymbols = last.symbols;
    let resultOutcome = last.outcome;
    let resultWins = last.wins;
    let resultWinningPositions = last.winningPositions;

    const bonusBreakdown: { spin: number; symbols: SymbolName[]; payout: number; wins: typeof last.wins; winningPositions: number[]; outcome: string }[] = [];

    if (action === "spin") {
      payout = last.payout;
      if (isFreeSpin) freeSpinsAfter = Math.max(0, freeSpinsBefore - 1);

      awardedFreeSpins = freeSpinsBefore > 0 ? 0 : last.awardedFreeSpins;
      freeSpinsAfter += awardedFreeSpins;
      if (awardedFreeSpins > 0) freeSpinBetAfter = effectiveBet;
    } else {
      awardedFreeSpins = randomIndex(2) === 0 ? 8 : 12;
      bonusSpins = awardedFreeSpins;

      const triggerSymbols = spinReels().map(symbol => symbol === "scatter" ? "crown" : symbol);
      const triggerPositions = Array.from({ length: 20 }, (_, index) => index);
      for (let i = triggerPositions.length - 1; i > 0; i--) {
        const j = randomIndex(i + 1);
        [triggerPositions[i], triggerPositions[j]] = [triggerPositions[j], triggerPositions[i]];
      }
      triggerPositions.slice(0, awardedFreeSpins === 8 ? 3 : 4).forEach(position => { triggerSymbols[position] = "scatter"; });

      resultSymbols = triggerSymbols;
      resultOutcome = "bonus-trigger";
      resultWins = [];
      resultWinningPositions = [];

      for (let i = 0; i < bonusSpins; i++) {
        last = playOne(bet);
        payout += last.payout;
        bonusBreakdown.push({
          spin: i + 1,
          symbols: last.symbols,
          payout: last.payout,
          wins: last.wins,
          winningPositions: last.winningPositions,
          outcome: last.outcome,
        });
      }
    }

    const maxPayoutCap = effectiveBet * MAX_WIN_MULTIPLIER;
    if (payout > maxPayoutCap) {
      payout = maxPayoutCap;
    }

    const result = {
      id: roundId,
      symbols: resultSymbols,
      outcome: resultOutcome,
      bet,
      stake,
      payout,
      mode: action,
      wins: resultWins,
      winningPositions: resultWinningPositions,
      awardedFreeSpins,
      freeSpinsRemaining: freeSpinsAfter,
      ...(action === "buyBonus" ? { bonusSpins, bonusBreakdown } : {}),
    };

    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO royal_fortune_demo_rounds (id, request_id, user_id, action, bet, stake, payout, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(roundId, requestId, user.id, action, effectiveBet, stake, payout, JSON.stringify(result), now).run();
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

    await env.DB.prepare("INSERT INTO royal_fortune_demo_features (user_id, free_spins, free_spin_bet, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET free_spins = excluded.free_spins, free_spin_bet = excluded.free_spin_bet, updated_at = excluded.updated_at").bind(user.id, freeSpinsAfter, freeSpinBetAfter, now).run();

    let latest = await getOrCreateWallet(env.DB, user.id);
    if (Number(latest?.balance ?? 0) <= 0) {
      await env.DB.prepare("UPDATE royal_fortune_demo_wallets SET balance = 1000, updated_at = ? WHERE user_id = ?").bind(new Date().toISOString(), user.id).run();
      latest = await getOrCreateWallet(env.DB, user.id);
    }
    return json({ result, balance: Number(latest?.balance ?? 1000), freeSpins: freeSpinsAfter, freeSpinBet: freeSpinBetAfter, replayed: false, cashValue: false, message: "Demo result recorded." });
  } catch (error) {
    console.error("[Royal Fortune] Action failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not complete the demo action. Refresh and check your demo balance before retrying." }, 500);
  }
};
