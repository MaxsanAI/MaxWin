import { useState } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck, Wallet, Users, Gift, ArrowDownToLine, ArrowUpFromLine, LockKeyhole, Activity } from "lucide-react";

type Overview = {
  status: { realMoneyPlayEnabled: boolean; depositsEnabled: boolean; automaticWithdrawalsEnabled: boolean; minimumDepositUsd: number; depositStepUsd: number; welcomeFreeSpins: number; welcomeSpinValueUsd: number; minimumWithdrawalUsd: number };
  stats: Record<string, number>;
  recentTransactions: Array<{ id: string; username: string; asset: string; kind: string; status: string; amountUnits: string; txHash: string | null; createdAt: string }>;
  recentWithdrawals: Array<{ id: string; username: string; asset: string; status: string; amountUnits: string; address: string; txHash: string | null; createdAt: string }>;
  notice: string;
};

const moneyUnits = (units: string, asset: string) => {
  const value = Number(units || 0) / 1e9;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${asset}`;
};

export default function AdminPanel() {
  const [key, setKey] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async (candidate = key) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/overview", { headers: { "X-MAXWIN-ADMIN-KEY": candidate }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load admin dashboard.");
      setOverview(data as Overview); setKey(candidate); setAuthorized(true);
    } catch (e) { setAuthorized(false); setOverview(null); setError(e instanceof Error ? e.message : "Could not load admin dashboard."); }
    finally { setBusy(false); }
  };

  const card = (label: string, value: number | undefined, icon: React.ReactNode) => (
    <article className="mw-admin-stat" key={label}><span className="mw-admin-stat-icon">{icon}</span><span className="mw-admin-stat-label">{label}</span><strong>{(value ?? 0).toLocaleString()}</strong></article>
  );

  return <main className="mw-admin-shell">
    <style>{`
      .mw-admin-shell{min-height:100vh;background:radial-gradient(ellipse at 15% 0%,#24204d 0,transparent 42%),#080b18;color:#f4f3ff;padding:clamp(16px,3vw,36px);font-family:Inter,system-ui,sans-serif}
      .mw-admin-wrap{max-width:1400px;margin:auto}.mw-admin-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:28px}
      .mw-admin-brand{display:flex;align-items:center;gap:12px;font-weight:900;letter-spacing:.08em;font-size:21px}.mw-admin-brand-mark{display:grid;place-items:center;width:44px;height:44px;border:1px solid #7c68e7;border-radius:14px;color:#f6c967;background:#241e49}
      .mw-admin-eyebrow{color:#b8a8ff;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.mw-admin-title{font-size:clamp(27px,4vw,40px);margin:8px 0 4px;letter-spacing:-.04em}.mw-admin-muted{color:#a7abc4;font-size:13px;line-height:1.6}
      .mw-admin-btn{border:1px solid #3b4160;background:#151a2f;color:#f7f5ff;border-radius:11px;padding:11px 15px;font-weight:750;cursor:pointer;display:inline-flex;align-items:center;gap:8px}.mw-admin-btn:disabled{opacity:.55;cursor:wait}
      .mw-admin-alert{padding:14px 16px;border-radius:12px;background:#301b2a;border:1px solid #71394d;color:#ffc5d0;margin:16px 0}.mw-admin-login{max-width:520px;margin:9vh auto;padding:28px;border:1px solid #292e49;border-radius:20px;background:#101529;box-shadow:0 24px 80px #0005}
      .mw-admin-input{width:100%;box-sizing:border-box;margin:10px 0 14px;padding:13px 14px;background:#090e20;border:1px solid #343a58;border-radius:10px;color:#fff;font:inherit}
      .mw-admin-status{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.mw-admin-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #543a47;color:#ffc1c8;background:#281a28;border-radius:99px;padding:8px 11px;font-size:12px;font-weight:800}
      .mw-admin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin:18px 0 30px}.mw-admin-stat{padding:17px;border:1px solid #282e49;border-radius:15px;background:linear-gradient(145deg,#151a31,#0e1223);min-width:0}.mw-admin-stat-icon{color:#d8bc70;display:block;margin-bottom:13px}.mw-admin-stat-label{display:block;color:#a9aec8;font-size:12px}.mw-admin-stat strong{display:block;font-size:29px;margin-top:6px;letter-spacing:-.04em}
      .mw-admin-section{margin:24px 0;border:1px solid #282e49;border-radius:16px;overflow:hidden;background:#0e1325}.mw-admin-section-head{padding:17px 19px;border-bottom:1px solid #282e49;display:flex;align-items:center;justify-content:space-between;gap:10px}.mw-admin-section h2{font-size:16px;margin:0}.mw-admin-table-wrap{overflow:auto}.mw-admin-table{width:100%;border-collapse:collapse;min-width:720px;font-size:12px}.mw-admin-table th,.mw-admin-table td{text-align:left;padding:13px 16px;border-bottom:1px solid #222842;white-space:nowrap}.mw-admin-table th{color:#969dbb;font-size:10px;text-transform:uppercase;letter-spacing:.1em}.mw-admin-table td{color:#e9e8f5}.mw-admin-status-text{color:#f4ce76;text-transform:uppercase;font-size:10px;font-weight:850}.mw-admin-empty{padding:20px;color:#9ca3bf;font-size:13px}
      .mw-admin-rules{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.mw-admin-rule{padding:16px;background:#13182d;border:1px solid #282e49;border-radius:13px}.mw-admin-rule b{display:block;font-size:21px;color:#f3ce77;margin:7px 0}.mw-admin-rule span{color:#a9aec8;font-size:12px}
      @media(max-width:900px){.mw-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mw-admin-rules{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.mw-admin-grid{gap:9px}.mw-admin-stat{padding:13px}.mw-admin-stat strong{font-size:24px}.mw-admin-rules{grid-template-columns:1fr}.mw-admin-login{padding:20px}}
    `}</style>
    <div className="mw-admin-wrap">
      {!authorized || !overview ? <section className="mw-admin-login">
        <div className="mw-admin-brand"><span className="mw-admin-brand-mark"><ShieldCheck size={24}/></span> MAXWIN <span className="mw-admin-eyebrow">ADMIN</span></div>
        <h1 className="mw-admin-title">Secure control room</h1>
        <p className="mw-admin-muted">Read-only overview of accounts, bonus records, wallet activity and withdrawal requests. Enter the Cloudflare secret configured as <b>MAXWIN_ADMIN_KEY</b>.</p>
        <form onSubmit={e => { e.preventDefault(); void load(key); }}>
          <label className="mw-admin-muted" htmlFor="mw-admin-key">Admin access key</label>
          <input id="mw-admin-key" className="mw-admin-input" type="password" autoComplete="current-password" value={key} onChange={e => setKey(e.target.value)} required />
          <button className="mw-admin-btn" type="submit" disabled={busy}><LockKeyhole size={16}/>{busy ? "Checking access…" : "Open admin dashboard"}</button>
        </form>
        {error && <div className="mw-admin-alert" role="alert">{error}</div>}
        <p className="mw-admin-muted">This page does not activate payments or real-money wagers. Never put the admin key in source code or a public repository.</p>
      </section> : <>
        <header className="mw-admin-top"><div><div className="mw-admin-brand"><span className="mw-admin-brand-mark"><ShieldCheck size={24}/></span> MAXWIN <span className="mw-admin-eyebrow">ADMIN</span></div><h1 className="mw-admin-title">Casino overview</h1><p className="mw-admin-muted">Internal preparation dashboard · live database counts, read-only controls</p></div><div style={{display:"flex",gap:9,flexWrap:"wrap"}}><button className="mw-admin-btn" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/>{busy ? "Refreshing…" : "Refresh data"}</button><button className="mw-admin-btn" onClick={() => {setAuthorized(false);setOverview(null);setKey("");}}><ArrowLeft size={16}/>Lock dashboard</button></div></header>
        <div className="mw-admin-status"><span className="mw-admin-pill"><LockKeyhole size={14}/> REAL-MONEY PLAY DISABLED</span><span className="mw-admin-pill"><Wallet size={14}/> DEPOSITS DISABLED</span><span className="mw-admin-pill"><ArrowUpFromLine size={14}/> AUTOMATIC PAYOUTS DISABLED</span></div>
        <div className="mw-admin-grid">
          {card("Registered users",overview.stats.users,<Users size={20}/>)}{card("Wallet transactions",overview.stats.walletTransactions,<Activity size={20}/>)}{card("Pending deposits",overview.stats.pendingDeposits,<ArrowDownToLine size={20}/>)}{card("Pending withdrawals",overview.stats.pendingWithdrawals,<ArrowUpFromLine size={20}/>)}{card("Withdrawal requests",overview.stats.withdrawalRequests,<Wallet size={20}/>)}{card("Wallet accounts",overview.stats.walletAccounts,<Wallet size={20}/>)}{card("Free spins awarded",overview.stats.freeSpinsAwarded,<Gift size={20}/>)}{card("Bonus records",overview.stats.bonusRecords,<Gift size={20}/>)}
        </div>
        <section className="mw-admin-section"><div className="mw-admin-section-head"><h2>Configured policies</h2><span className="mw-admin-eyebrow">Preview only</span></div><div className="mw-admin-rules" style={{padding:14}}><div className="mw-admin-rule"><span>Minimum deposit</span><b>$5</b><span>Increase in $5 steps</span></div><div className="mw-admin-rule"><span>Welcome spins</span><b>25 × $0.20</b><span>All 25 spins must be completed</span></div><div className="mw-admin-rule"><span>Minimum withdrawal</span><b>$10</b><span>Across the casino, subject to bonus rules</span></div><div className="mw-admin-rule"><span>Available free spins</span><b>{overview.stats.freeSpinsAvailable.toLocaleString()}</b><span>Promotional records, not cash</span></div></div></section>
        <section className="mw-admin-section"><div className="mw-admin-section-head"><h2>Recent wallet transactions</h2><span className="mw-admin-muted">Latest 30</span></div><div className="mw-admin-table-wrap"><table className="mw-admin-table"><thead><tr><th>User</th><th>Type</th><th>Asset</th><th>Amount</th><th>Status</th><th>Transaction hash</th><th>Date</th></tr></thead><tbody>{overview.recentTransactions.length ? overview.recentTransactions.map(tx => <tr key={tx.id}><td>{tx.username}</td><td>{tx.kind}</td><td>{tx.asset}</td><td>{moneyUnits(tx.amountUnits,tx.asset)}</td><td className="mw-admin-status-text">{tx.status}</td><td>{tx.txHash ? tx.txHash.slice(0,16)+"…" : "—"}</td><td>{new Date(tx.createdAt).toLocaleString()}</td></tr>) : <tr><td colSpan={7} className="mw-admin-empty">No wallet transactions recorded yet.</td></tr>}</tbody></table></div></section>
        <section className="mw-admin-section"><div className="mw-admin-section-head"><h2>Withdrawal requests</h2><span className="mw-admin-muted">Latest 30 · view only</span></div><div className="mw-admin-table-wrap"><table className="mw-admin-table"><thead><tr><th>User</th><th>Asset</th><th>Amount</th><th>Destination</th><th>Status</th><th>Transaction hash</th><th>Date</th></tr></thead><tbody>{overview.recentWithdrawals.length ? overview.recentWithdrawals.map(w => <tr key={w.id}><td>{w.username}</td><td>{w.asset}</td><td>{moneyUnits(w.amountUnits,w.asset)}</td><td>{w.address.slice(0,13)}…</td><td className="mw-admin-status-text">{w.status}</td><td>{w.txHash ? w.txHash.slice(0,16)+"…" : "—"}</td><td>{new Date(w.createdAt).toLocaleString()}</td></tr>) : <tr><td colSpan={7} className="mw-admin-empty">No withdrawal requests recorded yet.</td></tr>}</tbody></table></div></section>
        <p className="mw-admin-muted">{overview.notice}</p>
      </>}
    </div>
  </main>;
}
