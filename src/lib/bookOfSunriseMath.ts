export type BookOfSunriseSymbol = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
export type BookOfSunriseRegularSymbol = Exclude<BookOfSunriseSymbol, "book">;

/**
 * Temple of Ra demo math v3.
 * Regular payouts are per payline bet; scatter payouts use total bet.
 * Reduced premium-symbol frequency, Book frequency and top-end payouts.
 */
export const BOOK_OF_SUNRISE_MATH = {
  // 1.2% per cell; 15 independent cells.
  bookProbabilityPer1000: 12,
  // Weighted distribution: lower-value symbols are more common than premium symbols.
  regularSymbolWeights: {
    pharaoh: 2,
    anubis: 4,
    scarab: 7,
    statue: 7,
    ace: 12,
    king: 12,
    queen: 16,
    jack: 18,
    ten: 22
  },
  payouts: {
    pharaoh: { 2: 2.5, 3: 3,    4: 8, 5: 20 },
    anubis:  { 2: 2.5, 3: 2.5,  4: 6, 5: 15 },
    scarab:  { 2: 2.5, 3: 1.5,  4: 4, 5: 10 },
    statue:  { 2: 2.5, 3: 1.5,  4: 4, 5: 10 },
    ace:     { 2: 2.5, 3: 1,    4: 3, 5: 8 },
    king:    { 2: 2.5, 3: 1,    4: 3, 5: 8 },
    queen:   { 2: 2.5, 3: 0.75, 4: 2, 5: 5 },
    jack:    { 2: 2.5, 3: 0.75, 4: 2, 5: 5 },
    ten:     { 2: 2.5, 3: 0.75, 4: 2, 5: 5 }
  },
  scatterPayoutByBookCount: {
    threeBooks: 0.5,
    fourBooks: 2,
    fivePlusBooks: 5
  },
  freeSpinsByBookCount: {
    threeBooks: 6,
    fourBooks: 8,
    fivePlusBooks: 10
  },
  buyBonusMultiplier: 50,
  maxWinMultiplier: 100
} as const;
