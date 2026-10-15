import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeft, Copy, Download, FlaskConical, RotateCcw, SlidersHorizontal, ShieldAlert } from "lucide-react";
import { BOOK_OF_SUNRISE_MATH, type BookOfSunriseRegularSymbol, type BookOfSunriseSymbol } from "../lib/bookOfSunriseMath";

type Count = 2 | 3 | 4 | 5;
type Pay = { 2?: number; 3: number; 4: number; 5: number };
type MathConfig = {
  bookProbabilityPer1000: number;
  regularSymbolWeights: Record<BookOfSunriseRegularSymbol, number>;
  payouts: Record<BookOfSunriseRegularSymbol, Pay>;
  scatterPayoutByBookCount: { threeBooks: number; fourBooks: number; fivePlusBooks: number };
  freeSpinsByBookCount: { threeBooks: number; fourBooks: number; fivePlusBooks: number };
  buyBonusMultiplier: number;
  maxWinMultiplier: number;
};
type Simulation = {
  spins: number; stake: number; payout: number; rtp: number; edge: number;
  theoreticalRtp: number | null;
  winRounds: number; freeSpins: number; bonusRounds: number; cappedSessions: number;
};
const regularSymbols: BookOfSunriseRegularSymbol[] = ["pharaoh", "anubis", "scarab", "statue", "ace", "king", "queen", "jack", "ten"];
const symbolLabels: Record<BookOfSunriseRegularSymbol, string> = {
  pharaoh: "Pharaoh", anubis: "Anubis", scarab: "Scarab", statue: "Statue",
  ace: "Ace", king: "King", queen: "Queen", jack: "Jack", ten: "Ten"
};
const paylines: number[][] = [
  [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
  [0,0,1,2,2], [2,2,1,0,0], [1,2,2,2,1], [1,0,0,0,1], [0,1,1,1,0]
];
const money = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const countFormat = (n: number) => Math.round(n).toLocaleString("en-US");
const cloneDefaults = (): MathConfig => JSON.parse(JSON.stringify(BOOK_OF_SUNRISE_MATH)) as MathConfig;
const freeAward = (books: number, config: MathConfig) => books < 3 ? 0 : books >= 5 ? config.freeSpinsByBookCount.fivePlusBooks : books === 4 ? config.freeSpinsByBookCount.fourBooks : config.freeSpinsByBookCount.threeBooks;
const scatterMultiplier = (books: number, config: MathConfig) => books < 3 ? 0 : books >= 5 ? config.scatterPayoutByBookCount.fivePlusBooks : books === 4 ? config.scatterPayoutByBookCount.fourBooks : config.scatterPayoutByBookCount.threeBooks;


function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
  return result;
}

