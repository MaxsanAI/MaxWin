import { BOOK_OF_SUNRISE_MATH } from "../../../src/lib/bookOfSunriseMath";
import { Env, getUser, json, readJson, randomToken } from "../auth/_shared";

type SymbolName = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
const REGULAR_SYMBOLS: SymbolName[] = ["pharaoh", "anubis", "scarab", "statue", "ace", "king", "queen", "jack", "ten"];
const ALL_SYMBOLS: SymbolName[] = ["book", ...REGULAR_SYMBOLS];

// Tabela isplata po liniji (množi se sa betPerLine)
const PAYOUTS: Record<Exclude<SymbolName, "book">, { 2?: number; 3: number; 4: number; 5: number }> =
  BOOK_OF_SUNRISE_MATH.payouts as Record<Exclude<SymbolName, "book">, { 2?: number; 3: number; 4: number; 5: number }>;

// 10 Klasičnih dobitnih linija na 5x3 mreži (3 reda, 5 kolona)
const PAYLINES: number[][] = [
  [1,1,1,1,1], // Sredina
  [0,0,0,0,0], // Vrh
  [2,2,2,2,2], // Dno
  [0,1,2,1,0], // V oblik
  [2,1,0,1,2], // Obrnuti V
  [0,0,1,2,2],
  [2,2,1,0,0],
  [1,2,2,2,1],
  [1,0,0,0,1],
  [0,1,1,1,0]
];

const BUY_BONUS_MULTIPLIER = BOOK_OF_SUNRISE_MATH.buyBonusMultiplier;
const MAX_WIN_MULTIPLIER = BOOK_OF_SUNRISE_MATH.maxWinMultiplier;

