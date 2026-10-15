import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck, Wallet, Users, Gift, ArrowDownToLine, ArrowUpFromLine, LockKeyhole, Activity, Trash2 } from "lucide-react";

type Overview = {
  status: { realMoneyPlayEnabled: boolean; depositsEnabled: boolean; automaticWithdrawalsEnabled: boolean; manualWithdrawalApprovalEnabled: boolean; minimumDepositUsd: number; depositStepUsd: number; welcomeFreeSpins: number; welcomeSpinValueUsd: number; minimumWithdrawalUsd: number };
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
  const [withdrawalBusy, setWithdrawalBusy] = useState<string | null>(null);
  const [withdrawalTxHashes, setWithdrawalTxHashes] = useState<Record<string, string>>({});
  const [testUsername, setTestUsername] = useState("");
  const [testAmount, setTestAmount] = useState("100");
  const [testCreditBusy, setTestCreditBusy] = useState(false);
  const [testCreditMessage, setTestCreditMessage] = useState("");
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [hideTransactionsBusy, setHideTransactionsBusy] = useState(false);
  const [transactionVisibilityMessage, setTransactionVisibilityMessage] = useState("");


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

  const updateWithdrawal = async (requestId: string, action: "approve" | "reject" | "mark_sent") => {
    setWithdrawalBusy(requestId); setError("");
    try {
      const response = await fetch("/api/admin/withdrawals", { method: "POST", headers: { "Content-Type": "application/json", "X-MAXWIN-ADMIN-KEY": key }, body: JSON.stringify({ requestId, action, txHash: withdrawalTxHashes[requestId] || "" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update withdrawal request.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update withdrawal request."); }
    finally { setWithdrawalBusy(null); }
  };

  const hideSelectedTransactions = async () => {
    if (!selectedTransactionIds.length) return;
    setHideTransactionsBusy(true); setError(""); setTransactionVisibilityMessage("");
    try {
      const response = await fetch("/api/admin/wallet-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MAXWIN-ADMIN-KEY": key },
        body: JSON.stringify({ transactionIds: selectedTransactionIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not remove selected transactions from this list.");
      setSelectedTransactionIds([]);
      setTransactionVisibilityMessage(data.message || "Selected transactions removed from this list. Ledger records are preserved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove selected transactions from this list.");
    } finally {
      setHideTransactionsBusy(false);
    }
  };

  const addTestBalance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTestCreditBusy(true); setTestCreditMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/test-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MAXWIN-ADMIN-KEY": key },
        body: JSON.stringify({ username: testUsername.trim(), amountUsd: Number(testAmount) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not add simulated balance.");
      setTestCreditMessage(`Added ${Number(data.amountUsd).toFixed(2)} in simulated credits to ${data.username}. Test conversion: ${Number(data.testSolUsd || 100).toFixed(2)}/SOL (fixed; no live price API used). Estimated test balance: ${Number(data.balanceUsdEstimate).toFixed(2)}. Deposits and withdrawals are disabled for this account.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add simulated balance.");
    } finally {
      setTestCreditBusy(false);
    }
  };

  const card = (label: string, value: number | undefined, icon: ReactNode) => (
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
        <p className="mw-admin-muted">Overview of accounts, wallet activity, and manual withdrawal approvals. Enter the Cloudflare secret configured as <b>MAXWIN_ADMIN_KEY</b>.</p>
        <form onSubmit={e => { e.preventDefault(); void load(key); }}>
          <label className="mw-admin-muted" htmlFor="mw-admin-key">Admin access key</label>
          <input id="mw-admin-key" className="mw-admin-input" type="password" autoComplete="current-password" value={key} onChange={e => setKey(e.target.value)} required />
          <button className="mw-admin-btn" type="submit" disabled={busy}><LockKeyhole size={16}/>{busy ? "Checking access…" : "Open admin dashboard"}</button>
        </form>
        {error && <div className="mw-admin-alert" role="alert">{error}</div>}
        <p className="mw-admin-muted">This dashboard records wallet activity and lets you approve SOL withdrawals manually. Never put the admin key in source code or a public repository.</p>
      </section> : <>
        <header className="mw-admin-top"><div><div className="mw-admin-brand"><span className="mw-admin-brand-mark"><ShieldCheck size={24}/></span> MAXWIN <span className="mw-admin-eyebrow">ADMIN</span></div><h1 className="mw-admin-title">Casino overview</h1><p className="mw-admin-muted">Internal dashboard · approve and record SOL payouts manually</p></div><div style={{display:"flex",gap:9,flexWrap:"wrap"}}><a className="mw-admin-btn" href="/admin/support" style={{textDecoration:"none"}}>Support Inbox</a><button className="mw-admin-btn" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/>{busy ? "Refreshing…" : "Refresh data"}</button><button className="mw-admin-btn" onClick={() => {setAuthorized(false);setOverview(null);setKey("");}}><ArrowLeft size={16}/>Lock dashboard</button></div></header>
        {error && <div className="mw-admin-alert" role="alert">{error}</div>}
        <div className="mw-admin-status"><span className="mw-admin-pill" style={{borderColor:"#3c624d",color:"#a7efc1",background:"#15271f"}}><ShieldCheck size={14}/> BOOK OF RA REAL PLAY ENABLED</span><span className="mw-admin-pill" style={{borderColor:"#3c624d",color:"#a7efc1",background:"#15271f"}}><Wallet size={14}/> SOL DEPOSIT VERIFICATION ENABLED</span><span className="mw-admin-pill"><ArrowUpFromLine size={14}/> MANUAL SOL PAYOUTS</span><span className="mw-admin-pill" style={{borderColor:"#3c624d",color:"#a7efc1",background:"#15271f"}}><ShieldCheck size={14}/> MANUAL SOL APPROVALS ENABLED</span></div>
        <div className="mw-admin-grid">
          {card("Registered users",overview.stats.users,<Users size={20}/>)}{card("Wallet transactions",overview.stats.walletTransactions,<Activity size={20}/>)}{card("Pending deposits",overview.stats.pendingDeposits,<ArrowDownToLine size={20}/>)}{card("Pending withdrawals",overview.stats.pendingWithdrawals,<ArrowUpFromLine size={20}/>)}{card("Withdrawal requests",overview.stats.withdrawalRequests,<Wallet size={20}/>)}{card("Wallet accounts",overview.stats.walletAccounts,<Wallet size={20}/>)}{card("Free spins awarded",overview.stats.freeSpinsAwarded,<Gift size={20}/>)}{card("Bonus records",overview.stats.bonusRecords,<Gift size={20}/>)}
        </div>
        <section className="mw-admin-section"><div className="mw-admin-section-head"><h2>Configured policies</h2><span className="mw-admin-eyebrow">Preview only</span></div><div className="mw-admin-rules" style={{padding:14}}><div className="mw-admin-rule"><span>Minimum deposit</span><b>$5</b><span>Increase in $5 steps</span></div><div className="mw-admin-rule"><span>Welcome spins</span><b>25 × $0.20</b><span>All 25 spins must be completed</span></div><div className="mw-admin-rule"><span>Minimum withdrawal</span><b>$10</b><span>Across the casino, subject to bonus rules</span></div><div className="mw-admin-rule"><span>Available free spins</span><b>{overview.stats.freeSpinsAvailable.toLocaleString()}</b><span>Promotional records, not cash</span></div></div></section>
        <section className="mw-admin-section">
          <div className="mw-admin-section-head"><h2>Simulate real-money balance</h2><span className="mw-admin-eyebrow">TEST ONLY · NO CASH-OUT</span></div>
          <div style={{padding:18}}>
            <p className="mw-admin-muted">Add test credits to a registered username so you can test Book of Ra in real-play mode. Test credits use a fixed $100/SOL conversion and do not call live price APIs. The account is marked as a test account; deposits and withdrawals are blocked. These credits are not real funds.</p>
            <form onSubmit={addTestBalance} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,alignItems:"end",maxWidth:760}}>
              <label className="mw-admin-muted">Registered username
                <input className="mw-admin-input" style={{marginBottom:0}} value={testUsername} onChange={e=>setTestUsername(e.target.value)} maxLength={32} autoComplete="off" placeholder="Exact account username" required />
              </label>
              <label className="mw-admin-muted">Amount to add (USD)
                <input className="mw-admin-input" style={{marginBottom:0}} type="number" min="1" max="10000" step="0.01" value={testAmount} onChange={e=>setTestAmount(e.target.value)} required />
              </label>
              <button className="mw-admin-btn" type="submit" disabled={testCreditBusy || !testUsername.trim() || !testAmount}><Wallet size={16}/>{testCreditBusy ? "Adding test balance…" : "Add test balance"}</button>
            </form>
            {testCreditMessage && <p role="status" style={{color:"#a7efc1",fontSize:13,marginTop:14}}>{testCreditMessage}</p>}
          </div>
        </section>
        <section className="mw-admin-section"><div className="mw-admin-section-head"><div><h2>Recent wallet transactions</h2><span className="mw-admin-muted">Latest 30 · select entries to remove them from this view</span></div><button className="mw-admin-btn" type="button" onClick={() => void hideSelectedTransactions()} disabled={!selectedTransactionIds.length || hideTransactionsBusy}><Trash2 size={15}/>{hideTransactionsBusy ? "Removing…" : `Remove selected (${selectedTransactionIds.length})`}</button></div>{transactionVisibilityMessage && <p role="status" className="mw-admin-muted" style={{padding:"8px 18px",color:"#a7efc1"}}>{transactionVisibilityMessage}</p>}<div className="mw-admin-table-wrap"><table className="mw-admin-table"><thead><tr><th><input aria-label="Select all visible wallet transactions" type="checkbox" checked={overview.recentTransactions.length > 0 && overview.recentTransactions.every(tx => selectedTransactionIds.includes(tx.id))} onChange={e => setSelectedTransactionIds(e.target.checked ? overview.recentTransactions.map(tx => tx.id) : [])}/></th><th>User</th><th>Type</th><th>Asset</th><th>Amount</th><th>Status</th><th>Transaction hash</th><th>Date</th></tr></thead><tbody>{overview.recentTransactions.length ? overview.recentTransactions.map(tx => <tr key={tx.id}><td><input aria-label={`Select transaction ${tx.id}`} type="checkbox" checked={selectedTransactionIds.includes(tx.id)} onChange={e => setSelectedTransactionIds(prev => e.target.checked ? [...new Set([...prev,tx.id])] : prev.filter(id => id !== tx.id))}/></td><td>{tx.username}</td><td>{tx.kind}</td><td>{tx.asset}</td><td>{moneyUnits(tx.amountUnits,tx.asset)}</td><td className="mw-admin-status-text">{tx.status}</td><td>{tx.txHash ? tx.txHash.slice(0,16)+"…" : "—"}</td><td>{new Date(tx.createdAt).toLocaleString()}</td></tr>) : <tr><td colSpan={8} className="mw-admin-empty">No visible wallet transactions.</td></tr>}</tbody></table></div><p className="mw-admin-muted" style={{padding:"0 18px 16px"}}>This removes entries only from the Recent wallet transactions view. Financial ledger records and the total transaction count are preserved for auditability.</p></section>
        <section className="mw-admin-section"><div className="mw-admin-section-head"><h2>Withdrawal requests</h2><span className="mw-admin-muted">Latest 30 · manual approval</span></div><div className="mw-admin-table-wrap"><table className="mw-admin-table"><thead><tr><th>User</th><th>Asset</th><th>Amount</th><th>Destination</th><th>Status</th><th>Transaction / action</th><th>Date</th></tr></thead><tbody>{overview.recentWithdrawals.length ? overview.recentWithdrawals.map(w => <tr key={w.id}><td>{w.username}</td><td>{w.asset}</td><td>{moneyUnits(w.amountUnits,w.asset)}</td><td title={w.address}>{w.address.slice(0,13)}…</td><td className="mw-admin-status-text">{w.status}</td><td>{w.txHash ? <a href={"https://solscan.io/tx/" + encodeURIComponent(w.txHash)} target="_blank" rel="noreferrer" style={{color:"#d8bc70"}}>{w.txHash.slice(0,16)}…</a> : w.status === "pending" ? <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="mw-admin-btn" disabled={withdrawalBusy===w.id} onClick={() => void updateWithdrawal(w.id,"approve")}>Approve</button><button className="mw-admin-btn" disabled={withdrawalBusy===w.id} onClick={() => void updateWithdrawal(w.id,"reject")}>Reject</button></div> : w.status === "approved" ? <div style={{display:"grid",gap:7,minWidth:220}}><input className="mw-admin-input" style={{margin:0}} aria-label={"Solana transaction signature for "+w.username} placeholder="Paste confirmed Solana signature" value={withdrawalTxHashes[w.id] || ""} onChange={e => setWithdrawalTxHashes(prev => ({...prev,[w.id]:e.target.value}))}/><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="mw-admin-btn" disabled={withdrawalBusy===w.id || !(withdrawalTxHashes[w.id] || "").trim()} onClick={() => void updateWithdrawal(w.id,"mark_sent")}>Record sent</button><button className="mw-admin-btn" disabled={withdrawalBusy===w.id} onClick={() => void updateWithdrawal(w.id,"reject")}>Reject</button></div></div> : "—"}</td><td>{new Date(w.createdAt).toLocaleString()}</td></tr>) : <tr><td colSpan={7} className="mw-admin-empty">No withdrawal requests recorded yet.</td></tr>}</tbody></table></div><p className="mw-admin-muted" style={{padding:"0 18px 16px"}}>Approve a request, send SOL manually from your own wallet, then paste the confirmed Solana transaction signature and choose “Record sent”. Approval never sends funds automatically.</p></section>
        <p className="mw-admin-muted">{overview.notice}</p>
      </>}
    </div>
  </main>;
}
