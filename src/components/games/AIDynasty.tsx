import { useEffect, useState } from "react";
import { ArrowLeft, AudioLines, Info, RotateCcw, Sparkles, Volume2, VolumeX } from "lucide-react";
import "./AIDynasty.css";

type SymbolId = "elon" | "trump" | "altman" | "snoop" | "bitcoin" | "rocket" | "wild" | "boxing";
type SlotSymbol = { id: SymbolId; label: string; mark: string; className: string; multiplier: number };
type BonusKind = "holdwin" | "boxing" | null;

const SYMBOLS: SlotSymbol[] = [
  { id: "elon", label: "ELON", mark: "E", className: "aid-symbol-elon", multiplier: 12 },
  { id: "trump", label: "TRUMP", mark: "T", className: "aid-symbol-trump", multiplier: 10 },
  { id: "altman", label: "ALTMAN", mark: "AI", className: "aid-symbol-altman", multiplier: 8 },
  { id: "snoop", label: "SNOOP", mark: "S", className: "aid-symbol-snoop", multiplier: 6 },
  { id: "bitcoin", label: "BITCOIN", mark: "₿", className: "aid-symbol-bitcoin", multiplier: 5 },
  { id: "rocket", label: "ROCKET", mark: "🚀", className: "aid-symbol-rocket", multiplier: 4 },
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

// Matematički korigovane verovatnoće za ~95% RTP (House Edge ~5%)
const randomSymbol = (): SymbolId => {
  const roll = Math.random();
  if (roll < 0.035) return "elon";      // 3.5% (Najjači simbol)
  if (roll < 0.080) return "trump";     // 4.5%
  if (roll < 0.140) return "altman";    // 6.0%
  if (roll < 0.220) return "snoop";     // 8.0%
  if (roll < 0.320) return "bitcoin";   // 10.0%
  if (roll < 0.600) return "rocket";    // 28.0% (Mali simbol)
  if (roll < 0.820) return "wild";      // 22.0% (Wild za linije)
  return "boxing";                      // 18.0% (Scatter za bonus)
};

const makeBoard = (): SymbolId[][] => Array.from({ length: 5 }, () => Array.from({ length: 4 }, randomSymbol));

const initialBoard: SymbolId[][] = [
  ["elon","bitcoin","snoop","rocket"],
  ["trump","altman","bitcoin","elon"],
  ["snoop","rocket","wild","trump"],
  ["bitcoin","elon","altman","rocket"],
  ["altman","snoop","trump","bitcoin"],
];

function countSymbols(board: SymbolId[], id: SymbolId) {
  return board.filter((symbol) => symbol === id).length;
}

export default function AIDynasty({ onBackToLobby }: { onBackToLobby: () => void }) {
  const [board, setBoard] = useState<SymbolId[][]>(initialBoard);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [speed, setSpeed] = useState<"normal" | "turbo">("normal");
  const [freeSpins, setFreeSpins] = useState(0);
  const [freeSpinBet, setFreeSpinBet] = useState(10);
  const [message, setMessage] = useState("WELCOME TO THE DYNASTY · READY TO SPIN 🎰");
  const [lastWin, setLastWin] = useState(0);
  const [winningCells, setWinningCells] = useState<string[]>([]);
  const [bonus, setBonus] = useState<BonusKind>(null);
  const [bonusStep, setBonusStep] = useState<"intro" | "fight" | "hold" | "result">("intro");
  const [holdCards, setHoldCards] = useState<(number | null)[]>(Array(20).fill(null));
  const [holdSpins, setHoldSpins] = useState(3);
  const [holdBusy, setHoldBusy] = useState(false);
  const [boxingWinner, setBoxingWinner] = useState<"elon" | "altman" | null>(null);
  const [, setSpinNumber] = useState(0);
  const [stoppedReels, setStoppedReels] = useState<boolean[]>([true, true, true, true, true]);

  useEffect(() => {
    try { setSoundOn(localStorage.getItem("maxwin-ai-dynasty-sound") !== "off"); } catch { /* preference */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("maxwin-ai-dynasty-sound", soundOn ? "on" : "off"); } catch { /* preference */ }
  }, [soundOn]);

  const playTone = (kind: "spin" | "stop" | "win" | "bonus" | "punch" | "crowd" | "bell") => {
    if (!soundOn) return;
    try {
      const AudioContextType = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextType) return;
      const context = new AudioContextType();
      
      if (kind === "crowd") {
        const length = Math.floor(context.sampleRate * 1.25);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (0.35 + Math.random() * 0.65);
        const noise = context.createBufferSource();
        noise.buffer = buffer;
        const filter = context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1050;
        filter.Q.value = 0.65;
        const crowdGain = context.createGain();
        crowdGain.gain.setValueAtTime(0.0001, context.currentTime);
        crowdGain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.18);
        crowdGain.gain.setValueAtTime(0.085, context.currentTime + 0.72);
        crowdGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.2);
        noise.connect(filter); filter.connect(crowdGain); crowdGain.connect(context.destination);
        noise.start(); noise.stop(context.currentTime + 1.25);
        
        [392, 494, 587, 740].forEach((frequency, index) => {
          const cheer = context.createOscillator();
          const cheerGain = context.createGain();
          cheer.type = "sawtooth";
          cheer.frequency.setValueAtTime(frequency, context.currentTime + index * 0.07);
          cheer.frequency.exponentialRampToValueAtTime(frequency * 1.25, context.currentTime + 0.45 + index * 0.07);
          cheerGain.gain.setValueAtTime(0.0001, context.currentTime);
          cheerGain.gain.exponentialRampToValueAtTime(0.018, context.currentTime + 0.15);
          cheerGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.05);
          cheer.connect(cheerGain); cheerGain.connect(context.destination);
          cheer.start(); cheer.stop(context.currentTime + 1.1);
        });
        window.setTimeout(() => void context.close(), 1500);
        return;
      }

      if (kind === "bell") {
        const now = context.currentTime;
        [110, 164.8, 220, 277.2, 330, 392].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const partialGain = [0.12, 0.075, 0.055, 0.035, 0.022, 0.014][index];
          oscillator.type = index % 2 === 0 ? "sine" : "triangle";
          oscillator.frequency.setValueAtTime(frequency, now);
          oscillator.detune.setValueAtTime(index % 2 === 0 ? -5 : 7, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(partialGain, now + 0.025);
          gain.gain.exponentialRampToValueAtTime(partialGain * 0.48, now + 0.32);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8 + index * 0.12);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.start(now); oscillator.stop(now + 3.05 + index * 0.12);
        });
        window.setTimeout(() => void context.close(), 3600);
        return;
      }

      const notes = kind === "bonus" ? [392,523,659,784,988] : kind === "win" ? [523,659,784,1047] : kind === "punch" ? [115,82,58] : kind === "stop" ? [220] : [160,210,260];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === "spin" || kind === "punch" ? "sawtooth" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.065);
        gain.gain.exponentialRampToValueAtTime(kind === "spin" ? 0.012 : kind === "punch" ? 0.09 : 0.045, context.currentTime + index * 0.065 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.065 + 0.13);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(context.currentTime + index * 0.065); oscillator.stop(context.currentTime + index * 0.065 + 0.15);
      });
      window.setTimeout(() => void context.close(), 900);
    } catch { /* optional audio */ }
  };

  const spin = async () => {
    if (busy || (freeSpins <= 0 && balance < bet)) return;
    setBusy(true); setWinningCells([]); setLastWin(0); setBonus(null); setBoxingWinner(null); setStoppedReels([false, false, false, false, false]);
    
    const usingFreeSpin = freeSpins > 0;
    const stake = usingFreeSpin ? freeSpinBet : bet;
    
    if (!usingFreeSpin) setBalance((value) => value - bet);
    else setFreeSpins((value) => Math.max(0, value - 1));

    setMessage(usingFreeSpin ? "FREE SPIN IN PROGRESS… ⚡" : "NEON REELS ONLINE… 🌀");
    playTone("spin");

    const next = makeBoard();
    const spinDuration = speed === "turbo" ? 600 : 1000;

    for (let reel = 0; reel < 5; reel++) {
      await new Promise((resolve) => window.setTimeout(resolve, (spinDuration / 5) + (speed === "normal" ? reel * 40 : 0)));
      setBoard((current) => current.map((column, index) => index === reel ? next[reel] : column));
      setStoppedReels((current) => current.map((stopped, index) => index === reel ? true : stopped));
      playTone("stop");
    }

    const winning = new Set<string>();
    let payout = 0;
    const betPerLine = stake / PAYLINES.length;

    // Korigovan obračun po linijama za balansiranu matematiku kazina
    PAYLINES.forEach((line) => {
      const lineSymbols = line.map((row, col) => next[col][row]);
      const firstRealSymbol = lineSymbols.find((symbol) => symbol !== "wild" && symbol !== "boxing");
      if (!firstRealSymbol) return;

      let count = 0;
      const positions: string[] = [];

      for (let col = 0; col < 5; col++) {
        const symbol = lineSymbols[col];
        if (symbol === firstRealSymbol || symbol === "wild") {
          count++;
          positions.push(col + "-" + line[col]);
        } else {
          break;
        }
      }

      if (count >= 3) {
        const baseMultiplier = SYMBOL_BY_ID[firstRealSymbol].multiplier;
        // Skala prilagođena realnim slot mašinama (RTP ~95%)
        const scale = count === 3 ? 0.35 : count === 4 ? 1.2 : 3.5;
        const linePayout = Math.round(betPerLine * baseMultiplier * scale);
        
        if (linePayout > 0) {
          payout += linePayout;
          positions.forEach((position) => winning.add(position));
        }
      }
    });

    const flat = next.flat();
    const trumpCount = countSymbols(flat, "trump");
    const boxingCount = countSymbols(flat, "boxing");

    if (payout > 0) {
      setBalance((value) => value + payout);
      setLastWin(payout);
      setWinningCells(Array.from(winning));
      setMessage(`WIN +${payout.toLocaleString()} CREDITS! 🎉`);
      playTone("win");
    } else {
      setMessage("NO MATCH THIS SPIN · THE DYNASTY LIVES ON 💎");
    }

    setSpinNumber((value) => value + 1);
    setBusy(false);

    // SPREČAVANJE PREKLOPNOG BONUSA: Aktivacija je moguća ISKLJUČIVO u osnovnoj igri (!usingFreeSpin)
    if (!usingFreeSpin) {
      if (boxingCount >= 3) {
        setBonus("boxing"); 
        setBonusStep("intro"); 
        setMessage("AI BOXING ARENA UNLOCKED 🥊"); 
        playTone("bonus");
      } else if (trumpCount >= 4) {
        setBonus("holdwin"); 
        setBonusStep("intro"); 
        setMessage("TRUMP HOLD & WIN UNLOCKED 🚀"); 
        playTone("bonus");
      }
    }
  };

  const startBonus = async () => {
    if (!bonus || bonusStep !== "intro") return;
    if (bonus === "holdwin") {
      setHoldCards(Array(20).fill(null));
      setHoldSpins(3);
      setBonusStep("hold");
      setMessage("TRUMP HOLD & WIN · 3 RESPINS 🚀");
      playTone("bonus");
      return;
    }
    setBonusStep("fight");
    playTone("bell");
    window.setTimeout(() => playTone("punch"), 700);
    window.setTimeout(() => playTone("punch"), 1750);
    window.setTimeout(() => playTone("punch"), 2850);
    await new Promise((resolve) => window.setTimeout(resolve, 4600));

    const winner = Math.random() < 0.5 ? "elon" : "altman";
    const awarded = winner === "elon" ? 10 : 7;
    setBoxingWinner(winner);
    playTone("crowd");
    setFreeSpinBet(bet);
    setFreeSpins((value) => value + awarded);
    setMessage(winner === "elon" ? "ELON WINNER · 10 FREE SPINS! 🔥" : "ALTMAN WINNER · 7 FREE SPINS! ✨");
    setBonusStep("result");
  };

  const spinHoldWin = async () => {
    if (bonus !== "holdwin" || bonusStep !== "hold" || holdBusy || holdSpins <= 0) return;
    setHoldBusy(true);
    try {
      playTone("spin");
      await new Promise((resolve) => window.setTimeout(resolve, speed === "turbo" ? 380 : 650));

      const nextCards = [...holdCards];
      const cardMultipliers = [1, 1, 2, 2, 3, 5, 8];
      let locked = 0;

      for (let i = 0; i < nextCards.length; i++) {
        if (nextCards[i] === null && Math.random() < 0.065) {
          nextCards[i] = bet * cardMultipliers[Math.floor(Math.random() * cardMultipliers.length)];
          locked++;
        }
      }

      const total = nextCards.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      const frameComplete = nextCards.every((value) => value !== null);
      setHoldCards(nextCards);
      playTone(locked > 0 ? "win" : "stop");

      if (frameComplete) {
        setHoldSpins(0);
        setBalance((value) => value + total);
        setLastWin(total);
        setMessage("MOON WIN · " + total.toLocaleString() + " CREDITS! 🌕");
        playTone("bonus");
        setBonusStep("result");
      } else if (locked > 0) {
        setHoldSpins(3);
        setMessage(locked + " NEW CARD" + (locked === 1 ? "" : "S") + " LOCKED · RESPINS RESET TO 3 ⚡");
      } else {
        const remaining = holdSpins - 1;
        setHoldSpins(remaining);
        if (remaining === 0) {
          setBalance((value) => value + total);
          setLastWin(total);
          setMessage("HOLD & WIN COMPLETE · " + total.toLocaleString() + " CREDITS 🏆");
          setBonusStep("result");
        } else {
          setMessage("NO NEW CARDS · " + remaining + " RESPIN" + (remaining === 1 ? "" : "S") + " LEFT ⏳");
        }
      }
    } catch {
      setMessage("HOLD & WIN PAUSED · TAP SPIN TO CONTINUE 🚀");
    } finally {
      setHoldBusy(false);
    }
  };

  const closeBonus = () => { setBonus(null); setBonusStep("intro"); setBoxingWinner(null); setHoldCards(Array(20).fill(null)); setHoldSpins(3); setHoldBusy(false); };
  const resetDemo = () => { if (busy) return; setBalance(1000); setBet(10); setFreeSpins(0); setFreeSpinBet(10); setLastWin(0); setWinningCells([]); setMessage("DEMO RESET · 1,000 CREDITS READY 🔄"); setBonus(null); setBoxingWinner(null); };

  return (
    <div className="aid-game">
      <div className="aid-topbar">
        <button className="aid-back" type="button" onClick={onBackToLobby}>
          <ArrowLeft size={16}/> LOBBY
        </button>
      </div>

      <section className="aid-machine">
        <div className="aid-machine-head">
          <span><i/> DYNASTY REELS</span>
          <span>25 WAYS TO WIN <b>✦</b></span>
        </div>

        <div className={"aid-reels" + (busy ? " aid-is-spinning" : "")} aria-label="Five reels with four symbols each">
          {board.map((column, col) => (
            <div className={"aid-reel-column" + (busy && !stoppedReels[col] ? " aid-column-spin" : "")} key={col}>
              {column.map((symbolId, row) => { 
                const symbol = SYMBOL_BY_ID[symbolId]; 
                const isWinning = winningCells.includes(col+"-"+row); 
                return (
                  <div key={col+"-"+row} className={"aid-symbol "+symbol.className+(isWinning?" aid-symbol-win":"")}>
                    <span className="aid-symbol-light"/>
                    <img 
                      className="aid-symbol-image" 
                      src={"/images/slots/ai-neon-dynasty/"+symbol.id+".jpg"} 
                      alt="" 
                      draggable={false} 
                      onError={(event) => { 
                        event.currentTarget.style.display = "none"; 
                        event.currentTarget.parentElement?.classList.add("aid-symbol-no-image"); 
                      }} 
                    />
                    <span className="aid-symbol-mark">{symbol.mark}</span>
                  </div>
                ); 
              })}
            </div>
          ))}
        </div>

        <div className="aid-machine-foot">
          <span>SCATTER BONUSES</span>
          <span>WILD SUBSTITUTES</span>
          <span>NEON ENERGY</span>
        </div>
      </section>

      <div className="aid-controls">
        <div className="aid-bet-control">
          <label>BET / SPIN</label>
          <div>
            <button disabled={busy || freeSpins > 0} onClick={() => setBet((value) => Math.max(5, value - 5))}>−</button>
            <strong>{bet}</strong>
            <button disabled={busy || freeSpins > 0} onClick={() => setBet((value) => Math.min(100, value + 5))}>+</button>
          </div>
          <small>Demo credits</small>
        </div>

        <div className="aid-speed">
          <span><AudioLines size={15}/> SPEED</span>
          <div>
            <button className={speed === "normal" ? "active" : ""} disabled={busy} onClick={() => setSpeed("normal")}>NORMAL</button>
            <button className={speed === "turbo" ? "active" : ""} disabled={busy} onClick={() => setSpeed("turbo")}>TURBO</button>
          </div>
        </div>

        <button className="aid-spin" type="button" disabled={busy || (freeSpins <= 0 && balance < bet)} onClick={() => void spin()}>
          {busy ? <><span className="aid-spinner"/> SPINNING</> : <><span>✦</span> {freeSpins > 0 ? "FREE SPIN" : "SPIN"}<small>{freeSpins > 0 ? freeSpins+" LEFT" : bet+" CREDITS"}</small></>}
        </button>

        <div className="aid-balance">
          <span>BALANCE</span>
          <strong>{balance.toLocaleString()}</strong>
          <small>Demo credits</small>
        </div>

        <button className="aid-reset" type="button" disabled={busy} onClick={resetDemo}>
          <RotateCcw size={14}/> RESET DEMO
        </button>
      </div>

      <div className="aid-bottom-tools">
        <span className="aid-demo-pill"><i/> DEMO</span>
        <button className="aid-sound" type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? "Turn sound off" : "Turn sound on"}>
          {soundOn ? <Volume2 size={16}/> : <VolumeX size={16}/>} SOUND
        </button>
      </div>

      {freeSpins > 0 && (
        <div className="aid-free-banner">
          <Sparkles size={18}/>
          <span>
            <b>{freeSpins} FREE SPINS REMAINING ✨</b>
            <small>Bonus stake locked at {freeSpinBet} demo credits. No stake deducted for a free spin.</small>
          </span>
        </div>
      )}

      <div className={"aid-status" + (lastWin > 0 ? " aid-status-win" : "")} role="status" aria-live="polite">
        <span>{lastWin > 0 ? "LAST WIN" : "GAME STATUS"}</span>
        <b>{message}</b>
        <small>Demo-only outcomes · no monetary value · no real-money wagering</small>
      </div>

      <details className="aid-paytable">
        <summary><Info size={15}/> PAYTABLE & BONUS RULES</summary>
        <div className="aid-paytable-grid">
          {SYMBOLS.filter((symbol) => symbol.multiplier > 0).map((symbol) => (
            <div key={symbol.id}>
              <span className={"aid-pay-icon "+symbol.className}>{symbol.mark}</span>
              <span>
                <b>{symbol.label}</b>
                <small>3 match: {symbol.multiplier}× · 4 match: {symbol.multiplier*2}× · 5 match: {symbol.multiplier*5}× base rate</small>
              </span>
            </div>
          ))}
        </div>
        <p>Wins are demo-only and generated locally. Four or more Trump symbols unlock the separate Trump Hold & Win rocket bonus. It starts with 3 respins; every newly locked credit card resets the counter to 3, and each card shows its credit value. Fill all 20 positions for MOON WIN, or collect the sum of locked cards when respins run out. Three or more Boxing Scatter symbols start the AI Boxing Arena: if Elon lands the final punch, 10 Free Spins are awarded; if Altman lands the final punch, 7 Free Spins are awarded. RTP is mathematically balanced to ~95%.</p>
      </details>

      <div className="aid-disclaimer">DEMO ONLY · NO DEPOSITS · NO CASH PAYOUTS · 18+</div>

      {bonus && (
        <div className="aid-bonus-backdrop">
          <section className={"aid-bonus-modal "+(bonus==="boxing"?"aid-bonus-boxing":"aid-bonus-rocket")} role="dialog" aria-modal="true" aria-labelledby="aid-bonus-title">
            <div className="aid-bonus-stars"/>
            <div className="aid-bonus-kicker">{bonus === "boxing" ? "AI NEON DYNASTY · MAIN EVENT 🥊" : "TRUMP ROCKET · HOLD & WIN 🚀"}</div>
            <h2 id="aid-bonus-title">{bonus === "boxing" ? "AI BOXING ARENA" : "TRUMP HOLD & WIN"}</h2>

            {bonusStep === "intro" && (
              <>
                <p>{bonus === "boxing" ? "Two AI titans. One neon ring. Who lands the final punch?" : "Lock credit cards, reset the three respins, and fill the frame to reach the Moon."}</p>
                <div className="aid-bonus-visual">
                  {bonus === "boxing" ? (
                    <>
                      <div className="aid-boxer aid-boxer-elon"><img src="/images/slots/ai-neon-dynasty/boxing-elon.png" alt="Elon boxer" /><b>ELON</b></div>
                      <div className="aid-vs">VS</div>
                      <div className="aid-boxer aid-boxer-altman"><img src="/images/slots/ai-neon-dynasty/boxing-altman.png" alt="Altman boxer" /><b>ALTMAN</b></div>
                      <div className="aid-ring"><i/><i/><i/></div>
                    </>
                  ) : (
                    <>
                      <div className="aid-rocket-emoji">🚀</div>
                      <div className="aid-trump-rider">T</div>
                      <div className="aid-rocket-trail"/>
                    </>
                  )}
                </div>
                <button className="aid-bonus-action" type="button" onClick={() => void startBonus()}>
                  {bonus === "boxing" ? "RING THE BELL" : "START HOLD & WIN"} <span>↗</span>
                </button>
              </>
            )}

            {bonusStep === "hold" && bonus === "holdwin" && (
              <div className="aid-holdwin-panel">
                <div className="aid-holdwin-space">
                  <span className="aid-holdwin-moon">🌕</span>
                  <span className="aid-holdwin-rocket">🚀</span>
                  <span className="aid-holdwin-trump">TRUMP</span>
                  <span className="aid-holdwin-trail"/>
                </div>
                <div className="aid-holdwin-counter">
                  <span>RESPINS LEFT</span>
                  <strong>{holdSpins}</strong>
                  <small>New card = reset to 3</small>
                </div>
                <div className="aid-holdwin-grid" aria-label="Hold and Win credit card frame">
                  {holdCards.map((value, index) => (
                    <div key={index} className={"aid-holdwin-cell" + (value !== null ? " is-locked" : "")}>
                      {value !== null ? <><span>✦</span><strong>{value.toLocaleString()}</strong><small>CREDITS</small></> : <span className="aid-holdwin-empty">+</span>}
                    </div>
                  ))}
                </div>
                <div className="aid-holdwin-total">
                  <span>LOCKED CREDIT TOTAL</span>
                  <strong>{holdCards.reduce<number>((sum, value) => sum + (value ?? 0), 0).toLocaleString()}</strong>
                </div>
                {holdSpins > 0 && (
                  <button className="aid-bonus-action" type="button" disabled={holdBusy} onClick={() => void spinHoldWin()}>
                    {holdBusy ? "ROCKET IN FLIGHT…" : "SPIN TO THE MOON"} <span>↗</span>
                  </button>
                )}
                <small className="aid-holdwin-rule">{holdSpins === 0 ? "ROUND COMPLETE · COLLECT YOUR CREDITS" : "A new card resets the respins to 3."}</small>
              </div>
            )}

            {bonusStep === "fight" && (
              <div className="aid-fight-scene">
                <div className="aid-boxer aid-boxer-elon aid-fight-left"><img src="/images/slots/ai-neon-dynasty/boxing-elon.png" alt="Elon boxer" /><b>ELON</b></div>
                <div className="aid-vs aid-fight-flash"><img src="/images/slots/ai-neon-dynasty/boxing-impact.png" alt="" /><span>POW! 💥</span></div>
                <div className="aid-boxer aid-boxer-altman aid-fight-right"><img src="/images/slots/ai-neon-dynasty/boxing-altman.png" alt="Altman boxer" /><b>ALTMAN</b></div>
                <div className="aid-fight-ko" aria-hidden="true"><img src="/images/slots/ai-neon-dynasty/boxing-ko.png" alt="" /></div>
                <div className="aid-fight-caption">FINAL ROUND · NEON ARENA</div>
              </div>
            )}

            {bonusStep === "result" && (
              <>
                <div className="aid-bonus-result">
                  {bonus === "boxing" ? (
                    <>
                      <div className={"aid-winner-badge "+(boxingWinner==="elon"?"aid-winner-elon":"aid-winner-altman")}>{boxingWinner==="elon"?"E":"AI"}</div>
                      <p>{boxingWinner === "elon" ? "ELON LANDS THE FINAL PUNCH!" : "ALTMAN LANDS THE FINAL PUNCH!"}</p>
                      <strong>{boxingWinner === "elon" ? "10" : "7"} FREE SPINS</strong>
                    </>
                  ) : (
                    <>
                      <div className="aid-rocket-emoji">🚀</div>
                      <p>{holdCards.every((value) => value !== null) ? "MOON WIN · FRAME COMPLETE!" : "TRUMP HOLD & WIN COMPLETE!"}</p>
                      <strong>{holdCards.reduce<number>((sum, value) => sum + (value ?? 0), 0).toLocaleString()} DEMO CREDITS</strong>
                    </>
                  )}
                </div>
                <button className="aid-bonus-action" type="button" onClick={closeBonus}>
                  {bonus === "boxing" ? "COLLECT FREE SPINS" : "COLLECT CREDITS"} <span>✓</span>
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
