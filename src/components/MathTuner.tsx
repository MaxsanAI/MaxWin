import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeft, Copy, Download, FlaskConical, RotateCcw, SlidersHorizontal } from "lucide-react";

type Outcome = { label: string; multiplier: number; chance: number };
const initial: Outcome[] = [
  { label: "No win", multiplier: 0, chance: 55 },
  { label: "Small win", multiplier: 0.5, chance: 20 },
  { label: "Bet returned", multiplier: 1, chance: 12 },
  { label: "2× win", multiplier: 2, chance: 7 },
  { label: "5× win", multiplier: 5, chance: 3.5 },
  { label: "10× win", multiplier: 10, chance: 1.5 },
  { label: "20× win", multiplier: 20, chance: 0.8 },
  { label: "36× win", multiplier: 36, chance: 0.2 },
];
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
export default function MathTuner() {
  const [game, setGame] = useState("Golden Vault");
  const [sample, setSample] = useState(100000);
  const [bet, setBet] = useState(5);
  const [outcomes, setOutcomes] = useState(initial);
  const [bonusRate, setBonusRate] = useState(0.5);
  const [bonusSpins, setBonusSpins] = useState(8);
  const [bonusAvgMultiplier, setBonusAvgMultiplier] = useState(1);
  const [maxWin, setMaxWin] = useState(500);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const chanceTotal = outcomes.reduce((sum, o) => sum + o.chance, 0);
  const multiplierCap = maxWin / bet;
  const baseRtp = outcomes.reduce((sum, o) => sum + Math.min(o.multiplier, multiplierCap) * o.chance / 100, 0);
  const bonusRtp = bonusRate / 100 * bonusSpins * Math.min(bonusAvgMultiplier, multiplierCap);
  const rtp = baseRtp + bonusRtp;
  const stats = useMemo(() => {
    const expectedStake = sample * bet;
    const expectedReturn = expectedStake * rtp / 100;
    return { expectedStake, expectedReturn, gross: expectedStake - expectedReturn, hits: sample * outcomes.filter(o => o.multiplier > 0).reduce((sum, o) => sum + o.chance, 0) / 100 };
  }, [sample, bet, rtp, outcomes]);
  const config = {
    game,
    mode: "proposed-math-profile",
    sampleSpins: sample,
    betCredits: bet,
    outcomes: outcomes.map(o => ({ label: o.label, payoutMultiplier: o.multiplier, probabilityPercent: o.chance })),
    bonus: { triggerProbabilityPercentPerSpin: bonusRate, freeSpinsAwarded: bonusSpins, averagePayoutMultiplierPerFreeSpin: bonusAvgMultiplier },
    maxWinCredits: maxWin,
    theoretical: { baseRtpPercent: Number(baseRtp.toFixed(4)), bonusRtpPercent: Number(bonusRtp.toFixed(4)), totalRtpPercent: Number(rtp.toFixed(4)), houseEdgePercent: Number((100 - rtp).toFixed(4)) },
    implementationNotes: notes,
  };
  const generated = `// MAXWIN Math Tuner proposal — ${game}\n// This is a proposal, not a live game configuration. Review and map it to the server-side game engine.\nexport const ${game.replace(/[^a-z0-9]/gi, "")}MathProposal = ${JSON.stringify(config, null, 2)} as const;\n`;
  const changeOutcome = (index: number, field: "chance" | "multiplier", value: number) => setOutcomes(prev => prev.map((o, i) => i === index ? { ...o, [field]: Math.max(0, value) } : o));
  const copy = async () => {
    try { await navigator.clipboard.writeText(generated); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };
  const download = () => {
    const blob = new Blob([generated], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "maxwin-math-proposal.ts"; a.click(); URL.revokeObjectURL(url);
  };
  const reset = () => { setOutcomes(initial); setBonusRate(0.5); setBonusSpins(8); setBonusAvgMultiplier(1); setMaxWin(500); setBet(5); setSample(100000); setNotes(""); };
  return <main style={{minHeight:"100vh",background:"radial-gradient(ellipse at top,#29204d 0%,#0a0e1d 58%)",color:"#f4f3ff",padding:"24px clamp(14px,3vw,42px) 50px",fontFamily:"inherit"}}>
    <div style={{maxWidth:1250,margin:"0 auto"}}>
      <a href="/" style={{display:"inline-flex",alignItems:"center",gap:8,color:"#f4c66a",textDecoration:"none",fontWeight:800,fontSize:13,marginBottom:22}}><ArrowLeft size={16}/> BACK TO MAXWIN</a>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}><span style={{display:"grid",placeItems:"center",width:46,height:46,borderRadius:13,background:"#9b72ff20",border:"1px solid #9b72ff66",color:"#d2bdff"}}><SlidersHorizontal size={24}/></span><div><div style={{fontSize:11,letterSpacing:2,color:"#b9a0ff",fontWeight:900}}>MAXWIN INTERNAL WORKSPACE</div><h1 style={{fontSize:"clamp(26px,4vw,38px)",margin:"5px 0",lineHeight:1.1}}>Math Tuner <span style={{color:"#f4c66a"}}>PRO</span></h1></div></div>
      <p style={{color:"#a8acc6",maxWidth:850,lineHeight:1.65,marginBottom:24}}>Adjust payout probabilities, bonus frequency and caps; estimate theoretical return; export a code proposal to review before changing a game.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,310px),1fr))",gap:16,alignItems:"start"}}>
        <section style={panel}><h2 style={h2}>1. Game & simulation</h2><label style={label}>Game<select value={game} onChange={e=>setGame(e.target.value)} style={field}><option>Golden Vault</option><option>Royal Fortune</option><option>AI NEON DYNASTY</option><option>Book of Sunfire</option><option>Moon Temple</option></select></label><label style={label}>Simulation spins: <b>{sample.toLocaleString()}</b><input type="range" min="1000" max="1000000" step="1000" value={sample} onChange={e=>setSample(Number(e.target.value))} style={range}/></label><label style={label}>Base bet (credits)<input type="number" min="1" value={bet} onChange={e=>setBet(Math.max(1,Number(e.target.value)||1))} style={field}/></label><label style={label}>Maximum win (credits)<input type="number" min="1" value={maxWin} onChange={e=>setMaxWin(Math.max(1,Number(e.target.value)||1))} style={field}/></label><div style={{fontSize:12,color:"#969bb8",lineHeight:1.6}}>This estimator uses the outcome distribution below. It is not a reel-by-reel simulation of the current server code.</div></section>
        <section style={panel}><h2 style={h2}>2. Payout distribution</h2><p style={{fontSize:12,color:"#a8acc6",lineHeight:1.5}}>Chance values are percentages per base spin. Their total should equal 100% before the model is treated as a complete distribution.</p><div style={{display:"grid",gap:10}}>{outcomes.map((o,i)=><div key={o.label} style={{display:"grid",gridTemplateColumns:"minmax(90px,1fr) 80px 100px",gap:8,alignItems:"center"}}><span style={{fontSize:12,color:"#d9d8ed"}}>{o.label}</span><label style={{fontSize:10,color:"#969bb8"}}>× payout<input aria-label={o.label+" payout multiplier"} type="number" min="0" max="10000" step="0.1" value={o.multiplier} onChange={e=>changeOutcome(i,"multiplier",Number(e.target.value))} style={smallField}/></label><label style={{fontSize:10,color:"#969bb8"}}>% chance<input aria-label={o.label+" probability"} type="number" min="0" max="100" step="0.1" value={o.chance} onChange={e=>changeOutcome(i,"chance",Number(e.target.value))} style={smallField}/></label></div>)}</div><div style={{marginTop:13,padding:12,borderRadius:10,background:chanceTotal===100?"#153c3238":"#5a3b1838",border:"1px solid "+(Math.abs(chanceTotal-100)<0.001?"#4cb99555":"#e4ad4d66"),fontSize:12}}>Probability total: <b>{chanceTotal.toFixed(2)}%</b> {Math.abs(chanceTotal-100)<0.001?"· distribution complete":"· adjust chances so the total equals 100%"}</div></section>
        <section style={panel}><h2 style={h2}>3. Bonus math</h2><label style={label}>Bonus trigger chance per spin: <b>{bonusRate.toFixed(2)}%</b><input type="range" min="0" max="10" step=".1" value={bonusRate} onChange={e=>setBonusRate(Number(e.target.value))} style={range}/></label><label style={label}>Free spins awarded<input type="number" min="0" max="100" value={bonusSpins} onChange={e=>setBonusSpins(Math.max(0,Math.min(100,Number(e.target.value)||0)))} style={field}/></label><label style={label}>Average free-spin payout (× base bet)<input type="number" min="0" max="100" step=".1" value={bonusAvgMultiplier} onChange={e=>setBonusAvgMultiplier(Math.max(0,Number(e.target.value)||0))} style={field}/></label><p style={{fontSize:12,color:"#a8acc6",lineHeight:1.55}}>Bonus RTP estimate = trigger chance × spins awarded × average payout multiplier. This is a simplified model; it assumes the bonus values are measured against the base bet.</p><label style={label}>Implementation notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. keep layout unchanged; update only server-side payout math..." style={{...field,minHeight:82,resize:"vertical"}}/></label></section>
        <section style={panel}><h2 style={h2}>4. Estimate</h2><div style={metrics}><span>Theoretical RTP</span><strong style={{color:rtp>100?"#ff8c8c":"#f4c66a"}}>{rtp.toFixed(2)}%</strong></div><div style={metrics}><span>Theoretical house edge</span><strong>{(100-rtp).toFixed(2)}%</strong></div><div style={metrics}><span>Expected wager volume</span><strong>{money(stats.expectedStake)} credits</strong></div><div style={metrics}><span>Expected player return</span><strong>{money(stats.expectedReturn)} credits</strong></div><div style={metrics}><span>Expected gross difference</span><strong style={{color:stats.gross<0?"#ff8c8c":"#6fe0b1"}}>{money(stats.gross)} credits</strong></div><div style={metrics}><span>Expected spins with a win</span><strong>{Math.round(stats.hits).toLocaleString()}</strong></div><div style={{marginTop:14,padding:12,borderRadius:10,background:"#0c1021",color:"#a8acc6",fontSize:12,lineHeight:1.6}}>These are long-run mathematical expectations, not a guarantee for any session. The gross difference excludes bonuses, operating costs, volatility and jackpot liabilities.</div>{chanceTotal!==100&&<p style={{color:"#ffcc75",fontSize:12}}>Warning: probabilities do not add up to 100%, so the estimate is incomplete.</p>}{rtp>100&&<p style={{color:"#ff9b9b",fontSize:12}}>Warning: theoretical return exceeds wagers before extra costs.</p>}</section>
      </div>
      <section style={{...panel,marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><h2 style={h2}>5. Generate proposed code</h2><span style={{fontSize:11,color:"#a8acc6"}}>No production code is changed by this button.</span></div><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:350,overflow:"auto",padding:15,borderRadius:10,background:"#070a15",border:"1px solid #ffffff12",fontSize:11,color:"#c9c1ef"}}>{generated}</pre><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button type="button" onClick={()=>void copy()} style={goldButton}><Copy size={15}/>{copied?"COPIED":"COPY PROPOSAL"}</button><button type="button" onClick={download} style={secondaryButton}><Download size={15}/> DOWNLOAD .TS</button><button type="button" onClick={reset} style={secondaryButton}><RotateCcw size={15}/> RESET VALUES</button></div><p style={{fontSize:12,color:"#a8acc6",lineHeight:1.6,marginBottom:0}}>Send the copied proposal here and I can map it to the real server-side math. The actual game will not change until its implementation is updated, built and deployed.</p></section>
      <footer style={{marginTop:22,color:"#858ba9",fontSize:11,display:"flex",gap:8,alignItems:"center"}}><FlaskConical size={14}/> MAXWIN · Tuning proposal only · Real-money wagering is not enabled.</footer>
    </div>
  </main>;
}
const panel: CSSProperties = { background:"linear-gradient(145deg,#151a30,#101426)", border:"1px solid #b2a1ff20", borderRadius:15, padding:18, boxShadow:"0 12px 35px #0002" };
const h2: React.CSSProperties = { fontSize:16, margin:"0 0 15px", color:"#fff4d2" };
const label: React.CSSProperties = { display:"grid", gap:7, fontSize:12, color:"#a8acc6", marginBottom:15 };
const field: React.CSSProperties = { width:"100%", padding:"10px 11px", background:"#0a0e1d", color:"#f4f3ff", border:"1px solid #ffffff20", borderRadius:8, outline:"none" };
const smallField: React.CSSProperties = { width:"100%", marginTop:4, padding:"7px 6px", background:"#0a0e1d", color:"#f4f3ff", border:"1px solid #ffffff20", borderRadius:7 };
const range: React.CSSProperties = { width:"100%", accentColor:"#f4c66a" };
const metrics: React.CSSProperties = { display:"flex", justifyContent:"space-between", gap:12, padding:"11px 0", borderBottom:"1px solid #ffffff12", fontSize:12, color:"#a8acc6" };
const goldButton: React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:8, border:"1px solid #f4c66a55", background:"linear-gradient(110deg,#f3d38b,#dca94b)", color:"#241a20", fontWeight:900, fontSize:11 };
const secondaryButton: React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:8, border:"1px solid #9b72ff55", background:"#17132d", color:"#eee7ff", fontWeight:800, fontSize:11 };