async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_demo_features (
    user_id TEXT PRIMARY KEY,
    free_spins INTEGER NOT NULL DEFAULT 0,
    free_spin_bet INTEGER NOT NULL DEFAULT 20,
    expanding_symbol TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_demo_wallets (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 1000 CHECK (balance >= 0),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_demo_rounds (
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
}

async function getOrCreateWallet(db: D1Database, userId: string) {
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO book_of_ra_demo_wallets (user_id, balance, updated_at) VALUES (?, 1000, ?)").bind(userId, now).run();
  return db.prepare("SELECT balance FROM book_of_ra_demo_wallets WHERE user_id = ? LIMIT 1").bind(userId).first<{ balance: number }>();
}

function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}

function randomRegularSymbol(): Exclude<SymbolName, "book"> {
  const weights = BOOK_OF_SUNRISE_MATH.regularSymbolWeights;
  const total = REGULAR_SYMBOLS.reduce((sum, symbol) => sum + weights[symbol], 0);
  let roll = randomIndex(total);
  for (const symbol of REGULAR_SYMBOLS) {
    roll -= weights[symbol];
    if (roll < 0) return symbol;
  }
  return REGULAR_SYMBOLS[REGULAR_SYMBOLS.length - 1];
}

function spinReels(): SymbolName[] {
  // 15 independent cells. Keep the same chance rule as the tuner config.
  return Array.from({ length: 15 }, (_, index) => {
    const bookChance = index < 9
      ? BOOK_OF_SUNRISE_MATH.bookHuntProbabilityPer1000
      : BOOK_OF_SUNRISE_MATH.bookProbabilityPer1000;
    if (randomIndex(1000) < bookChance) return "book";
    return randomRegularSymbol();
  });
}

function evaluate(symbols: SymbolName[], totalBet: number, expandingSymbol?: SymbolName | null, isFreeSpin = false) {
  const lineBet = totalBet / PAYLINES.length;
  const payoutTable = (isFreeSpin ? BOOK_OF_SUNRISE_MATH.freeSpinPayouts : BOOK_OF_SUNRISE_MATH.payouts) as Record<Exclude<SymbolName, "book">, { 3: number; 4: number; 5: number }>;
  let payout = 0;
  const wins: { line: number; symbol: SymbolName; count: number; payout: number; positions: number[] }[] = [];
  const winningPositions = new Set<number>();

  // 1. Regularno ocenjivanje linija s leve na desno (Knjiga deluje kao WILD za obične simbole)
  PAYLINES.forEach((line, lineIndex) => {
    const lineSymbols = line.map((row, reel) => symbols[reel * 3 + row]);
    const firstRegular = lineSymbols.find(s => s !== "book");
    if (!firstRegular) return;

    let count = 0;
    for (const symbol of lineSymbols) {
      if (symbol !== firstRegular && symbol !== "book") break;
      count++;
    }

    const regKey = firstRegular as Exclude<SymbolName, "book">;
    const minCount = 3;
    if (count < minCount) return;

    const hasBookInRun = lineSymbols.slice(0, count).includes("book");
    const regularMatches = lineSymbols.slice(0, count).filter(symbol => symbol === regKey).length;
    // A Book wild plus two matching regular symbols pays 2x total bet.
    const mult = count === 3 && hasBookInRun && regularMatches === 2
      ? 2
      : payoutTable[regKey][count as 3 | 4 | 5] || 0;
    const linePayout = Math.floor(totalBet * mult);
    if (linePayout <= 0) return;

    const positions = Array.from({ length: count }, (_, reel) => reel * 3 + line[reel]);
    positions.forEach(p => winningPositions.add(p));
    wins.push({ line: lineIndex + 1, symbol: regKey, count, payout: linePayout, positions });
    payout += linePayout;
  });

  // 2. Širenje simbola u Free Spins (Expanding Symbol)
  if (expandingSymbol) {
    const reelHasExpanding = [0,1,2,3,4].map(reel => {
      for (let row = 0; row < 3; row++) {
        if (symbols[reel * 3 + row] === expandingSymbol) return true;
      }
      return false;
    });

    const expandCount = reelHasExpanding.filter(Boolean).length;
    const regKey = expandingSymbol as Exclude<SymbolName, "book">;
    // Expanding Symbol activates only on three or more reels, consistently with the slot animation.
    const minCount = 3;

    if (expandCount >= minCount) {
      const mult = payoutTable[regKey][expandCount as 3 | 4 | 5] || 0;
      // Isplaćuje se na svih 10 linija kada se proširi; Free Spins use their own table.
      const baseExpandPayout = Math.floor(lineBet * mult * PAYLINES.length);
      const expandPayout = Math.floor(baseExpandPayout * BOOK_OF_SUNRISE_MATH.expandingSymbolPayoutMultiplier);
      payout += expandPayout;

      reelHasExpanding.forEach((has, reel) => {
        if (has) {
          for (let row = 0; row < 3; row++) winningPositions.add(reel * 3 + row);
        }
      });
      wins.push({ line: 0, symbol: expandingSymbol, count: expandCount, payout: expandPayout, positions: [...winningPositions] });
    }
  }

  // 3. Scatter Isplata za Knjige
  const bookCount = symbols.filter(s => s === "book").length;
  if (bookCount >= 3) {
    const scatterMult = bookCount === 3 ? BOOK_OF_SUNRISE_MATH.scatterPayoutByBookCount.threeBooks : bookCount === 4 ? BOOK_OF_SUNRISE_MATH.scatterPayoutByBookCount.fourBooks : BOOK_OF_SUNRISE_MATH.scatterPayoutByBookCount.fivePlusBooks;
    const baseScatterPayout = Math.floor(totalBet * scatterMult);
    const scatterPayout = baseScatterPayout;
    payout += scatterPayout;
  }

  return { payout, wins, winningPositions: [...winningPositions], outcome: wins.length ? "win" : "no-match" };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Service not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in required." }, 401);

  try {
    await ensureSchema(env.DB);
    const wallet = await getOrCreateWallet(env.DB, user.id);
    const features = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet, expanding_symbol AS expandingSymbol FROM book_of_ra_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number; freeSpinBet: number; expandingSymbol: SymbolName }>();

    return json({
      balance: Number(wallet?.balance ?? 0),
      freeSpins: Number(features?.freeSpins ?? 0),
      freeSpinBet: Number(features?.freeSpinBet ?? 20),
      expandingSymbol: features?.expandingSymbol || null,
      mode: "demo"
    });
  } catch (error) {
    return json({ error: "Could not load balance." }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Service not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in required." }, 401);

  const body = await readJson(request);
  if (!body) return json({ error: "Invalid payload." }, 400);

  // Legacy clients may still call resetDemo when leaving the slot.
  // Never reset persistent credits or bonus progress when a player leaves.
  if (body.action === "resetDemo") {
    try {
      await ensureSchema(env.DB);
      const wallet = await getOrCreateWallet(env.DB, user.id);
      const features = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet, expanding_symbol AS expandingSymbol FROM book_of_ra_demo_features WHERE user_id = ? LIMIT 1")
        .bind(user.id).first<{ freeSpins: number; freeSpinBet: number; expandingSymbol: SymbolName | null }>();
      return json({
        ok: true,
        balance: Number(wallet?.balance ?? 0),
        freeSpins: Number(features?.freeSpins ?? 0),
        freeSpinBet: Number(features?.freeSpinBet ?? 20),
        expandingSymbol: features?.expandingSymbol || null,
        mode: "demo"
      });
    } catch {
      return json({ error: "Could not reload demo wallet." }, 500);
    }
  }

  const action = body.action === "buyBonus" ? "buyBonus" : body.action === "spin" ? "spin" : null;
  const bet = Number(body.bet);
  const requestId = typeof body.requestId === "string" ? body.requestId : "";

  if (!action) return json({ error: "Unknown action." }, 400);
  if (!Number.isSafeInteger(bet) || bet < 20 || bet > 100 || bet % 10 !== 0) return json({ error: "Invalid bet." }, 400);

  try {
    await ensureSchema(env.DB);
    await getOrCreateWallet(env.DB, user.id);

    const featureRow = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet, expanding_symbol AS expandingSymbol FROM book_of_ra_demo_features WHERE user_id = ? LIMIT 1").bind(user.id).first<{ freeSpins: number; freeSpinBet: number; expandingSymbol: SymbolName }>();

    const freeSpinsBefore = Number(featureRow?.freeSpins ?? 0);
    const freeSpinBetBefore = Math.max(20, Math.min(100, Number(featureRow?.freeSpinBet ?? 20)));
    let activeExpanding = featureRow?.expandingSymbol || null;

    const isFreeSpin = action === "spin" && freeSpinsBefore > 0;
    const effectiveBet = isFreeSpin ? freeSpinBetBefore : bet;
    const stake = action === "buyBonus" ? bet * BUY_BONUS_MULTIPLIER : isFreeSpin ? 0 : bet;

    const now = new Date().toISOString();
    const roundId = randomToken(16);

    let symbols = spinReels();
    let awardedFreeSpins = 0;
    let freeSpinsAfter = freeSpinsBefore;
    let freeSpinBetAfter = freeSpinBetBefore;

    if (action === "buyBonus") {
      // Garantuje 3 Scatter Knjige na nasumičnim pozicijama za okidanje
      symbols[0] = "book"; symbols[5] = "book"; symbols[10] = "book";
    }

    const bookCount = symbols.filter(s => s === "book").length;
    if (bookCount >= 3) {
      awardedFreeSpins = bookCount >= 5 ? BOOK_OF_SUNRISE_MATH.freeSpinsByBookCount.fivePlusBooks : bookCount === 4 ? BOOK_OF_SUNRISE_MATH.freeSpinsByBookCount.fourBooks : BOOK_OF_SUNRISE_MATH.freeSpinsByBookCount.threeBooks;
      if (!isFreeSpin) {
        // Izbor nasumičnog širećeg simbola pri aktivaciji
        activeExpanding = REGULAR_SYMBOLS[randomIndex(REGULAR_SYMBOLS.length)];
      }
    }

    if (isFreeSpin) {
      freeSpinsAfter = Math.max(0, freeSpinsBefore - 1);
    }
    freeSpinsAfter += awardedFreeSpins;
    if (awardedFreeSpins > 0 && !isFreeSpin) {
      freeSpinBetAfter = effectiveBet;
    }

    const evaluated = evaluate(symbols, effectiveBet, isFreeSpin ? activeExpanding : null, isFreeSpin);
    let payout = evaluated.payout;

    // Protection cap
    const maxPayoutCap = effectiveBet * MAX_WIN_MULTIPLIER;
    if (payout > maxPayoutCap) payout = maxPayoutCap;

    if (freeSpinsAfter === 0) activeExpanding = null;

    const result = {
      id: roundId,
      symbols,
      outcome: evaluated.outcome,
      bet,
      stake,
      payout,
      mode: action,
      wins: evaluated.wins,
      winningPositions: evaluated.winningPositions,
      awardedFreeSpins,
      freeSpinsRemaining: freeSpinsAfter,
      expandingSymbol: activeExpanding
    };

    // Upis u bazu
    await env.DB.prepare("INSERT INTO book_of_ra_demo_rounds (id, request_id, user_id, action, bet, stake, payout, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(roundId, requestId, user.id, action, effectiveBet, stake, payout, JSON.stringify(result), now).run();
    await env.DB.prepare("UPDATE book_of_ra_demo_wallets SET balance = balance - ? + ?, updated_at = ? WHERE user_id = ? AND balance >= ?").bind(stake, payout, now, user.id, stake).run();
    await env.DB.prepare("INSERT INTO book_of_ra_demo_features (user_id, free_spins, free_spin_bet, expanding_symbol, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET free_spins = excluded.free_spins, free_spin_bet = excluded.free_spin_bet, expanding_symbol = excluded.expanding_symbol, updated_at = excluded.updated_at").bind(user.id, freeSpinsAfter, freeSpinBetAfter, activeExpanding, now).run();

    const wallet = await getOrCreateWallet(env.DB, user.id);
    return json({ result, balance: Number(wallet?.balance ?? 0), freeSpins: freeSpinsAfter, freeSpinBet: freeSpinBetAfter, expandingSymbol: activeExpanding });
  } catch (error) {
    return json({ error: "Spin failed." }, 500);
  }
};
