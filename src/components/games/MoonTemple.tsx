import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AudioLines, Crown, Gem, MoonStar, Orbit, Shield, Sparkles, Star, Sun, Volume2, VolumeX, Zap, RotateCcw } from "lucide-react";
import "./MoonTemple.css";

type SymbolId = "mask" | "idol" | "crystal" | "relic" | "scarab" | "crescent" | "blueGem" | "starGem" | "wild" | "scatter";
type Win = { symbol: SymbolId; count: number; ways: number; payout: number; positions: number[] };
type Step = { symbols: SymbolId[]; winningPositions: number[]; payout: number; wins: Win[] };
type SpinResult = { id: string; symbols: SymbolId[]; initialSymbols: SymbolId[]; steps: Step[]; payout: number; cascadeCount: number; awardedFreeSpins: number; scatterCount: number; bet: number; stake: number; mode: string; freeSpinsRemaining: number };
const symbolMeta: Record<SymbolId, { name: string; icon: typeof MoonStar; className: string; mark?: string }> = {
  mask: { name: "MOON MASK", icon: Shield, className: "mt-mask" },
  idol: { name: "GOLDEN IDOL", icon: Crown, className: "mt-idol" },
  crystal: { name: "MOON CRYSTAL", icon: Gem, className: "mt-crystal" },
  relic: { name: "ANCIENT RELIC", icon: Orbit, className: "mt-relic" },
  scarab: { name: "SCARAB", icon: Sun, className: "mt-scarab" },
  crescent: { name: "CRESCENT", icon: MoonStar, className: "mt-crescent" },
  blueGem: { name: "BLUE GEM", icon: Sparkles, className: "mt-bluegem" },
  starGem: { name: "STAR GEM", icon: Star, className: "mt-stargem" },
  wild: { name: "WILD", icon: MoonStar, className: "mt-wild", mark: "WILD" },
  scatter: { name: "SCATTER", icon: Sparkles, className: "mt-scatter", mark: "SCATTER" }
};
const formatUSD = (value: number) => "$" + (value / 100).toFixed(2);
const requestId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export default function MoonTemple({ onBackToLobby }: { onBackToLobby: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [bet, setBet] = useState(20);
  const [symbols, setSymbols] = useState<SymbolId[]>([]);
  const [winningPositions, setWinningPositions] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [freeSpins, setFreeSpins] = useState(0);
  const [win, setWin] = useState(0);
  const [cascadeCount, setCascadeCount] = useState(0);
  const [message, setMessage] = useState("THE TEMPLE AWAITS");
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);

  const tone = (frequency: number, duration: number, wave: OscillatorType = "sine") => {
    if (!soundOn || typeof window.AudioContext === "undefined") return;
    try {
      const ctx = audioContext.current || (audioContext.current = new window.AudioContext());
      if (ctx.state === "suspended") void ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(); oscillator.stop(ctx.currentTime + duration + 0.02);
    } catch {}
  };

  useEffect(() => {
    let live = true;
    fetch("/api/games/moon-temple", { cache: "no-store", credentials: "same-origin" })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load Moon Temple.");
        if (live) { setBalance(Number(data.balance)); setFreeSpins(Number(data.freeSpins || 0)); }
      })
      .catch(reason => { if (live) setError(reason instanceof Error ? reason.message : "Could not load Moon Temple."); });
    return () => { live = false; };
  }, []);

  const resetDemo = async () => {
    setResetting(true); setError("");
    try {
      const response = await fetch("/api/games/moon-temple", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resetDemo" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not reset demo balance.");
      setBalance(Number(data.balance)); setFreeSpins(Number(data.freeSpins || 0)); setMessage("DEMO BALANCE RESET");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reset demo balance."); }
    finally { setResetting(false); }
  };

  const spin = async () => {
    if (busy || balance === null || (freeSpins === 0 && balance < bet)) return;
    setBusy(true); setError(""); setWin(0); setCascadeCount(0); setWinningPositions([]);
    setMessage(freeSpins > 0 ? "FREE SPIN" : "MOONLIGHT DESCENDING");
    tone(220, 0.12, "triangle");
    try {
      const response = await fetch("/api/games/moon-temple", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "spin", bet, requestId: requestId() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Spin failed.");
      const result = data.result as SpinResult;
      setBalance(Number(data.balance)); setFreeSpins(Number(data.freeSpins || 0));
      setSymbols(result.initialSymbols || result.symbols);
      await wait(520);
      let runningWin = 0;
      for (let index = 0; index < result.steps.length; index++) {
        const step = result.steps[index];
        setSymbols(step.symbols);
        setWinningPositions(step.winningPositions);
        runningWin += step.payout;
        setWin(runningWin);
        setCascadeCount(index + 1);
        setMessage(index === 0 ? "WINNING COMBINATION" : "CASCADE WIN");
        tone(520 + index * 90, 0.18, "sine");
        await wait(560);
        if (index + 1 < result.steps.length) {
          setWinningPositions([]);
          setSymbols(result.steps[index + 1].symbols);
          await wait(260);
        }
      }
      if (result.steps.length > 0 && JSON.stringify(result.symbols) !== JSON.stringify(result.steps[result.steps.length - 1].symbols)) {
        setWinningPositions([]);
        setSymbols(result.symbols);
        await wait(380);
      } else if (result.steps.length === 0) {
        setSymbols(result.symbols);
      }
      setWinningPositions([]);
      setWin(result.payout);
      setFreeSpins(Number(result.freeSpinsRemaining ?? data.freeSpins ?? 0));
      if (result.awardedFreeSpins > 0) setMessage("MOON BONUS · 8 FREE SPINS");
      else if (result.payout > 0) setMessage("TOTAL WIN " + formatUSD(result.payout));
      else setMessage("THE MOON KEEPS ITS SECRETS");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Spin failed.");
      setMessage("SPIN INTERRUPTED");
    } finally { setBusy(false); }
  };

  const canSpin = balance !== null && (freeSpins > 0 || balance >= bet) && !busy;
  return <main className="moon-temple-game">
    <header className="mt-header">
      <button className="mt-lobby" onClick={onBackToLobby} type="button"><ArrowLeft size={15} /><span>TO LOBBY</span></button>
      <div className="mt-title">
        <div className="mt-title-kicker"><span /> MAXWIN ORIGINAL <span /></div>
        <h1>MOON <em>TEMPLE</em></h1>
        <div className="mt-subtitle"><MoonStar size={13} /> THE TEMPLE OF THE ETERNAL MOON <MoonStar size={13} /></div>
      </div>
      <div className="mt-header-spacer" />
    </header>

    <div className="mt-scene">
      <div className="mt-orb mt-orb-one" /><div className="mt-orb mt-orb-two" />
      <div className="mt-ruin mt-ruin-left"><i /><i /><i /><i /><i /></div>
      <div className="mt-ruin mt-ruin-right"><i /><i /><i /><i /><i /></div>
      <div className="mt-moon"><MoonStar size={64} strokeWidth={1.25} /></div>
      <div className="mt-scene-text"><strong>THE MOON GIVES</strong><span>ONLY TO THE WORTHY</span></div>
    </div>

    <section className="mt-board-wrap" aria-label="Moon Temple slot grid">
      <div className="mt-column-heads"><span>Ⅰ</span><span>Ⅱ</span><span>Ⅲ</span><span>Ⅳ</span><span>Ⅴ</span></div>
      <div className="mt-board">
        {symbols.length === 20 ? symbols.map((symbol, index) => {
          const meta = symbolMeta[symbol];
          const Icon = meta.icon;
          return <div key={index} className={"mt-symbol " + meta.className + (winningPositions.includes(index) ? " is-winning" : "") + (busy ? " is-spinning" : "")} style={{ animationDelay: ((index % 5) * 34 + Math.floor(index / 5) * 12) + "ms" }} aria-label={meta.name}>
            <div className="mt-symbol-art"><Icon strokeWidth={1.7} /></div>
            {meta.mark && <span className="mt-symbol-mark">{meta.mark}</span>}
          </div>;
        }) : Array.from({ length: 20 }, (_, index) => <div key={index} className="mt-symbol mt-placeholder"><div className="mt-symbol-art"><Sparkles /></div></div>)}
      </div>
    </section>

    <section className="mt-controls">
      <div className="mt-stat mt-balance"><span>BALANCE</span><strong>{balance === null ? "…" : formatUSD(balance)}</strong></div>
      <div className="mt-bet-control">
        <span>BET</span>
        <div className="mt-bet-row">
          <button type="button" disabled={busy || bet <= 20 || freeSpins > 0} onClick={() => setBet(value => Math.max(20, value - 10))} aria-label="Decrease bet">−</button>
          <strong>{formatUSD(bet)}</strong>
          <button type="button" disabled={busy || bet >= 100 || freeSpins > 0} onClick={() => setBet(value => Math.min(100, value + 10))} aria-label="Increase bet">+</button>
        </div>
      </div>
      <button className={"mt-spin" + (busy ? " is-busy" : "")} type="button" disabled={!canSpin} onClick={() => void spin()}>
        {busy ? <><AudioLines size={20} /> CASCADING</> : <><Zap size={20} fill="currentColor" /> SPIN</>}
      </button>
      <div className="mt-stat mt-win"><span>WIN</span><strong>{formatUSD(win)}</strong></div>
    </section>

    <footer className="mt-footer">
      <div className="mt-message" aria-live="polite">{message}{cascadeCount > 0 && <small> · {cascadeCount} CASCADE{cascadeCount === 1 ? "" : "S"}</small>}</div>
      <div className="mt-footer-actions">
        <span className="mt-free-spins">{freeSpins > 0 ? <><Sparkles size={14} /> {freeSpins} FREE SPINS</> : "DEMO PLAY ONLY"}</span>
        <button type="button" className="mt-sound" onClick={() => setSoundOn(value => !value}>{soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />} SOUND {soundOn ? "ON" : "OFF"}</button>
        <button type="button" className="mt-reset" onClick={() => void resetDemo()} disabled={resetting || busy}><RotateCcw size={13} /> RESET $10</button>
      </div>
    </footer>
    {error && <div className="mt-error" role="alert">{error}</div>}
    {freeSpins > 0 && <div className="mt-bonus-note">MOON BONUS ACTIVE — BET LOCKED UNTIL FREE SPINS FINISH</div>}
    <div className="mt-disclaimer">DEMO CREDITS HAVE NO CASH VALUE · RESULTS ARE GENERATED BY THE GAME SERVER</div>
  </main>;
}
