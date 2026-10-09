import { useEffect, useState } from "react";
import { Crown, Gem, Shield, Coins, Star, Flame, Zap, CircleDollarSign, Sparkles, LockKeyhole, Volume2, Maximize2 } from "lucide-react";

type SymbolName = "crown" | "gem" | "shield" | "coins" | "star" | "flame" | "zap" | "coin";
type SpinResult = { id: string; symbols: SymbolName[]; outcome: string; bet: number; payout: number; balance: number; mode: "spin" | "buyBonus"; bonusSpins?: number; winningPositions?: number[]; wins?: { line: number; symbol: SymbolName; count: number; payout: number; positions: number[] }[] };
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
const paytable = [
  ["CROWN", "3: 60× · 4: 300× · 5: 3,250×"],
  ["GEM", "3: 45× · 4: 225× · 5: 2,450×"],
  ["SHIELD", "3: 35× · 4: 175× · 5: 1,900×"],
  ["TREASURE", "3: 25× · 4: 125× · 5: 1,400×"],
  ["STAR", "3: 20× · 4: 100× · 5: 1,100×"],
  ["FLAME", "3: 15× · 4: 75× · 5: 850×"],
  ["LIGHTNING", "3: 10× · 4: 50× · 5: 600×"],
  ["GOLD COIN", "3: 5× · 4: 25× · 5: 350×"],
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
  const [message, setMessage] = useState("Choose your stake and spin the reels.");
  const [mode, setMode] = useState<"demo" | "real">("demo");
  const [soundOn, setSoundOn] = useState(false);
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
    setBusy(true); setError(""); setMessage(action === "buyBonus" ? "Entering the Royal Bonus feature…" : "Reels spinning…");
    try {
      const response = await fetch("/api/games/royal-fortune", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, bet, requestId: requestId() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Spin failed. Your demo balance has not been changed.");
      setResult(data.result);
      setBalance(Number(data.balance));
      setMessage(action === "buyBonus" ? `BONUS COMPLETE · ${Number(data.result.payout).toLocaleString()} credits returned across ${data.result.bonusSpins || 10} rounds` : data.result.payout > 0 ? `WIN · ${Number(data.result.payout).toLocaleString()} demo credits` : "No win this spin. Try another combination.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete the spin."); }
    finally { setBusy(false); }
  };
  const symbols = result?.symbols?.length === 15 ? result.symbols : ["crown","gem","shield","coins","star","flame","zap","coin","gem","crown","coins","shield","star","coin","flame"] as SymbolName[];
  const winning = new Set(result?.winningPositions || []);
  return <div className="rf-game">
    <div className="rf-game-top">
      <div className="rf-title-lockup"><div className="rf-emblem"><Crown size={28}/><span>✦</span></div><div><span className="rf-eyebrow">MAXWIN ORIGINAL · SLOT 001</span><h3>ROYAL <em>FORTUNE</em></h3><p>Fortune favours the bold.</p></div></div>
      <div className="rf-top-actions"><span className="rf-status"><span/> DEMO PLAY</span><button className="rf-icon-button" type="button" onClick={() => setSoundOn(v => !v)} aria-label={soundOn ? "Turn sound off" : "Turn sound on"} title="Sound controls visual preference only"><Volume2 size={16}/><small>{soundOn ? "ON" : "OFF"}</small></button></div>
    </div>
    <div className="rf-mode-tabs"><button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>DEMO PLAY <small>FREE CREDITS</small></button><button className={mode === "real" ? "active rf-real-tab" : "rf-real-tab"} onClick={() => setMode("real")}>REAL MONEY <small><LockKeyhole size={11}/> LOCKED</small></button></div>
    {mode === "real" && <div className="rf-locked-notice"><LockKeyhole size={18}/><span><b>Real-money play is not enabled.</b><small>No deposits or cash wagers are accepted. Licensing, age/jurisdiction controls, audited RNG, wallet settlement and withdrawals must be independently verified first.</small></span></div>}
    <div className="rf-cabinet">
      <div className="rf-cabinet-header"><span><Sparkles size={14}/> ROYAL REELS</span><span>5 REELS <i/> 3 ROWS <i/> 10 PAYLINES</span></div>
      <div className="rf-reel-window" aria-label="Five reels with three symbols each">
        {symbols.map((name, i) => { const item = symbolMeta[name] || symbolMeta.crown; const Icon = item.Icon; return <div className={`rf-reel ${item.className} ${winning.has(i) ? "rf-reel-win" : ""} ${busy ? "rf-reel-spinning" : ""}`} key={(result?.id || "initial") + i}><span className="rf-reel-glow"/><Icon size={35} strokeWidth={1.8}/><small>{item.label}</small></div>; })}
      </div>
      <div className="rf-machine-footer"><span>10 ACTIVE PAYLINES</span><span>WINS PAY LEFT TO RIGHT</span><span>WILD FEATURES COMING SOON</span></div>
    </div>
    <div className="rf-balance-row"><div className="rf-credit-panel"><span>DEMO CREDIT BALANCE</span><strong>{balance === null ? "—" : balance.toLocaleString()}</strong><small>Credits have no cash value</small></div><div className="rf-bet-control"><label htmlFor="rf-bet">TOTAL BET / SPIN</label><div><button disabled={busy} onClick={() => setBet(v => Math.max(10, v - 10))} aria-label="Lower bet">−</button><strong>{bet.toLocaleString()}</strong><button disabled={busy} onClick={() => setBet(v => Math.min(100, v + 10))} aria-label="Raise bet">+</button></div><small>10 paylines · {bet / 10} credit per line</small></div></div>
    <div className="rf-action-row"><button className="rf-spin-button" disabled={busy || balance === null || balance < bet || mode === "real"} onClick={() => void play("spin")}>{busy ? <><span className="rf-spinner"/> SPINNING…</> : <><span>✦</span> SPIN <small>{bet} CREDITS</small></>}</button><button className="rf-buy-button" disabled={busy || balance === null || balance < bet * 100 || mode === "real"} onClick={() => void play("buyBonus")}><Crown size={18}/><span>BUY BONUS<small>100× BET · {(bet * 100).toLocaleString()}</small></span></button></div>
    {error && <p className="rf-error" role="alert">{error}</p>}
    <p className={`rf-message ${result?.payout ? "is-win" : ""}`} aria-live="polite">{message}</p>
    {result && <div className="rf-last-result"><span>LAST RESULT <small>{result.mode === "buyBonus" ? `BUY BONUS · ${result.bonusSpins || 10} ROUNDS` : "BASE GAME"}</small></span><strong>+{result.payout.toLocaleString()} <small>DEMO CREDITS</small></strong></div>}
    <div className="rf-info-grid"><div><span>THEORETICAL RTP</span><b>~96%</b></div><div><span>PAYLINES</span><b>10</b></div><div><span>BONUS BUY</span><b>100× BET</b></div></div>
    <details className="rf-paytable"><summary>PAYTABLE & GAME RULES</summary><div>{paytable.map(([name, values]) => <div key={name}><span>{name}</span><b>{values}</b></div>)}</div><p>Demo game math only. RTP is a theoretical calculation, not a guarantee of any session outcome. This game is not independently certified and cannot accept real-money wagers.</p></details>
    <div className="rf-demo-disclaimer">DEMO ONLY · No deposits, transfers or cash withdrawals. Real-money play remains locked.</div>
  </div>;
}
