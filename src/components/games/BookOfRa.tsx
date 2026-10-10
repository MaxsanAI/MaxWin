import { useEffect, useRef, useState } from "react";
import { BookOpen, Crown, Shield, Flame, Sparkles, LockKeyhole, Volume2, VolumeX, Gauge, Info, Coins, Gem, Sun } from "lucide-react";
import type { CSSProperties } from "react";

type SymbolName = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";

type SpinResult = {
  id: string;
  symbols: SymbolName[];
  outcome: string;
  bet: number;
  payout: number;
  balance: number;
  mode: "spin" | "buyBonus";
  awardedFreeSpins?: number;
  freeSpinsRemaining?: number;
  winningPositions?: number[];
  wins?: { line: number; symbol: SymbolName; count: number; payout: number; positions: number[] }[];
  expandingSymbol?: SymbolName | null;
};

const symbolMeta: Record<SymbolName, { label: string; Icon: any; color: string }> = {
  book: { label: "BOOK OF RA", Icon: BookOpen, color: "#f59e0b" },
  pharaoh: { label: "PHARAOH", Icon: Crown, color: "#eab308" },
  anubis: { label: "ANUBIS", Icon: Shield, color: "#a855f7" },
  scarab: { label: "SCARAB", Icon: Sun, color: "#06b6d4" },
  statue: { label: "STATUE", Icon: Gem, color: "#10b981" },
  ace: { label: "A", Icon: Sparkles, color: "#ef4444" },
  king: { label: "K", Icon: Flame, color: "#f97316" },
  queen: { label: "Q", Icon: Coins, color: "#3b82f6" },
  jack: { label: "J", Icon: Shield, color: "#8b5cf6" },
  ten: { label: "10", Icon: Gem, color: "#64748b" },
};

function requestId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
}