// Expected RTP computed from the actual independent-cell probabilities and paytable.
// This removes much of the sampling noise caused by very rare premium-symbol wins.
function calculateRegularRtp(config: MathConfig, bet: number): number {
  const bookP = Math.max(0, Math.min(0.999, config.bookProbabilityPer1000 / 1000));
  const weights = regularSymbols.map(symbol => Math.max(1, Math.floor(config.regularSymbolWeights[symbol])));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const symbolP = {} as Record<BookOfSunriseRegularSymbol, number>;
  regularSymbols.forEach((symbol, index) => { symbolP[symbol] = (1 - bookP) * weights[index] / totalWeight; });
  const lineBet = bet / paylines.length;

  let expectedLinePayout = 0;
  for (const symbol of regularSymbols) {
    const q = symbolP[symbol];
    for (const count of [2, 3, 4, 5] as Count[]) {
      const multiplier = config.payouts[symbol][count];
      if (multiplier === undefined) continue;
      const probability = count < 5
        ? (Math.pow(bookP + q, count) - Math.pow(bookP, count)) * (1 - bookP - q)
        : Math.pow(bookP + q, 5) - Math.pow(bookP, 5);
      expectedLinePayout += probability * Math.floor(lineBet * multiplier);
    }
  }
  const expectedLinesPerSpin = expectedLinePayout * paylines.length;

  let expectedScatterPayout = 0;
  let expectedFreeSpinAwards = 0;
  for (let books = 0; books <= 15; books++) {
    const probability = choose(15, books) * Math.pow(bookP, books) * Math.pow(1 - bookP, 15 - books);
    expectedScatterPayout += probability * Math.floor(bet * scatterMultiplier(books, config));
    expectedFreeSpinAwards += probability * freeAward(books, config);
  }

  // Each free spin may retrigger another batch. This geometric expectation is valid while
  // average retriggers per free spin remain below 1.
  if (expectedFreeSpinAwards >= 0.999) return Infinity;
  const expectedNumberOfFreeSpinsPerPaidSpin = expectedFreeSpinAwards / (1 - expectedFreeSpinAwards);

  let expectedExpansionPayout = 0;
  for (const expandingSymbol of regularSymbols) {
    const q = symbolP[expandingSymbol];
    const reelPresence = 1 - Math.pow(1 - q, 3);
    let symbolExpansionPayout = 0;
    for (const reelsWithSymbol of [3, 4, 5] as const) {
      const probability = choose(5, reelsWithSymbol)
        * Math.pow(reelPresence, reelsWithSymbol)
        * Math.pow(1 - reelPresence, 5 - reelsWithSymbol);
      const multiplier = config.payouts[expandingSymbol][reelsWithSymbol] || 0;
      symbolExpansionPayout += probability * Math.floor(lineBet * multiplier * paylines.length);
    }
    expectedExpansionPayout += symbolExpansionPayout / regularSymbols.length;
  }

  const expectedPaidSpinPayout = expectedLinesPerSpin + expectedScatterPayout;
  const expectedFreeSpinPayout = expectedPaidSpinPayout + expectedExpansionPayout;
  // The engine's max-win cap is applied to each spin after summing its wins. This expectation
  // does not enumerate rare combinations of several simultaneous line wins crossing that cap.
  return (expectedPaidSpinPayout + expectedNumberOfFreeSpinsPerPaidSpin * expectedFreeSpinPayout) / bet * 100;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function drawRegular(config: MathConfig, random: () => number): BookOfSunriseRegularSymbol {
  const total = regularSymbols.reduce((sum, symbol) => sum + Math.max(1, Math.floor(config.regularSymbolWeights[symbol])), 0);
  let roll = Math.floor(random() * total);
  for (const symbol of regularSymbols) {
    roll -= Math.max(1, Math.floor(config.regularSymbolWeights[symbol]));
    if (roll < 0) return symbol;
  }
  return regularSymbols[regularSymbols.length - 1];
}
function drawGrid(config: MathConfig, random: () => number): BookOfSunriseSymbol[] {
  return Array.from({ length: 15 }, () => random() * 1000 < config.bookProbabilityPer1000 ? "book" : drawRegular(config, random));
}
function evaluateGrid(symbols: BookOfSunriseSymbol[], totalBet: number, config: MathConfig, expandingSymbol: BookOfSunriseRegularSymbol | null): number {
  const lineBet = totalBet / paylines.length;
  let payout = 0;
  for (const line of paylines) {
    const lineSymbols = line.map((row, reel) => symbols[reel * 3 + row]);
    const target = lineSymbols.find(symbol => symbol !== "book");
    if (!target) continue;
    const regularTarget = target as BookOfSunriseRegularSymbol;
    let count = 0;
    for (const symbol of lineSymbols) {
      if (symbol !== regularTarget && symbol !== "book") break;
      count++;
    }
    const table = config.payouts[regularTarget];
    const minCount = table[2] !== undefined ? 2 : 3;
    if (count < minCount) continue;
    const multiplier = table[count as Count] || 0;
    payout += Math.floor(lineBet * multiplier);
  }
  if (expandingSymbol) {
    const reelsWithExpanding = [0,1,2,3,4].map(reel => symbols.slice(reel * 3, reel * 3 + 3).includes(expandingSymbol));
    const count = reelsWithExpanding.filter(Boolean).length;
    if (count >= 3) {
      const multiplier = config.payouts[expandingSymbol][count as Count] || 0;
      payout += Math.floor(lineBet * multiplier * paylines.length);
    }
  }
  const books = symbols.filter(symbol => symbol === "book").length;
  payout += Math.floor(totalBet * scatterMultiplier(books, config));
  return payout;
}

function runSimulation(config: MathConfig, sampleSpins: number, bet: number, mode: "regular" | "buyBonus", seed = 0x5eed1234): Simulation {
  const random = makeRng(seed);
  let totalStake = 0, totalPayout = 0, winRounds = 0, totalFreeSpins = 0, bonusRounds = 0, cappedSessions = 0;
  // Safety ceiling prevents extreme user-entered retrigger chances from locking the browser.
  const freeSpinBudget = Math.min(1500000, Math.max(1000, sampleSpins * (mode === "buyBonus" ? 18 : 10)));
  let processedFreeSpins = 0;
  for (let index = 0; index < sampleSpins; index++) {
    const stake = mode === "buyBonus" ? bet * config.buyBonusMultiplier : bet;
    totalStake += stake;
    let symbols = drawGrid(config, random);
    if (mode === "buyBonus") { symbols[0] = "book"; symbols[5] = "book"; symbols[10] = "book"; }
    let books = symbols.filter(symbol => symbol === "book").length;
    let freeRemaining = freeAward(books, config);
    let expandingSymbol: BookOfSunriseRegularSymbol | null = freeRemaining > 0 ? regularSymbols[Math.floor(random() * regularSymbols.length)] : null;
    let roundPayout = Math.min(bet * config.maxWinMultiplier, evaluateGrid(symbols, bet, config, null));
    if (freeRemaining > 0) bonusRounds++;
    let thisSessionFreeSpins = 0;
    while (freeRemaining > 0 && processedFreeSpins < freeSpinBudget) {
      freeRemaining--;
      processedFreeSpins++;
      thisSessionFreeSpins++;
      totalFreeSpins++;
      symbols = drawGrid(config, random);
      books = symbols.filter(symbol => symbol === "book").length;
      const retrigger = freeAward(books, config);
      if (retrigger > 0) bonusRounds++;
      freeRemaining += retrigger;
      roundPayout += Math.min(bet * config.maxWinMultiplier, evaluateGrid(symbols, bet, config, expandingSymbol));
    }
    if (freeRemaining > 0) cappedSessions++;
    if (roundPayout > 0) winRounds++;
    totalPayout += roundPayout;
  }
  const rtp = totalStake > 0 ? totalPayout / totalStake * 100 : 0;
  return { spins: sampleSpins, stake: totalStake, payout: totalPayout, rtp, edge: 100 - rtp, theoreticalRtp: mode === "regular" ? calculateRegularRtp(config, bet) : null, winRounds, freeSpins: totalFreeSpins, bonusRounds, cappedSessions };
}

function runMultiSeedSimulation(config: MathConfig, sampleSpins: number, bet: number, mode: "regular" | "buyBonus", seeds: number[]): Simulation {
  const reports = seeds.map(seed => runSimulation(config, sampleSpins, bet, mode, seed));
  const spins = reports.reduce((sum, item) => sum + item.spins, 0);
  const stake = reports.reduce((sum, item) => sum + item.stake, 0);
  const payout = reports.reduce((sum, item) => sum + item.payout, 0);
  return {
    spins,
    stake,
    payout,
    rtp: stake > 0 ? payout / stake * 100 : 0,
    edge: stake > 0 ? 100 - payout / stake * 100 : 0,
    theoreticalRtp: mode === "regular" ? calculateRegularRtp(config, bet) : null,
    winRounds: reports.reduce((sum, item) => sum + item.winRounds, 0),
    freeSpins: reports.reduce((sum, item) => sum + item.freeSpins, 0),
    bonusRounds: reports.reduce((sum, item) => sum + item.bonusRounds, 0),
    cappedSessions: reports.reduce((sum, item) => sum + item.cappedSessions, 0)
  };
}

export default function MathTuner() {
  const [model, setModel] = useState<MathConfig>(cloneDefaults);
  const [sample, setSample] = useState(10000);
  const [bet, setBet] = useState(20);
  const [targetRtp, setTargetRtp] = useState(94);
  const [mode, setMode] = useState<"regular" | "buyBonus">("regular");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [autoTuneNotice, setAutoTuneNotice] = useState("");
  const [notes, setNotes] = useState("");
  const validBet = Number.isInteger(bet) && bet >= 20 && bet <= 100 && bet % 10 === 0;
  const probabilityPercent = model.bookProbabilityPer1000 / 10;
  const generated = useMemo(() => `// Replace the complete file src/lib/bookOfSunriseMath.ts with this proposal.
export type BookOfSunriseSymbol = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
export type BookOfSunriseRegularSymbol = Exclude<BookOfSunriseSymbol, "book">;

export const BOOK_OF_SUNRISE_MATH = ${JSON.stringify(model, null, 2)} as const;

// Tuner notes: ${notes.trim() ? notes.trim().replace(/\n/g, " ") : "none"}
`, [model, notes]);
  const setWeight = (symbol: BookOfSunriseRegularSymbol, value: number) => setModel(prev => ({ ...prev, regularSymbolWeights: { ...prev.regularSymbolWeights, [symbol]: Math.max(1, Math.min(100, Math.floor(value) || 1)) } }));
  const setPayout = (symbol: BookOfSunriseRegularSymbol, count: Count, value: number) => setModel(prev => ({
    ...prev,
    payouts: { ...prev.payouts, [symbol]: { ...prev.payouts[symbol], [count]: Math.max(0, Math.min(100000, value)) } }
  }));
  const buildScaledModel = (source: MathConfig, scale: number): MathConfig => {
    const payouts = {} as MathConfig["payouts"];
    for (const symbol of regularSymbols) {
      const next = { ...source.payouts[symbol] };
      for (const count of [2, 3, 4, 5] as Count[]) {
        const value = next[count];
        if (value !== undefined) next[count] = Math.max(0, Number((value * scale).toFixed(2)));
      }
      payouts[symbol] = next;
    }
    return {
      ...source,
      payouts,
      scatterPayoutByBookCount: {
        threeBooks: Math.max(0, Number((source.scatterPayoutByBookCount.threeBooks * scale).toFixed(2))),
        fourBooks: Math.max(0, Number((source.scatterPayoutByBookCount.fourBooks * scale).toFixed(2))),
        fivePlusBooks: Math.max(0, Number((source.scatterPayoutByBookCount.fivePlusBooks * scale).toFixed(2)))
      }
    };
  };
  const autoConfigure = () => {
    if (!validBet || running) return;
    setRunning(true);
    setSimulation(null);
    setAutoTuneNotice("");
    window.setTimeout(() => {
      try {
        const tuneSample = Math.min(10000, Math.max(8000, sample));
        const tuningSeeds = [0x1234abcd, 0x02468ace, 0x9e3779b9, 0x7f4a7c15, 0x31415926, 0x27182818, 0xabcdef01, 0xdeadbeef];
        const verificationSeeds = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a];
        const baseline = runMultiSeedSimulation(model, tuneSample, bet, mode, tuningSeeds);
        if (mode === "buyBonus") {
          // Purchase RTP remains a Monte Carlo estimate because the bonus starts with three forced Books.
          if (!Number.isFinite(baseline.rtp) || baseline.rtp <= 0 || baseline.cappedSessions > baseline.spins * 0.2) {
            setAutoTuneNotice("Automatsko podešavanje je zaustavljeno: Buy Bonus simulacija je nestabilna ili je previše bonus-lanaca dostiglo sigurnosnu granicu.");
            setSimulation(baseline);
            return;
          }
          const calibratedPrice = Math.max(1, Math.min(1000, Math.round(model.buyBonusMultiplier * baseline.rtp / targetRtp)));
          const nextModel: MathConfig = { ...model, buyBonusMultiplier: calibratedPrice };
          setModel(nextModel);
          const verified = runMultiSeedSimulation(nextModel, tuneSample, bet, mode, verificationSeeds);
          setSimulation(verified);
          setAutoTuneNotice(`Cena Buy Bonus-a je automatski promenjena sa ${model.buyBonusMultiplier}× na ${nextModel.buyBonusMultiplier}×. Procenjeni RTP kupovine nakon nove cene: ${verified.rtp.toFixed(2)}%; cilj ${targetRtp.toFixed(1)}%. Ovo je Monte Carlo procena i zahteva dodatnu proveru.`);
          return;
        }

        const baselineTheory = calculateRegularRtp(model, bet);
        if (!Number.isFinite(baselineTheory) || baselineTheory <= 0) {
          setAutoTuneNotice("Ne mogu da izračunam stabilan RTP iz trenutnih bonus pravila. Proveri verovatnoću knjige i broj Free Spins.");
          setSimulation(baseline);
          return;
        }

        // Search the scale against the mathematical expectation, not the luck of a random sample.
        let low = 0;
        let high = 1;
        let bestModel = buildScaledModel(model, high);
        let bestRtp = calculateRegularRtp(bestModel, bet);
        let bestDistance = Math.abs(bestRtp - targetRtp);
        if (bestRtp < targetRtp) {
          low = high;
          for (let expand = 0; expand < 8 && bestRtp < targetRtp && high < 256; expand++) {
            high = Math.min(256, high * 2);
            const candidate = buildScaledModel(model, high);
            const rtp = calculateRegularRtp(candidate, bet);
            const distance = Math.abs(rtp - targetRtp);
            if (distance < bestDistance) { bestModel = candidate; bestRtp = rtp; bestDistance = distance; }
            if (rtp < targetRtp) low = high;
          }
        }
        for (let iteration = 0; iteration < 28; iteration++) {
          const scale = (low + high) / 2;
          const candidate = buildScaledModel(model, scale);
          const rtp = calculateRegularRtp(candidate, bet);
          const distance = Math.abs(rtp - targetRtp);
          if (distance < bestDistance) { bestModel = candidate; bestRtp = rtp; bestDistance = distance; }
          if (rtp < targetRtp) low = scale;
          else high = scale;
        }

        setModel(bestModel);
        const verified = runMultiSeedSimulation(bestModel, tuneSample, bet, mode, verificationSeeds);
        setSimulation(verified);
        const gap = Math.abs(bestRtp - targetRtp);
        setAutoTuneNotice(
          gap <= 1.5
            ? `Automatski sam podesio isplate prema matematičkom očekivanju: ${bestRtp.toFixed(2)}% RTP (cilj ${targetRtp.toFixed(1)}%). Zasebna nasumična simulacija dala je ${verified.rtp.toFixed(2)}%. Zbog retkih velikih dobitaka ti brojevi mogu da odstupaju; matematička procena je merodavnija za podešavanje, a cap za maksimalnu isplatu može je malo umanjiti.`
            : `Najbliža pronađena konfiguracija ima matematičku procenu ${bestRtp.toFixed(2)}% RTP prema cilju ${targetRtp.toFixed(1)}%; zbog diskretnih centi i zaokruživanja tačan cilj nije dostignut. Nasumična provera dala je ${verified.rtp.toFixed(2)}%.`
        );
      } catch {
        setAutoTuneNotice("Automatsko podešavanje nije završeno. Pokušaj ponovo sa manjim brojem simuliranih spinova.");
      } finally {
        setRunning(false);
      }
    }, 20);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(generated); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([generated], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "book-of-sunrise-math-proposal.ts"; a.click(); URL.revokeObjectURL(url);
  };
  const reset = () => { setModel(cloneDefaults()); setSample(10000); setBet(20); setTargetRtp(94); setMode("regular"); setSimulation(null); setAutoTuneNotice(""); setNotes(""); };
  return <main style={{ minHeight: "100vh", background: "radial-gradient(ellipse at top,#29204d 0%,#0a0e1d 58%)", color: "#f4f3ff", padding: "24px clamp(14px,3vw,42px) 50px", fontFamily: "inherit" }}>
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#f4c66a", textDecoration: "none", fontWeight: 800, fontSize: 13, marginBottom: 22 }}><ArrowLeft size={16}/> BACK TO MAXWIN</a>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}><span style={{ display: "grid", placeItems: "center", width: 46, height: 46, borderRadius: 13, background: "#9b72ff20", border: "1px solid #9b72ff66", color: "#d2bdff" }}><SlidersHorizontal size={24}/></span><div><div style={{ fontSize: 11, letterSpacing: 2, color: "#b9a0ff", fontWeight: 900 }}>MAXWIN INTERNAL WORKSPACE</div><h1 style={{ fontSize: "clamp(26px,4vw,38px)", margin: "5px 0", lineHeight: 1.1 }}>BOOK OF SUNRISE <span style={{ color: "#f4c66a" }}>MATH TUNER</span></h1></div></div>
      <p style={{ color: "#a8acc6", maxWidth: 930, lineHeight: 1.65, marginBottom: 20 }}>This tuner uses the existing 5×3 engine: its 10 paylines, left-to-right wins, Book wild/scatter behavior, expanding-symbol free spins, Buy Bonus price and maximum-win cap. Tune this game first; the other slots are not changed.</p>
      <div style={{ padding: 13, marginBottom: 18, border: "1px solid #e4ad4d66", borderRadius: 10, background: "#5a3b1825", color: "#dfcfaa", fontSize: 12, lineHeight: 1.6 }}><b style={{ color: "#f4c66a" }}>Current MAXWIN mapping:</b> the existing slot is displayed on the site as Book of Sunfire and its API path is <code>/api/games/book-of-ra</code>. This tuner connects to that existing engine; it does not create a second slot or change its appearance.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 16, alignItems: "start" }}>
        <section style={{ ...panel, gridColumn: "1 / -1" }}><h2 style={h2}>Kako da koristiš tuner</h2><ol style={{ margin: "0 0 14px", paddingLeft: 22, color: "#d4d1e8", fontSize: 13, lineHeight: 1.8 }}><li>Izaberi cilj: <b>90%</b> oprezniji, <b>94%</b> uravnotežen, ili <b>96%</b> izdašniji.</li><li>Klikni <b>AUTO-CONFIGURE & VERIFY</b>. Tuner sam računa i proverava vrednosti — ne moraš da vrtiš igru.</li><li>Kad se prikažu rezultati, klikni <b>COPY CONFIG PROPOSAL</b> i nalepi tekst ovde u razgovor. Ja onda prenesem potvrđene vrednosti u kod igre.</li></ol><p style={{ margin: 0, color: "#f4c66a", fontSize: 12, lineHeight: 1.6 }}>Važno: tuner još ne menja slot automatski. On priprema proverljiv predlog koji zatim ugrađujemo u stvarni engine.</p></section>
        <section style={{ ...panel, gridColumn: "1 / -1" }}><h2 style={h2}>1. Jednostavno podešavanje</h2><label style={label}>Šta podešavamo?<select value={mode} onChange={e => { setMode(e.target.value as "regular" | "buyBonus"); setSimulation(null); setAutoTuneNotice(""); }} style={field}><option value="regular">Obične spinove — isplate</option><option value="buyBonus">Buy Bonus — cenu bonusa</option></select></label><div style={metrics}><span>Cena po plaćenom pokušaju</span><strong>{money(mode === "buyBonus" ? bet * model.buyBonusMultiplier : bet)}</strong></div><div style={{ fontSize: 12, color: "#969bb8", lineHeight: 1.6, marginTop: 10 }}>Podrazumevano: 10.000 simuliranih spinova, ulog $0.20 po plaćenom spinu. Iznosi se vode u centima unutar koda, ali su ovde prikazani u dolarima. Besplatni spinovi i ponovno aktiviranje ulaze u procenu.</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 12 }}><button type="button" onClick={() => { setTargetRtp(90); setAutoTuneNotice(""); }} style={{ ...presetButton, ...(targetRtp === 90 ? presetSelected : {}) }}>OPREZNIJE<br/><b>90% RTP</b></button><button type="button" onClick={() => { setTargetRtp(94); setAutoTuneNotice(""); }} style={{ ...presetButton, ...(targetRtp === 94 ? presetSelected : {}) }}>URAVNOTEŽENO<br/><b>94% RTP</b></button><button type="button" onClick={() => { setTargetRtp(96); setAutoTuneNotice(""); }} style={{ ...presetButton, ...(targetRtp === 96 ? presetSelected : {}) }}>IZDAŠNIJE<br/><b>96% RTP</b></button></div><button type="button" onClick={autoConfigure} disabled={!validBet || running} style={{ ...goldButton, width: "100%", justifyContent: "center", marginTop: 10, opacity: running ? .7 : 1 }}><SlidersHorizontal size={15}/>{running ? "PODEŠAVAM I PROVERAVAM…" : "AUTOMATSKI PODESI I PROVERI"}</button><p style={{ fontSize: 11, color: "#a8acc6", lineHeight: 1.55, margin: "10px 0 0" }}>Izaberi samo cilj RTP-a. Tuner sam prilagođava vrednosti i ponovo ih proverava. Ne moraš ručno da unosiš multiplikatore niti da vrtiš slot.</p>{autoTuneNotice && <p role="status" style={{ margin: "12px 0 0", padding: 12, borderRadius: 9, background: "#17132d", border: "1px solid #9b72ff55", color: "#d8cfff", fontSize: 12, lineHeight: 1.6 }}>{autoTuneNotice}</p>}</section>
        <details style={{ gridColumn: "1 / -1", border: "1px solid #9b72ff44", borderRadius: 12, background: "#111426", padding: 15 }}><summary style={{ cursor: "pointer", color: "#c9b9ff", fontSize: 13, fontWeight: 800 }}>Advanced settings — ostavi zatvoreno ako želiš automatsko podešavanje</summary><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 16, alignItems: "start", marginTop: 15 }}>
        <section style={panel}><h2 style={h2}>2. Symbol probability & weights</h2><label style={label}>Book chance per grid cell: <b>{probabilityPercent.toFixed(1)}%</b><input type="range" min="0" max="70" step="1" value={model.bookProbabilityPer1000} onChange={e => { setModel(prev => ({ ...prev, bookProbabilityPer1000: Number(e.target.value) })); setSimulation(null); }} style={range}/></label><p style={{ color: "#969bb8", fontSize: 11, marginTop: -6 }}>Current engine: 35/1000 = 3.5% per cell. A 5×3 spin samples 15 cells independently.</p><div style={{ display: "grid", gridTemplateColumns: "minmax(95px,1fr) 95px 90px", gap: 8, alignItems: "center", marginBottom: 7, color: "#9298b5", fontSize: 10 }}><span>Regular symbol</span><span>Relative weight</span><span>≈ share*</span></div>{regularSymbols.map(symbol => { const weightTotal = regularSymbols.reduce((sum, item) => sum + model.regularSymbolWeights[item], 0); const share = (100 - probabilityPercent) * model.regularSymbolWeights[symbol] / weightTotal; return <div key={symbol} style={{ display: "grid", gridTemplateColumns: "minmax(95px,1fr) 95px 90px", gap: 8, alignItems: "center", marginBottom: 7 }}><span style={{ fontSize: 12 }}>{symbolLabels[symbol]}</span><input aria-label={symbolLabels[symbol] + " relative weight"} type="number" min="1" max="100" step="1" value={model.regularSymbolWeights[symbol]} onChange={e => { setWeight(symbol, Number(e.target.value)); setSimulation(null); }} style={smallField}/><span style={{ fontSize: 11, color: "#b7acd9" }}>{share.toFixed(2)}%</span></div>})}<p style={{ color: "#858ba9", fontSize: 10, marginBottom: 0 }}>*Approximate share per individual cell. Weights apply only to non-Book symbols.</p></section>
        <section style={{ ...panel, gridColumn: "1 / -1" }}><h2 style={h2}>3. Paytable multipliers</h2><p style={{ color: "#a8acc6", fontSize: 12, lineHeight: 1.5 }}>Payout multipliers are per line bet, matching the source code. A 2-symbol payout applies only to the four premium symbols that currently support it.</p><div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 610, borderCollapse: "collapse", fontSize: 12 }}><thead><tr>{["Symbol","2 in a row","3 in a row","4 in a row","5 in a row"].map(x => <th key={x} style={tableHead}>{x}</th>)}</tr></thead><tbody>{regularSymbols.map(symbol => <tr key={symbol}><td style={tableCell}><b>{symbolLabels[symbol]}</b></td>{([2,3,4,5] as Count[]).map(count => { const value = model.payouts[symbol][count]; const enabled = value !== undefined; return <td style={tableCell} key={count}><input aria-label={symbolLabels[symbol] + " " + count + " symbol payout"} type="number" min="0" max="100000" step="0.1" disabled={!enabled} value={enabled ? value : ""} placeholder="—" onChange={e => { setPayout(symbol, count, Number(e.target.value)); setSimulation(null); }} style={{ ...smallField, minWidth: 78, opacity: enabled ? 1 : .4 }}/></td>; })}</tr>)}</tbody></table></div></section>
        <section style={panel}><h2 style={h2}>4. Scatter & Free Spins</h2><div style={{ fontSize: 11, color: "#9298b5", marginBottom: 10 }}>Book count on the 15-cell grid</div><div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 8, alignItems: "center", fontSize: 11, color: "#9298b5", marginBottom: 7 }}><span>Book count</span><span>Scatter payout × total bet</span><span>Free Spins awarded</span></div>{([{ key: "threeBooks", label: "3 Books" }, { key: "fourBooks", label: "4 Books" }, { key: "fivePlusBooks", label: "5+ Books" }] as const).map(row => <div key={row.key} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 8, alignItems: "center", marginBottom: 9 }}><span style={{ fontSize: 12 }}>{row.label}</span><input type="number" min="0" max="10000" step="0.1" value={model.scatterPayoutByBookCount[row.key]} onChange={e => { setModel(prev => ({ ...prev, scatterPayoutByBookCount: { ...prev.scatterPayoutByBookCount, [row.key]: Math.max(0, Number(e.target.value) || 0) } })); setSimulation(null); }} style={smallField}/><input type="number" min="0" max="1000" value={model.freeSpinsByBookCount[row.key]} onChange={e => { setModel(prev => ({ ...prev, freeSpinsByBookCount: { ...prev.freeSpinsByBookCount, [row.key]: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) } })); setSimulation(null); }} style={smallField}/></div>)}<p style={{ fontSize: 11, color: "#969bb8", lineHeight: 1.55 }}>Free spins can retrigger on 3+ Books. The simulator holds the expanding symbol chosen by the initial trigger for that bonus round, as the current engine does.</p></section>
        <section style={panel}><h2 style={h2}>5. Bonus cost & win cap</h2><label style={label}>Buy Bonus price multiplier<input type="number" min="1" max="1000" value={model.buyBonusMultiplier} onChange={e => { setModel(prev => ({ ...prev, buyBonusMultiplier: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })); setSimulation(null); }} style={field}/></label><label style={label}>Max payout per spin (× bet)<input type="number" min="1" max="100000" value={model.maxWinMultiplier} onChange={e => { setModel(prev => ({ ...prev, maxWinMultiplier: Math.max(1, Math.min(100000, Number(e.target.value) || 1)) })); setSimulation(null); }} style={field}/></label><label style={label}>Notes to carry into the code proposal<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. keep the visual design unchanged; soften premium symbol wins…" style={{ ...field, minHeight: 78, resize: "vertical" }}/></label><button type="button" onClick={reset} style={secondaryButton}><RotateCcw size={14}/> RESET TO CURRENT CODE VALUES</button></section>
        </div></details>
        <section style={{ ...panel, gridColumn: "1 / -1" }}><h2 style={h2}>6. Simulation results</h2>{!simulation ? <p style={{ color: "#969bb8", fontSize: 13, lineHeight: 1.6, margin: 0 }}>Pokreni automatsko podešavanje da proceniš kako vrednosti rade. Rezultati su procena, nisu garancija tačnog RTP-a.</p> : <><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>{[{ label: "Procena RTP-a", value: simulation.rtp.toFixed(2) + "%", color: simulation.rtp > 100 ? "#ff8f8f" : "#f4c66a" }, { label: "Prednost kuće", value: simulation.edge.toFixed(2) + "%", color: simulation.edge < 0 ? "#ff8f8f" : "#6fe0b1" }, { label: "Ukupno uloženo", value: money(simulation.stake), color: "#f4f3ff" }, { label: "Ukupno vraćeno", value: money(simulation.payout), color: "#f4f3ff" }, { label: "Bruto razlika", value: money(simulation.stake - simulation.payout), color: simulation.stake < simulation.payout ? "#ff8f8f" : "#6fe0b1" }, { label: "Spinovi sa dobitkom", value: countFormat(simulation.winRounds) + " / " + countFormat(simulation.spins), color: "#c9b9ff" }, { label: "Odigrani besplatni spinovi", value: countFormat(simulation.freeSpins), color: "#c9b9ff" }, { label: "Aktiviranja bonusa", value: countFormat(simulation.bonusRounds), color: "#c9b9ff" }, ...(simulation.theoreticalRtp === null ? [] : [{ label: "Matematički RTP (procena)", value: simulation.theoreticalRtp.toFixed(2) + "%", color: simulation.theoreticalRtp > 100 ? "#ff8f8f" : "#6fe0b1" }])].map(item => <div key={item.label} style={{ padding: 13, borderRadius: 10, border: "1px solid #ffffff12", background: "#0b1020" }}><div style={{ color: "#9298b5", fontSize: 11 }}>{item.label}</div><strong style={{ display: "block", marginTop: 7, color: item.color, fontSize: 21 }}>{item.value}</strong></div>)}</div><p style={{ fontSize: 11, color: "#a8acc6", lineHeight: 1.6, marginTop: 16 }}>Auto-configuration has already adjusted the values in this tuner and run a verification simulation. It does not write to the GitHub source code by itself; export the resulting configuration below so the actual game can be updated safely.</p>{simulation.cappedSessions > 0 && <p style={{ color: "#ffc86b", fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}><ShieldAlert size={14} style={{ verticalAlign: "middle", marginRight: 5 }}/>The safety ceiling truncated the free-spin chain in {simulation.cappedSessions} simulated rounds. Increase accuracy by lowering Book chance / bonus retriggers or reduce sample size. This run may understate RTP.</p>}<p style={{ fontSize: 11, color: "#858ba9", lineHeight: 1.6, marginBottom: 0 }}>Nasumična simulacija može jako da osciluje zbog retkih velikih dobitaka. „Matematički RTP“ je procena iz verovatnoća i tabele isplata; ne modeluje tačno retku situaciju kada zbir više dobitnih linija udara u limit maksimalne isplate. Bruto razlika isključuje troškove i bonuse. Ovo nije sertifikovani RTP za igru za pravi novac.</p></>}</section>
      </div>
      <section style={{ ...panel, marginTop: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><h2 style={h2}>7. Predlog za stvarni kod</h2><span style={{ fontSize: 11, color: "#a8acc6" }}>Ovaj predlog još ne menja igru. Pošalji mi ga ovde i ja ću ubaciti vrednosti u kod.</span></div><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 360, overflow: "auto", padding: 15, borderRadius: 10, background: "#070a15", border: "1px solid #ffffff12", fontSize: 11, color: "#c9c1ef" }}>{generated}</pre><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button type="button" onClick={() => void copy()} style={goldButton}><Copy size={15}/>{copied ? "KOPIRANO" : "KOPIRAJ PREDLOG ZA KOD"}</button><button type="button" onClick={download} style={secondaryButton}><Download size={15}/> PREUZMI FAJL</button></div><p style={{ fontSize: 12, color: "#a8acc6", lineHeight: 1.6, marginBottom: 0 }}>Klikni „KOPIRAJ PREDLOG ZA KOD“, vrati se u ovaj razgovor i nalepi tekst. Ja ću ažurirati <code>src/lib/bookOfSunriseMath.ts</code> na main. Izgled Book of Sunrise i ostali slotovi ostaju netaknuti.</p></section>
      <footer style={{ marginTop: 22, color: "#858ba9", fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}><FlaskConical size={14}/> MAXWIN · Book of Sunrise math tuning · Proposal only until reviewed and deployed.</footer>
    </div>
  </main>;
}
const panel: CSSProperties = { background: "linear-gradient(145deg,#151a30,#101426)", border: "1px solid #b2a1ff20", borderRadius: 15, padding: 18, boxShadow: "0 12px 35px #0002" };
const h2: CSSProperties = { fontSize: 16, margin: "0 0 15px", color: "#fff4d2" };
const label: CSSProperties = { display: "grid", gap: 7, fontSize: 12, color: "#a8acc6", marginBottom: 15 };
const field: CSSProperties = { width: "100%", padding: "10px 11px", background: "#0a0e1d", color: "#f4f3ff", border: "1px solid #ffffff20", borderRadius: 8, outline: "none" };
const smallField: CSSProperties = { width: "100%", minWidth: 0, padding: "7px 6px", background: "#0a0e1d", color: "#f4f3ff", border: "1px solid #ffffff20", borderRadius: 7 };
const range: CSSProperties = { width: "100%", accentColor: "#f4c66a" };
const metrics: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 0", borderBottom: "1px solid #ffffff12", fontSize: 12, color: "#a8acc6" };
const tableHead: CSSProperties = { textAlign: "left", padding: "10px 8px", color: "#a8acc6", borderBottom: "1px solid #ffffff20" };
const tableCell: CSSProperties = { padding: "7px 8px", borderBottom: "1px solid #ffffff0c", textAlign: "left" };
const presetSelected: CSSProperties = { border: "1px solid #f4c66a", background: "#44351d", color: "#ffe4a1", boxShadow: "0 0 0 1px #f4c66a22" };
const presetButton: CSSProperties = { padding: "10px 5px", borderRadius: 8, border: "1px solid #9b72ff55", background: "#17132d", color: "#c9b9ff", fontWeight: 800, fontSize: 9, lineHeight: 1.5, cursor: "pointer" };
const goldButton: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid #f4c66a55", background: "linear-gradient(110deg,#f3d38b,#dca94b)", color: "#241a20", fontWeight: 900, fontSize: 11, cursor: "pointer" };
const secondaryButton: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid #9b72ff55", background: "#17132d", color: "#eee7ff", fontWeight: 800, fontSize: 11, cursor: "pointer" };
