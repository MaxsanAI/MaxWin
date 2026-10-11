import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AudioLines, Crown, Gauge, Info, RotateCcw, Sparkles, Volume2, VolumeX, Zap } from "lucide-react";
import "./AIDynasty.css";

type SymbolId = "elon" | "trump" | "altman" | "snoop" | "bitcoin" | "rocket" | "wild" | "boxing";
type SlotSymbol = { id: SymbolId; label: string; mark: string; className: string; multiplier: number };
type BonusKind = "rocket" | "boxing" | null;

const SYMBOLS: SlotSymbol[] = [
  { id: "elon", label: "ELON", mark: "E", className: "aid-symbol-elon", multiplier: 12 },
  { id: "trump", label: "TRUMP", mark: "T", className: "aid-symbol-trump", multiplier: 10 },
  { id: "altman", label: "ALTMAN", mark: "AI", className: "aid-symbol-altman", multiplier: 9 },
  { id: "snoop", label: "SNOOP", mark: "S", className: "aid-symbol-snoop", multiplier: 7 },
  { id: "bitcoin", label: "BITCOIN", mark: "₿", className: "aid-symbol-bitcoin", multiplier: 6 },
  { id: "rocket", label: "ROCKET", mark: "🚀", className: "aid-symbol-rocket", multiplier: 5 },
  { id: "wild", label: "AI KING WILD", mark: "♛", className: "aid-symbol-wild", multiplier: 0 },
  { id: "boxing", label: "BOXING SCATTER", mark: "🥊", className: "aid-symbol-boxing", multiplier: 0 },
];
const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((symbol) => [symbol.id, symbol])) as Record<SymbolId, SlotSymbol>;
const PAYLINES: number[][] = [
  [0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[3,3,3,3,3],
  [0,1,2,1,0],[3,2,1,2,3],[0,0,1,2,3],[3,3,2,1,0],
  [1,0,0,0,1],[2,3,3,3,2],[0,1,1,1,0],[3,2,2,2,3],
  [1,2,3,2,1],[2,1,0,1,2],[0,1,0,1,0],[3,2,3,2,3],
  [1,1,0,1,1],[2,2,3,2,2],[0,2,2,2,0],[3,1,1,1,3],
  [0,2,1,2,0],[3,1,2,1,3],[1,0,1,0,1],[2,3,2,3,2],[0,3,1,3,0],
];
const randomSymbol = (): SymbolId => {
  const roll = Math.random();
  if (roll < 0.16) return "elon";
  if (roll < 0.205) return "trump";
  if (roll < 0.365) return "altman";
  if (roll < 0.525) return "snoop";
  if (roll < 0.685) return "bitcoin";
  if (roll < 0.845) return "rocket";
  if (roll < 0.955) return "wild";
  return "boxing";
};
const makeBoard = (): SymbolId[][] => Array.from({ length: 5 }, () => Array.from({ length: 4 }, randomSymbol));
const initialBoard: SymbolId[][] = [
  ["elon","bitcoin","snoop","rocket"],["trump","altman","bitcoin","elon"],["snoop","rocket","wild","trump"],["bitcoin","elon","altman","rocket"],["altman","snoop","trump","bitcoin"],
];
function countSymbols(board: SymbolId[], id: SymbolId) { return board.filter((symbol) => symbol === id).length; }

export default function AIDynasty({ onBackToLobby }: { onBackToLobby: () => void }) {
  const [board, setBoard] = useState<SymbolId[][]>(initialBoard);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [speed, setSpeed] = useState<"normal" | "turbo">("normal");
  const [freeSpins, setFreeSpins] = useState(0);
  const [freeSpinBet, setFreeSpinBet] = useState(10);
  const [message, setMessage] = useState("WELCOME TO THE DYNASTY · READY TO SPIN");
  const [lastWin, setLastWin] = useState(0);
  const [winningCells, setWinningCells] = useState<string[]>([]);
  const [bonus, setBonus] = useState<BonusKind>(null);
  const [bonusStep, setBonusStep] = useState<"intro" | "fight" | "result">("intro");
  const [boxingWinner, setBoxingWinner] = useState<"elon" | "altman" | null>(null);
  const [spinNumber, setSpinNumber] = useState(0);

  useEffect(() => {
    try { setSoundOn(localStorage.getItem("maxwin-ai-dynasty-sound") !== "off"); } catch { /* optional preference */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("maxwin-ai-dynasty-sound", soundOn ? "on" : "off"); } catch { /* optional preference */ }
  }, [soundOn]);

  const flatBoard = useMemo(() => board.flat(), [board]);
  const playTone = (kind: "spin" | "stop" | "win" | "bonus") => {
    if (!soundOn) return;
    try {
      const AudioContextType = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextType) return;
      const context = new AudioContextType();
      const notes = kind === "bonus" ? [392,523,659,784,988] : kind === "win" ? [523,659,784,1047] : kind === "stop" ? [220] : [160,210,260];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === "spin" ? "sawtooth" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.065);
        gain.gain.exponentialRampToValueAtTime(kind === "spin" ? 0.012 : 0.045, context.currentTime + index * 0.065 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.065 + 0.13);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(context.currentTime + index * 0.065); oscillator.stop(context.currentTime + index * 0.065 + 0.15);
      });
      window.setTimeout(() => void context.close(), 900);
    } catch { /* audio is optional */ }
  };

  const spin = async () => {
    if (busy || (freeSpins <= 0 && balance < bet)) return;
    setBusy(true); setWinningCells([]); setLastWin(0); setBonus(null); setBoxingWinner(null);
    const usingFreeSpin = freeSpins > 0;
    const stake = usingFreeSpin ? freeSpinBet : bet;
    if (!usingFreeSpin) setBalance((value) => value - bet);
    else setFreeSpins((value) => Math.max(0, value - 1));
    setMessage(usingFreeSpin ? "FREE SPIN IN PROGRESS…" : "NEON REELS ONLINE…");
    playTone("spin");
    const next = makeBoard();
    const spinDuration = speed === "turbo" ? 650 : 1050;
    for (let reel = 0; reel < 5; reel++) {
      await new Promise((resolve) => window.setTimeout(resolve, (spinDuration / 5) + (speed === "normal" ? reel * 45 : 0)));
      setBoard((current) => current.map((column, index) => index === reel ? next[reel] : column));
      playTone("stop");
    }
    const winning = new Set<string>();
    let payout = 0;
    PAYLINES.forEach((line, lineIndex) => {
      const first = line.map((row, col) => next[col][row]).find((symbol) => symbol !== "wild");
      if (!first || first === "boxing") return;
      let count = 0;
      const positions: string[] = [];
      for (let col = 0; col < 5; col++) {
        const symbol = next[col][line[col]];
        if (symbol === first || symbol === "wild") { count++; positions.push(col + "-" + line[col]); }
        else break;
      }
      if (count >= 3) {
        const baseMultiplier = SYMBOL_BY_ID[first].multiplier;
        payout += Math.round(stake * baseMultiplier * (count === 3 ? 1 : count === 4 ? 2 : 5) / PAYLINES.length);
        positions.forEach((position) => winning.add(position));
      }
    });
    const flat = next.flat();
    const trumpCount = countSymbols(flat, "trump");
    const boxingCount = countSymbols(flat, "boxing");
    if (payout > 0) {
      setBalance((value) => value + payout);
      setLastWin(payout);
      setWinningCells(Array.from(winning));
      setMessage("WIN +"+payout.toLocaleString()+" DEMO CREDITS");
      playTone("win");
    } else setMessage("NO MATCH THIS SPIN · THE DYNASTY LIVES ON");
    setSpinNumber((value) => value + 1);
    setBusy(false);
    if (boxingCount >= 3) {
      setBonus("boxing"); setBonusStep("intro"); setMessage("AI BOXING ARENA UNLOCKED"); playTone("bonus");
    } else if (trumpCount >= 3) {
      setBonus("rocket"); setBonusStep("intro"); setMessage("TRUMP AFTER SPINS UNLOCKED"); playTone("bonus");
    }
  };

  const startBonus = async () => {
    if (!bonus || bonusStep !== "intro") return;
    setBonusStep("fight");
    await new Promise((resolve) => window.setTimeout(resolve, 2300));
    if (bonus === "boxing") {
      const winner = Math.random() < 0.5 ? "elon" : "altman";
      const awarded = winner === "elon" ? 12 : 8;
      setBoxingWinner(winner);
      setFreeSpinBet(bet);
      setFreeSpins((value) => value + awarded);
      setMessage((winner === "elon" ? "ELON LANDS THE FINAL PUNCH · 12 FREE SPINS!" : "ALTMAN LANDS THE FINAL PUNCH · 8 FREE SPINS!"));
      setBonusStep("result");
    } else {
      setFreeSpinBet(bet);
      setFreeSpins((value) => value + 10);
      setMessage("TRUMP IS GOING TO THE MOON · 10 FREE SPINS!");
      setBonusStep("result");
    }
  };

  const closeBonus = () => { setBonus(null); setBonusStep("intro"); setBoxingWinner(null); };
  const resetDemo = () => { if (busy) return; setBalance(1000); setBet(10); setFreeSpins(0); setFreeSpinBet(10); setLastWin(0); setWinningCells([]); setMessage("DEMO RESET · 1,000 CREDITS READY"); setBonus(null); setBoxingWinner(null); };

  return <div className="aid-game">
    <div className="aid-topbar"><button className="aid-back" type="button" onClick={onBackToLobby}><ArrowLeft size={16}/> LOBBY</button><div className="aid-brand"><span className="aid-brand-icon"><Crown size={19}/></span><span><b>AI <em>DYNASTY</em></b><small>NEON CELEBRITY SLOT</small></span></div><div className="aid-top-actions"><span className="aid-demo-pill"><i/> DEMO</span><button className="aid-sound" type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? "Turn sound off" : "Turn sound on"}>{soundOn ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div></div>
    <section className="aid-hero"><div className="aid-hero-copy"><span className="aid-kicker"><Sparkles size={13}/> RULE THE FUTURE. OWN THE DYNASTY.</span><h1>AI <span>DYNASTY</span></h1><p>Fame. Fortune. Full-throttle chaos.</p></div><div className="aid-orb aid-orb-one"/><div className="aid-orb aid-orb-two"/><div className="aid-hero-characters"><span className="aid-hero-portrait aid-portrait-elon">E</span><span className="aid-hero-portrait aid-portrait-trump">T</span><span className="aid-hero-portrait aid-portrait-altman">AI</span></div><div className="aid-hero-stamp">MAXWIN<br/><small>ORIGINALS</small></div></section>
    <div className="aid-game-meta"><span><Zap size={14}/> 5 REELS · 4 ROWS</span><span><Crown size={14}/> 25 PAYLINES</span><span><Gauge size={14}/> DEMO CREDITS ONLY</span></div>
    <section className="aid-machine">
      <div className="aid-machine-head"><span><i/> DYNASTY REELS</span><span>25 WAYS TO WIN <b>✦</b></span></div>
      <div className={"aid-reels" + (busy ? " aid-is-spinning" : "")} aria-label="Five reels with four symbols each">
        {board.map((column, col) => <div className={"aid-reel-column" + (busy ? " aid-column-spin" : "")} key={col}>{column.map((symbolId, row) => { const symbol = SYMBOL_BY_ID[symbolId]; const isWinning = winningCells.includes(col+"-"+row); return <div key={col+"-"+row} className={"aid-symbol "+symbol.className+(isWinning?" aid-symbol-win":"")}><span className="aid-symbol-light"/><span className="aid-symbol-mark">{symbol.mark}</span><b>{symbol.label}</b></div>; })}</div>)}
      </div>
      <div className="aid-machine-foot"><span>SCATTER BONUSES</span><span>WILD SUBSTITUTES</span><span>NEON ENERGY</span></div>
    </section>
    {freeSpins > 0 && <div className="aid-free-banner"><Sparkles size={18}/><span><b>{freeSpins} FREE SPINS REMAINING</b><small>Bonus stake locked at {freeSpinBet} demo credits. No stake deducted for a free spin.</small></span></div>}
    <div className="aid-controls">
      <div className="aid-bet-control"><label>BET / SPIN</label><div><button disabled={busy || freeSpins > 0} onClick={() => setBet((value) => Math.max(5, value - 5))}>−</button><strong>{bet}</strong><button disabled={busy || freeSpins > 0} onClick={() => setBet((value) => Math.min(100, value + 5))}>+</button></div><small>Demo credits</small></div>
      <div className="aid-speed"><span><AudioLines size={15}/> SPEED</span><div><button className={speed === "normal" ? "active" : ""} disabled={busy} onClick={() => setSpeed("normal")}>NORMAL</button><button className={speed === "turbo" ? "active" : ""} disabled={busy} onClick={() => setSpeed("turbo")}>TURBO</button></div></div>
      <button className="aid-spin" type="button" disabled={busy || (freeSpins <= 0 && balance < bet)} onClick={() => void spin()}>{busy ? <><span className="aid-spinner"/> SPINNING</> : <><span>✦</span> {freeSpins > 0 ? "FREE SPIN" : "SPIN"}<small>{freeSpins > 0 ? freeSpins+" LEFT" : bet+" CREDITS"}</small></>}</button>
      <div className="aid-balance"><span>BALANCE</span><strong>{balance.toLocaleString()}</strong><small>Demo credits</small></div>
      <button className="aid-reset" type="button" disabled={busy} onClick={resetDemo}><RotateCcw size={14}/> RESET DEMO</button>
    </div>
    <div className={"aid-status" + (lastWin > 0 ? " aid-status-win" : "")} role="status" aria-live="polite"><span>{lastWin > 0 ? "LAST WIN" : "GAME STATUS"}</span><b>{message}</b><small>Demo-only outcomes · no monetary value · no real-money wagering</small></div>
    <details className="aid-paytable"><summary><Info size={15}/> PAYTABLE & BONUS RULES</summary><div className="aid-paytable-grid">{SYMBOLS.filter((symbol) => symbol.multiplier > 0).map((symbol) => <div key={symbol.id}><span className={"aid-pay-icon "+symbol.className}>{symbol.mark}</span><span><b>{symbol.label}</b><small>3 match: {symbol.multiplier}× · 4 match: {symbol.multiplier*2}× · 5 match: {symbol.multiplier*5}× base rate</small></span></div>)}</div><p>Wins are demo-only and generated locally. Three or more Trump symbols unlock 10 Rocket Free Spins. Three or more Boxing Scatter symbols start the AI Boxing Arena: if Elon lands the final punch, 12 Free Spins are awarded; if Altman lands the final punch, 8 Free Spins are awarded. This demo RTP has not been independently certified.</p></details>
    <div className="aid-disclaimer">DEMO ONLY · NO DEPOSITS · NO CASH PAYOUTS · 18+</div>
    {bonus && <div className="aid-bonus-backdrop"><section className={"aid-bonus-modal "+(bonus==="boxing"?"aid-bonus-boxing":"aid-bonus-rocket")} role="dialog" aria-modal="true" aria-labelledby="aid-bonus-title">
      <div className="aid-bonus-stars"/><div className="aid-bonus-kicker">{bonus === "boxing" ? "AI DYNASTY · MAIN EVENT" : "TRUMP AFTER SPINS"}</div><h2 id="aid-bonus-title">{bonus === "boxing" ? "AI BOXING ARENA" : "TO THE MOON!"}</h2>
      {bonusStep === "intro" && <><p>{bonus === "boxing" ? "Two AI titans. One neon ring. Who lands the final punch?" : "Trump is boarding Elon’s rocket. Prepare for lift-off."}</p><div className="aid-bonus-visual">{bonus === "boxing" ? <><div className="aid-boxer aid-boxer-elon"><span>E</span><b>ELON</b></div><div className="aid-vs">VS</div><div className="aid-boxer aid-boxer-altman"><span>AI</span><b>ALTMAN</b></div><div className="aid-ring"><i/><i/><i/></div></> : <><div className="aid-rocket-emoji">🚀</div><div className="aid-trump-rider">T</div><div className="aid-rocket-trail"/></>}</div><button className="aid-bonus-action" type="button" onClick={() => void startBonus()}>{bonus === "boxing" ? "RING THE BELL" : "LAUNCH THE ROCKET"} <span>↗</span></button></>}
      {bonusStep === "fight" && <div className="aid-fight-scene"><div className="aid-boxer aid-boxer-elon aid-fight-left"><span>E</span><b>ELON</b></div><div className="aid-vs aid-fight-flash">POW!</div><div className="aid-boxer aid-boxer-altman aid-fight-right"><span>AI</span><b>ALTMAN</b></div><div className="aid-fight-caption">FINAL ROUND · NEON ARENA</div></div>}
      {bonusStep === "result" && <><div className="aid-bonus-result">{bonus === "boxing" ? <><div className={"aid-winner-badge "+(boxingWinner==="elon"?"aid-winner-elon":"aid-winner-altman")}>{boxingWinner==="elon"?"E":"AI"}</div><p>{boxingWinner === "elon" ? "ELON LANDS THE FINAL PUNCH!" : "ALTMAN LANDS THE FINAL PUNCH!"}</p><strong>{boxingWinner === "elon" ? "12" : "8"} FREE SPINS</strong></> : <><div className="aid-rocket-emoji">🚀</div><p>TRUMP IS GOING TO THE MOON!</p><strong>10 FREE SPINS</strong></>}</div><button className="aid-bonus-action" type="button" onClick={closeBonus}>COLLECT FREE SPINS <span>✓</span></button></>}
    </section></div>}
  </div>;
}
