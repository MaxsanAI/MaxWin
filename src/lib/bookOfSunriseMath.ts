export type BookOfSunriseSymbol = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
export type BookOfSunriseRegularSymbol = Exclude<BookOfSunriseSymbol, "book">;

/**
 * Temple of Ra demo math.
 * Regular payouts are per payline bet; scatter payouts use total bet.
 */
export const BOOK_OF_SUNRISE_MATH = {
  // 1.6% per cell; slightly more frequent Books for suspense moments.
  bookProbabilityPer1000: 16,
  // Slightly higher Book chance on reels 1–3 to create more two-Book suspense moments.
  bookHuntProbabilityPer1000: 20,
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
    pharaoh: { 3: 4, 4: 7, 5: 15 },
    anubis:  { 3: 3, 4: 6, 5: 12 },
    scarab:  { 2: 1, 3: 1, 4: 4, 5: 10 },
    statue:  { 3: 3, 4: 5, 5: 10 },
    ace:     { 3: 1, 4: 3, 5: 8 },
    king:    { 3: 1, 4: 3, 5: 8 },
    queen:   { 3: 1, 4: 2, 5: 5 },
    jack:    { 3: 1, 4: 2, 5: 5 },
    ten:     { 3: 1, 4: 2, 5: 5 },
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
  maxWinMultiplier: 50
} as const;