export default function BookOfRaSlot() {
  const [balance, setBalance] = useState<number | null>(null);
  const [bet, setBet] = useState(5);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Choose your bet and spin the ancient reels.");
  const [soundOn, setSoundOn] = useState(false);
  const [speed, setSpeed] = useState<"slow" | "normal" | "turbo">("normal");
  const [freeSpins, setFreeSpins] = useState(0);
  const [expandingSymbol, setExpandingSymbol] = useState<SymbolName | null>(null);
  const [buyConfirm, setBuyConfirm] = useState(false);

  const defaultGrid: SymbolName[] = [
    "book", "pharaoh", "anubis",
    "scarab", "statue", "ace",
    "king", "queen", "jack",
    "ten", "book", "pharaoh",
    "scarab", "ace", "king"
  ];
  const [displaySymbols, setDisplaySymbols] = useState<SymbolName[]>(defaultGrid);
  const rollTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetch("/api/games/book-of-ra", { cache: "no-store" })
      .then(async r => {
        const d = await r.json();
        if (live && r.ok) {
          setBalance(Number(d.balance));
          setFreeSpins(Number(d.freeSpins || 0));
          if (d.expandingSymbol) setExpandingSymbol(d.expandingSymbol);
        }
      })
      .catch(() => {});
    return () => { if (rollTimer.current) clearInterval(rollTimer.current); };
  }, []);

  const play = async (action: "spin" | "buyBonus") => {
    if (busy || balance === null) return;
    if (action === "buyBonus" && balance < bet * 75) { setError("Not enough credits for Buy Bonus."); return; }
    if (action === "spin" && freeSpins <= 0 && balance < bet) { setError("Not enough credits."); return; }

    setBusy(true); setError(""); setBuyConfirm(false);
    setMessage(action === "buyBonus" ? "Opening the Sacred Book..." : freeSpins > 0 ? "Free Spin in progress..." : "Reels spinning...");

    const pool: SymbolName[] = ["book", "pharaoh", "anubis", "scarab", "statue", "ace", "king", "queen", "jack", "ten"];
    const interval = speed === "slow" ? 120 : speed === "normal" ? 75 : 35;
    rollTimer.current = window.setInterval(() => {
      setDisplaySymbols(Array.from({ length: 15 }, () => pool[Math.floor(Math.random() * pool.length)]));
    }, interval);

    try {
      const res = await fetch("/api/games/book-of-ra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, bet, requestId: requestId() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Spin failed.");

      if (rollTimer.current) clearInterval(rollTimer.current);
      setDisplaySymbols(data.result.symbols);
      setResult(data.result);
      setBalance(Number(data.balance));
      setFreeSpins(Number(data.freeSpins || 0));
      if (data.expandingSymbol) setExpandingSymbol(data.expandingSymbol);

      if (data.result.payout > 0) {
        setMessage(`WIN · ${data.result.payout.toLocaleString()} CREDITS!`);
      } else {
        setMessage(data.result.awardedFreeSpins ? `SACRED BOOK TRIGGERED · ${data.result.awardedFreeSpins} FREE SPINS!` : "No match. Spin again.");
      }
    } catch (e: any) {
      setError(e.message || "Error during spin.");
    } finally {
      if (rollTimer.current) clearInterval(rollTimer.current);
      setBusy(false);
    }
  };

  const winning = new Set(result?.winningPositions || []);

  return (
    <div className="book-of-ra-slot" style={{ background: "#0f0905", color: "#fef3c7", padding: "20px", borderRadius: "16px", maxWidth: "900px", margin: "0 auto", border: "2px solid #78350f" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <div>
          <h2 style={{ margin: 0, color: "#f59e0b", letterSpacing: "2px" }}>BOOK OF RA <small style={{ fontSize: "12px", color: "#d97706" }}>5x3 REELS</small></h2>
          <small style={{ color: "#92400e" }}>Ancient Egyptian Fortune</small>
        </div>
        <button onClick={() => setSoundOn(!soundOn)} style={{ background: "#27272a", border: "1px solid #52525b", color: "#fff", padding: "6px 12px", borderRadius: "8px", cursor: "pointer" }}>
          {soundOn ? <Volume2 size={16}/> : <VolumeX size={16}/>}
        </button>
      </div>

      {/* Reel Window (5 Kolona x 3 Reda) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", background: "#1c1917", padding: "12px", borderRadius: "12px", border: "2px solid #b45309", marginBottom: "15px" }}>
        {displaySymbols.map((name, i) => {
          const item = symbolMeta[name] || symbolMeta.book;
          const IconComponent = item.Icon;
          const isWin = winning.has(i);
          return (
            <div key={i} style={{
              height: "90px",
              background: isWin ? "#78350f" : "#292524",
              border: isWin ? "2px solid #f59e0b" : "1px solid #44403c",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s"
            }}>
              <IconComponent size={32} color={item.color} />
              <small style={{ fontSize: "10px", marginTop: "4px", color: "#d6d3d1" }}>{item.label}</small>
            </div>
          );
        })}
      </div>

      {/* Free Spins / Expanding Symbol Status Banner */}
      {freeSpins > 0 && (
        <div style={{ background: "#78350f", border: "1px solid #f59e0b", padding: "10px", borderRadius: "8px", textAlign: "center", marginBottom: "15px" }}>
          <Sparkles size={18} color="#f59e0b" style={{ verticalAlign: "middle", marginRight: "8px" }} />
          <strong>{freeSpins} FREE SPINS REMAINING</strong>
          {expandingSymbol && <span style={{ marginLeft: "15px", color: "#fef08a" }}>Expanding Symbol: <b>{symbolMeta[expandingSymbol]?.label}</b></span>}
        </div>
      )}

      {/* Professional Control Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "15px", alignItems: "center", background: "#1c1917", padding: "15px", borderRadius: "12px", border: "1px solid #44403c" }}>
        {/* Bet Control */}
        <div>
          <label style={{ fontSize: "11px", color: "#a8a29e", display: "block", marginBottom: "4px" }}>TOTAL BET</label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button disabled={busy || freeSpins > 0} onClick={() => setBet(b => Math.max(5, b - 5))} style={{ width: "32px", height: "32px", background: "#44403c", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>-</button>
            <strong style={{ fontSize: "18px", minWidth: "40px", textAlign: "center" }}>{bet}</strong>
            <button disabled={busy || freeSpins > 0} onClick={() => setBet(b => Math.min(100, b + 5))} style={{ width: "32px", height: "32px", background: "#44403c", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>+</button>
          </div>
        </div>

        {/* Main Spin Button */}
        <button
          disabled={busy || balance === null || (balance < bet && freeSpins === 0)}
          onClick={() => void play("spin")}
          style={{
            height: "54px",
            background: "linear-gradient(180deg, #f59e0b 0%, #b45309 100%)",
            border: "none",
            borderRadius: "10px",
            color: "#fff",
            fontSize: "20px",
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(180, 83, 9, 0.4)"
          }}
        >
          {busy ? "SPINNING..." : freeSpins > 0 ? "FREE SPIN" : `SPIN (${bet} CR)`}
        </button>

        {/* Balance Display */}
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "11px", color: "#a8a29e", display: "block" }}>BALANCE</span>
          <strong style={{ fontSize: "20px", color: "#fef08a" }}>{balance === null ? "—" : balance.toLocaleString()}</strong>
        </div>
      </div>

      {/* Secondary Actions (Buy Bonus & Speed) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
        <div style={{ display: "flex", gap: "5px" }}>
          {(["slow", "normal", "turbo"] as const).map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{ background: speed === s ? "#f59e0b" : "#292524", border: "1px solid #44403c", color: speed === s ? "#000" : "#fff", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", cursor: "pointer" }}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          disabled={busy || balance === null || balance < bet * 75 || freeSpins > 0}
          onClick={() => setBuyConfirm(true)}
          style={{ background: "#78350f", border: "1px solid #f59e0b", color: "#fef08a", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontWeight: "bold" }}
        >
          BUY BONUS (75× = {bet * 75} CR)
        </button>
      </div>

      {/* Buy Bonus Modal */}
      {buyConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#1c1917", border: "2px solid #f59e0b", padding: "20px", borderRadius: "12px", textAlign: "center", maxWidth: "350px" }}>
            <h3>Buy Sacred Book Bonus</h3>
            <p style={{ fontSize: "13px", color: "#d6d3d1" }}>Trigger 10 Free Spins immediately with an Expanding Symbol!</p>
            <p>Price: <strong>{bet * 75} Credits</strong></p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "15px" }}>
              <button onClick={() => void play("buyBonus")} style={{ background: "#f59e0b", color: "#000", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>Confirm</button>
              <button onClick={() => setBuyConfirm(false)} style={{ background: "#44403c", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ color: "#ef4444", textAlign: "center", marginTop: "10px" }}>{error}</p>}
      <p style={{ textAlign: "center", color: "#f59e0b", marginTop: "10px", fontSize: "14px" }}>{message}</p>
    </div>
  );
}
