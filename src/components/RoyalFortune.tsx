import { useEffect, useState } from "react";
import { Crown, Gem, Shield, Coins, Star, Flame, Zap, CircleDollarSign, Sparkles, LockKeyhole } from "lucide-react";

type SymbolName = "crown" | "gem" | "shield" | "coins" | "star" | "flame" | "zap" | "coin";
type SpinResult = { id: string; symbols: SymbolName[]; outcome: string; bet: number; payout: number; balance: number; mode: "spin" | "buyBonus"; bonusSpins?: number; };
const symbolMeta: Record<SymbolName, { label: string; Icon: typeof Crown; className: string }> = {
  crown: { label: "Royal Crown", Icon: Crown, className: "rf-symbol-crown" },
  gem: { label: "Royal Gem", Icon: Gem, className: "rf-symbol-gem" },
  shield: { label: "Royal Shield", Icon: Shield, className: "rf-symbol-shield" },
  coins: { label: "Treasure", Icon: Coins, className: "rf-symbol-coins" },
  star: { label: "Star", Icon: Star, className: "rf-symbol-star" },
  flame: { label: "Flame", Icon: Flame, className: "rf-symbol-flame" },
  zap: { label: "Lightning", Icon: Zap, className: "rf-symbol-zap" },
  coin: { label: "Gold Coin", Icon: CircleDollarSign, className: "rf-symbol-coin" },
};
const symbolNames = Object.keys(symbolMeta) as SymbolName[];
const paytable = [
  ["👑 👑 👑", "100×", "Royal Crown"],
  ["💎 💎 💎", "60×", "Royal Gem"],
  ["🛡 🛡 🛡", "40×", "Royal Shield"],
  ["🪙 🪙 🪙", "30×", "Treasure"],
  ["⭐ ⭐ ⭐", "25×", "Star"],
  ["🔥 🔥 🔥", "20×", "Flame"],
  ["⚡ ⚡ ⚡", "15×", "Lightning"],
  ["● ● ●", "10×", "Gold Coin"],
  ["Any pair", "1.125×", "Stake returned + 12.5%"],
];
function requestId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
}
export default function RoyalFortune() {
  const [balance, setBalance] = useState<number | null>(null);
  const [bet, setBet] = useState(10);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Your royal adventure starts here.");
  const [mode, setMode] = useState<"demo" | "real">("demo");
  const [bonus, setBonus] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/games/royal-fortune", { credentials: "same-origin", cache: "no-store" })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Could not load game."); if (live) setBalance(Number(d.balance)); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : "Could not load demo balance."); });
    return () => { live = false; };
  }, []);
  const play = async (action: "spin" | "buyBonus") => {
    if (busy || balance === null) return;
    if (action === "buyBonus" && balance < bet * 100) { setError("Not enough demo credits for Buy Bonus. Lower your bet or play more demo rounds."); return; }
    if (action === "spin" && balance < bet) { setError("Not enough demo credits. Lower your bet to continue."); return; }
    setBusy(true); setError(""); setMessage(action === "buyBonus" ? "Opening the Royal Bonus feature…" : "The reels are spinning…");
    try {
      const response = await fetch("/api/games/royal-fortune", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, bet, requestId: requestId() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Spin failed. Your demo balance has not been changed.");
      setResult(data.result);
      setBalance(Number(data.balance));
      setBonus(action === "buyBonus");
      setMessage(action === "buyBonus" ? `ROYAL BONUS COMPLETE · ${Number(data.result.payout).toLocaleString()} demo credits returned` : data.result.payout > 0 ? `WIN · ${Number(data.result.payout).toLocaleString()} demo credits` : "No win this time. The next spin is yours.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete the spin."); }
    finally { setBusy(false); }
  };
  return <div className="rf-game">
    <div className="rf-game-top"><div className="rf-title-lockup"><div className="rf-emblem"><Crown size={31}/><span>✦</span></div><div><span className="rf-eyebrow">MAXWIN ORIGINAL · SLOT 001</span><h3>ROYAL <em>FORTUNE</em></h3><p>Fortune favours the bold.</p></div></div><div className="rf-status"><span/> DEMO LIVE</div></div>
    <div className="rf-mode-tabs"><button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>Demo Play <small>FREE CREDITS</small></button><button className={mode === "real" ? "active rf-real-tab" : "rf-real-tab"} onClick={() => setMode("real")}>Real Money <small><LockKeyhole size={11}/> LOCKED</small></button></div>
    {mode === "real" && <div className="rf-locked-notice"><LockKeyhole size={18}/><span><b>Real-money play is not enabled.</b><small>No deposits or cash wagers are accepted. This mode stays locked until licensing, age/jurisdiction controls, audited RNG, wallet settlement and withdrawals are independently verified.</small></span></div>}
    <div className="rf-machine">
      <div className="rf-machine-top"><span>ROYAL REELS</span><span><Sparkles size={13}/> PREMIUM EDITION</span></div>
      <div className="rf-reel-window">{(result?.symbols || ["crown","gem","coins"] as SymbolName[]).map((name, i) => { const item = symbolMeta[name] || symbolMeta.crown; const Icon = item.Icon; return <div className={`rf-reel ${item.className} ${busy ? "rf-reel-spinning" : ""}`} key={(result?.id || "initial") + i}><span className="rf-reel-glow"/><Icon size={47} strokeWidth={1.7}/><small>{item.label}</small></div>; })}</div>
      <div className="rf-machine-footer"><span>3 REELS</span><span>8 SYMBOLS</span><span>1 ROYAL CHANCE</span></div>
    </div>
    <div className="rf-balance-row"><div><span>DEMO CREDIT BALANCE</span><strong>{balance === null ? "—" : balance.toLocaleString()}</strong></div><div className="rf-bet-control"><label htmlFor="rf-bet">BET / SPIN</label><div><button disabled={busy} onClick={() => setBet(v => Math.max(1, v / 2))} aria-label="Lower bet">−</button><strong>{bet.toLocaleString()}</strong><button disabled={busy} onClick={() => setBet(v => Math.min(100, v * 2))} aria-label="Raise bet">+</button></div></div></div>
    <div className="rf-action-row"><button className="rf-spin-button" disabled={busy || balance === null || balance < bet || mode === "real"} onClick={() => void play("spin")}>{busy && !bonus ? "SPINNING…" : <><span>✦</span> SPIN <small>{bet} CREDITS</small></>}</button><button className="rf-buy-button" disabled={busy || balance === null || balance < bet * 100 || mode === "real"} onClick={() => void play("buyBonus")}><Crown size={17}/><span>BUY BONUS<small>100× BET · { (bet * 100).toLocaleString() }</small></span></button></div>
    {error && <p className="rf-error" role="alert">{error}</p>}
    <p className={`rf-message ${result?.payout ? "is-win" : ""}`} aria-live="polite">{message}</p>
    {result && <div className="rf-last-result"><span>LAST RESULT <small>{result.mode === "buyBonus" ? "BUY BONUS · 10 FEATURE ROUNDS" : "BASE GAME"}</small></span><strong>+{result.payout.toLocaleString()} <small>DEMO CREDITS</small></strong></div>}
    <div className="rf-info-grid"><div><span>THEORETICAL RTP</span><b>95.5%</b></div><div><span>HOUSE EDGE</span><b>4.5%</b></div><div><span>BONUS BUY</span><b>100× BET</b></div></div>
    <details className="rf-paytable"><summary>View paytable & game rules</summary><div>{paytable.map(([symbols, multiplier, label]) => <div key={label}><span>{symbols}<small>{label}</small></span><b>{multiplier}</b></div>)}</div><p>Illustrative demo math only. RTP is a theoretical target, not a guarantee of any session outcome. The implementation is not certified for real-money gambling.</p></details>
    <div className="rf-demo-disclaimer">DEMO ONLY · Credits have no cash value and cannot be deposited, transferred, or withdrawn. Real-money play is disabled.</div>
  </div>;
}
