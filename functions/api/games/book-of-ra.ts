import { BOOK_OF_SUNRISE_MATH } from "../../../src/lib/bookOfSunriseMath";
import { Env, ensureWalletSchema, getUser, json, readJson, randomToken } from "../auth/_shared";
import { getSolUsd } from "../_shared/sol-price";

type SymbolName = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
const REGULAR_SYMBOLS: SymbolName[] = ["pharaoh", "anubis", "scarab", "statue", "ace", "king", "queen", "jack", "ten"];
const ALL_SYMBOLS: SymbolName[] = ["book", ...REGULAR_SYMBOLS];

// Paytable multipliers use total bet for regular wins, matching the displayed paytable.
const PAYOUTS: Record<Exclude<SymbolName, "book">, { 2?: number; 3: number; 4: number; 5: number }> =
  BOOK_OF_SUNRISE_MATH.payouts as Record<Exclude<SymbolName, "book">, { 2?: number; 3: number; 4: number; 5: number }>;

// 5 fixed paylines on the 5x3 grid: three horizontal and two diagonals.
const PAYLINES: number[][] = [
  [1,1,1,1,1], // Middle horizontal
  [0,0,0,0,0], // Top horizontal
  [2,2,2,2,2], // Bottom horizontal
  [0,1,2,1,0], // V shape
  [2,1,0,1,2]  // Inverted V
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

type PaylineWin = { line: number; symbol: Exclude<SymbolName, "book">; count: number; payout: number; positions: number[] };
type Paytable = Record<Exclude<SymbolName, "book">, { 3: number; 4: number; 5: number }>;
const MIN_PAYLINE_MATCHES = 3;

/**
 * Evaluate one fixed payline only. A symbol elsewhere on the grid cannot add a win;
 * it must occupy this exact line and match left-to-right on consecutive reels.
 * Shared by regular spins and Free Spins so the minimum never differs by mode.
 */
function evaluatePayline(
  symbols: SymbolName[],
  totalBet: number,
  line: number[],
  lineIndex: number,
  payoutTable: Paytable
): PaylineWin | null {
  if (line.length !== 5) return null;
  const lineSymbols = line.map((row, reel) => symbols[reel * 3 + row]);
  const firstRegular = lineSymbols.find(symbol => symbol !== "book");
  if (!firstRegular) return null;

  let count = 0;
  for (const symbol of lineSymbols) {
    if (symbol !== firstRegular && symbol !== "book") break;
    count++;
  }
  if (count < MIN_PAYLINE_MATCHES) return null;

  const regKey = firstRegular as Exclude<SymbolName, "book">;
  const hasBookInRun = lineSymbols.slice(0, count).includes("book");
  const regularMatches = lineSymbols.slice(0, count).filter(symbol => symbol === regKey).length;
  // Preserve the existing Book-wild payout rule and all paytable multipliers.
  const mult = count === 3 && hasBookInRun && regularMatches === 2
    ? 2
    : payoutTable[regKey][count as 3 | 4 | 5] || 0;
  const linePayout = Math.floor(totalBet * mult);
  if (linePayout <= 0) return null;

  const positions = Array.from({ length: count }, (_, reel) => reel * 3 + line[reel]);
  return { line: lineIndex + 1, symbol: regKey, count, payout: linePayout, positions };
}

function evaluate(symbols: SymbolName[], totalBet: number, expandingSymbol?: SymbolName | null, isFreeSpin = false) {
  const lineBet = totalBet / PAYLINES.length;
  const payoutTable = (isFreeSpin ? BOOK_OF_SUNRISE_MATH.freeSpinPayouts : BOOK_OF_SUNRISE_MATH.payouts) as Record<Exclude<SymbolName, "book">, { 3: number; 4: number; 5: number }>;
  let payout = 0;
  const wins: { line: number; symbol: SymbolName; count: number; payout: number; positions: number[] }[] = [];
  const winningPositions = new Set<number>();

  // 1. Every listed payline is evaluated independently, left to right.
  // The shared helper enforces 3+ consecutive matches for both base game and Free Spins.
  PAYLINES.forEach((line, lineIndex) => {
    const lineWin = evaluatePayline(symbols, totalBet, line, lineIndex, payoutTable);
    if (!lineWin) return;
    lineWin.positions.forEach(position => winningPositions.add(position));
    wins.push(lineWin);
    payout += lineWin.payout;
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

  return { payout, wins, winningPositions: [...winningPositions], outcome: payout > 0 ? "win" : "no-match" };
}



async function ensureRealSchema(db: D1Database): Promise<void> {
  await ensureWalletSchema(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_real_features (
    user_id TEXT PRIMARY KEY,
    free_spins INTEGER NOT NULL DEFAULT 0,
    free_spin_bet INTEGER NOT NULL DEFAULT 20,
    expanding_symbol TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_real_rounds (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('spin','buyBonus')),
    bet INTEGER NOT NULL,
    stake_units TEXT NOT NULL,
    payout_units TEXT NOT NULL,
    stake_usd_cents INTEGER NOT NULL,
    payout_usd_cents INTEGER NOT NULL,
    sol_usd REAL NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_book_of_ra_real_rounds_user_created ON book_of_ra_real_rounds(user_id, created_at DESC)").run();
}

function usdCentsToLamports(cents: number, solUsd: number, roundUp: boolean): bigint {
  const exact = (cents / 100 / solUsd) * 1_000_000_000;
  if (!Number.isFinite(exact) || exact < 0 || exact > Number.MAX_SAFE_INTEGER) throw new Error("SOL conversion is outside the safe range.");
  return BigInt(roundUp ? Math.ceil(exact) : Math.floor(exact));
}

function lamportsToUsdCents(units: string, solUsd: number): number {
  const amount = Number(units);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.floor((amount / 1_000_000_000) * solUsd * 100);
}

async function handleRealAction(request: Request, env: Env, user: { id: string }, body: Record<string, unknown>): Promise<Response> {
  const action = body.action === "buyBonus" ? "buyBonus" : body.action === "spin" ? "spin" : null;
  const bet = Number(body.bet);
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!action) return json({ error: "Unknown game action." }, 400);
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) return json({ error: "A valid unique request ID is required." }, 400);
  if (!Number.isSafeInteger(bet) || bet < 20 || bet > 100 || bet % 10 !== 0) return json({ error: "Bet must be between $0.20 and $1.00 in $0.10 increments." }, 400);

  try {
    await ensureRealSchema(env.DB);
    const previous = await env.DB.prepare("SELECT result_json,action,bet FROM book_of_ra_real_rounds WHERE request_id=? AND user_id=? LIMIT 1")
      .bind(requestId, user.id).first<{ result_json: string; action: string; bet: number }>();
    if (previous) {
      if (previous.action !== action || previous.bet !== bet) return json({ error: "This request ID was already used for a different round. Refresh before placing another wager." }, 409);
      const result = JSON.parse(previous.result_json);
      const wallet = await env.DB.prepare("SELECT available_units FROM wallet_balances WHERE user_id=? AND asset='SOL' LIMIT 1").bind(user.id).first<{ available_units: string }>();
      const quote = await getSolUsd(env.DB, 10 * 60 * 1000);
      const solUsd = quote?.price ?? null;
      if (!solUsd) return json({ error: "Live SOL/USD quote is unavailable. The previous round remains recorded; retry shortly." }, 503);
      return json({ result, balance: lamportsToUsdCents(wallet?.available_units || "0", solUsd), balanceSol: (Number(wallet?.available_units || "0") / 1e9), freeSpins: Number(result.freeSpinsRemaining || 0), expandingSymbol: result.expandingSymbol || null, mode: "real", replayed: true });
    }

    const quote = await getSolUsd(env.DB, 90 * 1000);
    const solUsd = quote?.price ?? null;
    if (!solUsd) return json({ error: "Live SOL/USD quote is unavailable. No wager was placed." }, 503);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO wallet_balances (user_id,asset,available_units,reserved_units,updated_at) VALUES (?,'SOL','0','0',?)").bind(user.id, now).run();
    const wallet = await env.DB.prepare("SELECT available_units,reserved_units FROM wallet_balances WHERE user_id=? AND asset='SOL' LIMIT 1")
      .bind(user.id).first<{ available_units: string; reserved_units: string }>();
    if (!wallet) return json({ error: "SOL wallet was not found." }, 500);

    const featureRow = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet, expanding_symbol AS expandingSymbol FROM book_of_ra_real_features WHERE user_id=? LIMIT 1")
      .bind(user.id).first<{ freeSpins: number; freeSpinBet: number; expandingSymbol: SymbolName | null }>();
    const freeSpinsBefore = Number(featureRow?.freeSpins || 0);
    if (action === "buyBonus" && freeSpinsBefore > 0) return json({ error: "Finish the current free-spin round before buying another bonus." }, 409);
    const freeSpinBetBefore = Math.max(20, Math.min(100, Number(featureRow?.freeSpinBet || 20)));
    let activeExpanding: SymbolName | null = featureRow?.expandingSymbol || null;
    const isFreeSpin = action === "spin" && freeSpinsBefore > 0;
    const effectiveBet = isFreeSpin ? freeSpinBetBefore : bet;
    const stakeUsdCents = action === "buyBonus" ? bet * BUY_BONUS_MULTIPLIER : isFreeSpin ? 0 : bet;
    const stakeUnits = usdCentsToLamports(stakeUsdCents, solUsd, true);

    let symbols = spinReels();
    if (action === "buyBonus") {
      symbols[0] = "book"; symbols[5] = "book"; symbols[10] = "book";
    }
    const bookCount = symbols.filter(s => s === "book").length;
    let awardedFreeSpins = 0;
    if (bookCount >= 3) {
      awardedFreeSpins = bookCount >= 5
        ? BOOK_OF_SUNRISE_MATH.freeSpinsByBookCount.fivePlusBooks
        : bookCount === 4 ? BOOK_OF_SUNRISE_MATH.freeSpinsByBookCount.fourBooks : BOOK_OF_SUNRISE_MATH.freeSpinsByBookCount.threeBooks;
      if (!isFreeSpin) activeExpanding = REGULAR_SYMBOLS[randomIndex(REGULAR_SYMBOLS.length)];
    }
    let freeSpinsAfter = Math.max(0, freeSpinsBefore - (isFreeSpin ? 1 : 0)) + awardedFreeSpins;
    const freeSpinBetAfter = awardedFreeSpins > 0 && !isFreeSpin ? effectiveBet : freeSpinBetBefore;
    const evaluated = evaluate(symbols, effectiveBet, isFreeSpin ? activeExpanding : null, isFreeSpin);
    const payoutUsdCents = Math.min(evaluated.payout, effectiveBet * MAX_WIN_MULTIPLIER);
    const payoutUnits = usdCentsToLamports(payoutUsdCents, solUsd, false);
    if (freeSpinsAfter === 0) activeExpanding = null;

    const available = BigInt(wallet.available_units || "0");
    const reserved = BigInt(wallet.reserved_units || "0");
    if (available < stakeUnits) {
      return json({ error: "Insufficient available SOL balance for this wager. Deposit and verify SOL first." }, 400);
    }
    const nextAvailable = available - stakeUnits + payoutUnits;
    const roundId = randomToken(16);
    const result = {
      id: roundId, symbols, outcome: evaluated.outcome, bet: effectiveBet,
      stake: stakeUsdCents, payout: payoutUsdCents, mode: action,
      wins: evaluated.wins, winningPositions: evaluated.winningPositions,
      awardedFreeSpins, freeSpinsRemaining: freeSpinsAfter, expandingSymbol: activeExpanding
    };
    const metadata = JSON.stringify({ game: "Temple of Ra", requestId, solUsdAtSettlement: solUsd, stakeUsdCents, payoutUsdCents, stakeUnits: stakeUnits.toString(), payoutUnits: payoutUnits.toString() });
    const statements = [
      env.DB.prepare("UPDATE wallet_balances SET available_units=?,updated_at=? WHERE user_id=? AND asset='SOL' AND available_units=? AND reserved_units=? AND CAST(available_units AS INTEGER)>=?")
        .bind(nextAvailable.toString(), now, user.id, wallet.available_units, wallet.reserved_units, stakeUnits.toString()),
      env.DB.prepare("INSERT INTO book_of_ra_real_rounds (id,request_id,user_id,action,bet,stake_units,payout_units,stake_usd_cents,payout_usd_cents,sol_usd,result_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1")
        .bind(roundId, requestId, user.id, action, effectiveBet, stakeUnits.toString(), payoutUnits.toString(), stakeUsdCents, payoutUsdCents, solUsd, JSON.stringify(result), now),
      env.DB.prepare("INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) SELECT ?,?,'SOL','wager','confirmed',?,NULL,NULL,?,?,?,? WHERE ? > 0 AND EXISTS (SELECT 1 FROM book_of_ra_real_rounds WHERE request_id=? AND user_id=?)")
        .bind(randomToken(16), user.id, stakeUnits.toString(), requestId + ":wager", now, now, metadata, stakeUnits.toString(), requestId, user.id),
      env.DB.prepare("INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) SELECT ?,?,'SOL','payout','confirmed',?,NULL,NULL,?,?,?,? WHERE ? > 0 AND EXISTS (SELECT 1 FROM book_of_ra_real_rounds WHERE request_id=? AND user_id=?)")
        .bind(randomToken(16), user.id, payoutUnits.toString(), requestId + ":payout", now, now, metadata, payoutUnits.toString(), requestId, user.id),
      env.DB.prepare("INSERT INTO book_of_ra_real_features (user_id,free_spins,free_spin_bet,expanding_symbol,updated_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM book_of_ra_real_rounds WHERE request_id=? AND user_id=?) ON CONFLICT(user_id) DO UPDATE SET free_spins=excluded.free_spins,free_spin_bet=excluded.free_spin_bet,expanding_symbol=excluded.expanding_symbol,updated_at=excluded.updated_at")
        .bind(user.id, freeSpinsAfter, freeSpinBetAfter, activeExpanding, now, requestId, user.id)
    ];
    await env.DB.batch(statements);
    const saved = await env.DB.prepare("SELECT result_json FROM book_of_ra_real_rounds WHERE request_id=? AND user_id=? LIMIT 1").bind(requestId, user.id).first<{ result_json: string }>();
    if (!saved) {
      const replay = await env.DB.prepare("SELECT result_json FROM book_of_ra_real_rounds WHERE request_id=? AND user_id=? LIMIT 1").bind(requestId, user.id).first<{ result_json: string }>();
      if (replay) return json({ result: JSON.parse(replay.result_json), mode: "real", replayed: true });
      return json({ error: "Wallet changed during the wager. No round was charged; refresh and try again." }, 409);
    }
    const finalWallet = await env.DB.prepare("SELECT available_units FROM wallet_balances WHERE user_id=? AND asset='SOL' LIMIT 1").bind(user.id).first<{ available_units: string }>();
    return json({
      result: JSON.parse(saved.result_json),
      balance: lamportsToUsdCents(finalWallet?.available_units || "0", solUsd),
      balanceSol: Number(finalWallet?.available_units || "0") / 1e9,
      freeSpins: freeSpinsAfter, freeSpinBet: freeSpinBetAfter,
      expandingSymbol: activeExpanding, mode: "real", solUsd
    });
  } catch (error) {
    const previous = await env.DB.prepare("SELECT result_json FROM book_of_ra_real_rounds WHERE request_id=? AND user_id=? LIMIT 1").bind(requestId, user.id).first<{ result_json: string }>().catch(() => null);
    if (previous) {
      const quote = await getSolUsd(env.DB, 10 * 60 * 1000);
      const solUsd = quote?.price ?? null;
      if (!solUsd) return json({ error: "The round is recorded, but the live SOL/USD quote is unavailable. Retry with the same request ID to recover its balance." }, 503);
      const wallet = await env.DB.prepare("SELECT available_units FROM wallet_balances WHERE user_id=? AND asset='SOL' LIMIT 1").bind(user.id).first<{ available_units: string }>().catch(() => null);
      const result = JSON.parse(previous.result_json);
      return json({
        result,
        balance: lamportsToUsdCents(wallet?.available_units || "0", solUsd),
        balanceSol: Number(wallet?.available_units || "0") / 1e9,
        freeSpins: Number(result.freeSpinsRemaining || 0),
        expandingSymbol: result.expandingSymbol || null,
        mode: "real",
        replayed: true
      });
    }
    console.error("[MAXWIN Book of Ra real settlement]", error instanceof Error ? error.message : String(error));
    return json({ error: "The real-money round could not be settled. Check wallet history before retrying." }, 500);
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Service not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in required." }, 401);

  if (new URL(request.url).searchParams.get("mode") === "real") {
    try {
      await ensureRealSchema(env.DB);
      const quote = await getSolUsd(env.DB, 30 * 60 * 1000);
      const solUsd = quote?.price ?? null;
      if (!solUsd) return json({ error: "Live SOL/USD quote is unavailable." }, 503);
      const now = new Date().toISOString();
      await env.DB.prepare("INSERT OR IGNORE INTO wallet_balances (user_id,asset,available_units,reserved_units,updated_at) VALUES (?,'SOL','0','0',?)").bind(user.id, now).run();
      const wallet = await env.DB.prepare("SELECT available_units,reserved_units FROM wallet_balances WHERE user_id=? AND asset='SOL' LIMIT 1").bind(user.id).first<{ available_units: string; reserved_units: string }>();
      const features = await env.DB.prepare("SELECT free_spins AS freeSpins, free_spin_bet AS freeSpinBet, expanding_symbol AS expandingSymbol FROM book_of_ra_real_features WHERE user_id=? LIMIT 1").bind(user.id).first<{ freeSpins: number; freeSpinBet: number; expandingSymbol: SymbolName | null }>();
      return json({
        balance: lamportsToUsdCents(wallet?.available_units || "0", solUsd),
        balanceSol: Number(wallet?.available_units || "0") / 1e9,
        availableUnits: wallet?.available_units || "0",
        reservedUnits: wallet?.reserved_units || "0",
        freeSpins: Number(features?.freeSpins || 0),
        freeSpinBet: Number(features?.freeSpinBet || 20),
        expandingSymbol: features?.expandingSymbol || null,
        solUsd, mode: "real"
      });
    } catch (error) {
      console.error("[MAXWIN Book of Ra real wallet]", error instanceof Error ? error.message : String(error));
      return json({ error: "Could not load real SOL wallet." }, 500);
    }
  }

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

  if (body.walletMode === "real") return handleRealAction(request, env, user, body);

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
