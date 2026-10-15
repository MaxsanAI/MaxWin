export type BookOfSunriseSymbol = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
export type BookOfSunriseRegularSymbol = Exclude<BookOfSunriseSymbol, "book">;

/**
 * Temple of Ra demo math v2.
 * Multipliers are per payline bet; scatter awards are per total spin bet.
 * This is a conservative starting model, not a certified RTP claim.
 */
export const BOOK_OF_SUNRISE_MATH = {
  // 1.8% per cell; 15 independent cells.
  bookProbabilityPer1000: 18,
  // Weighted distribution: lower-value symbols are more common than premium symbols.
  regularSymbolWeights: {
    pharaoh: 5,
    anubis: 8,
    scarab: 10,
    statue: 10,
    ace: 12,
    king: 12,
    queen: 14,
    jack: 14,
    ten: 15
  },
  payouts: {
    pharaoh: { 2: 1,   3: 5,   4: 20, 5: 80 },
    anubis:  { 2: 0.8, 3: 3,   4: 12, 5: 45 },
    scarab:  { 2: 0.6, 3: 2,   4: 8,  5: 30 },
    statue:  { 2: 0.6, 3: 2,   4: 8,  5: 30 },
    ace:     { 3: 1.5, 4: 5,   5: 18 },
    king:    { 3: 1.5, 4: 5,   5: 18 },
    queen:   { 3: 1,   4: 3,   5: 10 },
    jack:    { 3: 1,   4: 3,   5: 10 },
    ten:     { 3: 1,   4: 3,   5: 10 }
  },
  scatterPayoutByBookCount: {
    threeBooks: 1,
    fourBooks: 5,
    fivePlusBooks: 15
  },
  freeSpinsByBookCount: {
    threeBooks: 8,
    fourBooks: 12,
    fivePlusBooks: 16
  },
  buyBonusMultiplier: 50,
  maxWinMultiplier: 250
} as const;
