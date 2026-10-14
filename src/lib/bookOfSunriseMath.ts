export type BookOfSunriseSymbol = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
export type BookOfSunriseRegularSymbol = Exclude<BookOfSunriseSymbol, "book">;

export const BOOK_OF_SUNRISE_MATH = {
  // 35 per 1000 means a 3.5% chance for each of the 15 cells to be a Book.
  bookProbabilityPer1000: 35,
  // Relative weights for regular symbols. All 1 means uniform distribution, as in the existing engine.
  regularSymbolWeights: {
    pharaoh: 1,
    anubis: 1,
    scarab: 1,
    statue: 1,
    ace: 1,
    king: 1,
    queen: 1,
    jack: 1,
    ten: 1
  },
  // Paytable multipliers are per payline bet, not per total spin bet.
  payouts: {
    pharaoh: { 2: 10, 3: 100, 4: 1000, 5: 5000 },
    anubis:  { 2: 5,  3: 40,  4: 400,  5: 2000 },
    scarab:  { 2: 5,  3: 30,  4: 100,  5: 750 },
    statue:  { 2: 5,  3: 30,  4: 100,  5: 750 },
    ace:     { 3: 10, 4: 40,  5: 150 },
    king:    { 3: 10, 4: 40,  5: 150 },
    queen:   { 3: 5,  4: 25,  5: 100 },
    jack:    { 3: 5,  4: 25,  5: 100 },
    ten:     { 3: 5,  4: 25,  5: 100 }
  },
  scatterPayoutByBookCount: {
    threeBooks: 2,
    fourBooks: 20,
    fivePlusBooks: 200
  },
  freeSpinsByBookCount: {
    threeBooks: 10,
    fourBooks: 15,
    fivePlusBooks: 20
  },
  buyBonusMultiplier: 75,
  maxWinMultiplier: 1000
} as const;
