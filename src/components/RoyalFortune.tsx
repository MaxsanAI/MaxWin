import { useEffect, useRef, useState } from "react";
import { Crown, Gem, Shield, Coins, Star, Flame, Zap, CircleDollarSign, Sparkles, LockKeyhole, Volume2, VolumeX, Gauge, Info } from "lucide-react";
import type { CSSProperties } from "react";

type SymbolName = "crown" | "gem" | "shield" | "coins" | "star" | "flame" | "zap" | "coin" | "wild" | "scatter";
type SpinResult = { id:string; symbols:SymbolName[]; outcome:string; bet:number; payout:number; balance:number; mode:"spin"|"buyBonus"; bonusSpins?:number; bonusBreakdown?:{spin:number;symbols:SymbolName[];payout:number;wins:{line:number;symbol:SymbolName;count:number;payout:number;positions:number[]}[];winningPositions:number[];outcome:string}[]; awardedFreeSpins?:number; freeSpinsRemaining?:number; winningPositions?:number[]; wins?:{line:number;symbol:SymbolName;count:number;payout:number;positions:number[]}[] };

const symbolMeta:Record<SymbolName,{label:string;Icon:typeof Crown;className:string;image:string}> = {
 crown:{label:"Crown",Icon:Crown,className:"rf-symbol-crown",image:"crown"},
 gem:{label:"Royal Gem",Icon:Gem,className:"rf-symbol-gem",image:"gem"},
 shield:{label:"Shield",Icon:Shield,className:"rf-symbol-shield",image:"shield"},
 coins:{label:"Treasure",Icon:Coins,className:"rf-symbol-coins",image:"coins"},
 star:{label:"Star",Icon:Star,className:"rf-symbol-star",image:"star"},
 flame:{label:"Flame",Icon:Flame,className:"rf-symbol-flame",image:"flame"},
 zap:{label:"Lightning",Icon:Zap,className:"rf-symbol-zap",image:"zap"},
 coin:{label:"Gold",Icon:CircleDollarSign,className:"rf-symbol-coin",image:"gold"},
 wild:{label:"WILD",Icon:Sparkles,className:"rf-symbol-wild",image:"wild"},
 scatter:{label:"SCATTER",Icon:Star,className:"rf-symbol-scatter",image:"scatter"}
};

const paytable=[["CROWN","3: 6× · 4: 30× · 5: 315×"],["GEM","3: 4× · 4: 22× · 5: 240×"],["SHIELD","3: 4× · 4: 18× · 5: 190×"],["TREASURE","3: 2× · 4: 12× · 5: 140×"],["STAR","3: 2× · 4: 10× · 5: 110×"],["FLAME","3: 2× · 4: 8× · 5: 85×"],["LIGHTNING","3: 1× · 4: 5× · 5: 60×"],["GOLD","3: 1× · 4: 2× · 5: 35×"],["WILD","Substitutes for regular symbols"],["SCATTER","3: 8 free spins · 4: 12 · 5+: 15"]];

function requestId(){return typeof crypto.randomUUID==="function"?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");}
function playTone(kind:"spin"|"stop"|"win"|"bonus"){try{const AudioCtx=window.AudioContext||(window as any).webkitAudioContext;const ctx=new AudioCtx();const notes=kind==="win"?[523,659,784,1047]:kind==="bonus"?[392,523,659,784,988]:kind==="stop"?[220]:[150,190,240];notes.forEach((freq,i)=>{const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type=kind==="spin"?"sawtooth":"sine";osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,ctx.currentTime+i*.07);gain.gain.exponentialRampToValueAtTime(kind==="spin"?.018:.07,ctx.currentTime+i*.07+.015);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.07+.15);osc.connect(gain);gain.connect(ctx.destination);osc.start(ctx.currentTime+i*.07);osc.stop(ctx.currentTime+i*.07+.17);});window.setTimeout(()=>void ctx.close(),1000);}catch{/* Audio is optional. */}}

export default function RoyalFortune({ onBackToLobby }: { onBackToLobby: () => void }){
 const [balance,setBalance]=useState<number|null>(null),[bet,setBet]=useState(5),[result,setResult]=useState<SpinResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("Choose your stake, set a speed and spin."),[mode,setMode]=useState<"demo"|"real">("demo"),[soundOn,setSoundOn]=useState(false),[speed,setSpeed]=useState<"slow"|"normal"|"turbo">("normal"),[freeSpins,setFreeSpins]=useState(0),[freeSpinBet,setFreeSpinBet]=useState(10),[reelStops,setReelStops]=useState(0),[buyConfirm,setBuyConfirm]=useState(false),[bonusWin,setBonusWin]=useState<number|null>(null),[displaySymbols,setDisplaySymbols]=useState<SymbolName[]>(["crown","gem","wild","shield","coins","star","flame","scatter","zap","coin","gem","crown","coins","shield","star","coin","flame","gem","zap","crown"]);
 const timers=useRef<number[]>([]); const rollTimer=useRef<number|undefined>(undefined);

 useEffect(()=>{let live=true;fetch("/api/games/royal-fortune",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not load game.");if(live){setBalance(Number(d.balance));setFreeSpins(Number(d.freeSpins||0));setFreeSpinBet(Number(d.freeSpinBet||10));if(Number(d.freeSpins||0)>0){const locked=Number(d.freeSpinBet||10);setBet(locked>100?locked/10:locked);}}}).catch(e=>{if(live)setError(e instanceof Error?e.message:"Could not load demo balance.");});return()=>{live=false;timers.current.forEach(clearTimeout);if(rollTimer.current!==undefined)window.clearInterval(rollTimer.current);};},[]);

 const play=async(action:"spin"|"buyBonus")=>{
 if(busy||balance===null)return;
 if(action==="buyBonus"&&balance<bet*75){setError("Not enough demo credits for Buy Bonus.");return;}
 if(action==="spin"&&freeSpins<=0&&balance<bet){setError("Not enough demo credits. Lower your bet.");return;}
 setBusy(true);setError("");setBuyConfirm(false);setBonusWin(null);setReelStops(0);
 setDisplaySymbols(result?.symbols?.length===20?result.symbols:["crown","gem","wild","shield","coins","star","flame","scatter","zap","coin","gem","crown","coins","shield","star","coin","flame","gem","zap","crown"]);
 setMessage(action==="buyBonus"?"Activating your bonus feature…":freeSpins>0?"Free Spin in progress…":"Reels spinning…");
 if(soundOn)playTone("spin");const base=speed==="slow"?650:speed==="normal"?390:180;
 timers.current.forEach(clearTimeout);timers.current=[];if(rollTimer.current!==undefined)window.clearInterval(rollTimer.current);
 const pool:SymbolName[]=["crown","gem","shield","coins","star","flame","zap","coin","wild","scatter"];
 rollTimer.current=window.setInterval(()=>setDisplaySymbols(Array.from({length:20},()=>pool[Math.floor(Math.random()*pool.length)])),speed==="slow"?130:speed==="normal"?85:45);
 try{
 const response=await fetch("/api/games/royal-fortune",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,bet,requestId:requestId()})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Spin failed. Your demo balance has not been changed.");
 if(rollTimer.current!==undefined){window.clearInterval(rollTimer.current);rollTimer.current=undefined;}
 const showBoard=async(board:SymbolName[])=>{for(let reel=0;reel<5;reel++){await new Promise(resolve=>window.setTimeout(resolve,base));setDisplaySymbols(current=>current.map((symbol,index)=>Math.floor(index/4)===reel?board[index]:symbol));setReelStops(reel+1);if(soundOn)playTone("stop");}};
 if(action==="buyBonus"&&Array.isArray(data.result.bonusBreakdown)){
 await showBoard(data.result.symbols);setMessage("SCATTER BONUS · "+data.result.awardedFreeSpins+" FREE SPINS AWARDED");if(soundOn)playTone("bonus");
 for(const round of data.result.bonusBreakdown){setReelStops(0);setMessage("FREE SPIN "+round.spin+" OF "+data.result.bonusBreakdown.length+" · "+Number(round.payout).toLocaleString()+" CREDITS");if(rollTimer.current!==undefined)window.clearInterval(rollTimer.current);rollTimer.current=window.setInterval(()=>setDisplaySymbols(Array.from({length:20},()=>pool[Math.floor(Math.random()*pool.length)])),speed==="slow"?130:speed==="normal"?85:45);await new Promise(resolve=>window.setTimeout(resolve,Math.max(300,base)));if(rollTimer.current!==undefined){window.clearInterval(rollTimer.current);rollTimer.current=undefined;}await showBoard(round.symbols);}
 }else await showBoard(data.result.symbols);
 setResult(data.result);setBalance(Number(data.balance));setFreeSpins(Number(data.freeSpins??data.result.freeSpinsRemaining??(freeSpins>0?freeSpins-1:0)));setFreeSpinBet(Number(data.freeSpinBet||5));
 if(Number(data.freeSpins||0)>0){const locked=Number(data.freeSpinBet||data.result.bet||5);setBet(Math.max(5,Math.min(100,locked>100?locked/10:locked)));}
 if(data.result.payout>0&&soundOn)playTone(data.result.awardedFreeSpins?"bonus":"win");
 if(action==="buyBonus"){setMessage("BONUS COMPLETE · "+Number(data.result.payout).toLocaleString()+" DEMO CREDITS WON");setBonusWin(Number(data.result.payout)||0);}
 else setMessage(data.result.awardedFreeSpins?"SCATTER BONUS · "+data.result.awardedFreeSpins+" FREE SPINS AWARDED":data.result.payout>0?"WIN · "+Number(data.result.payout).toLocaleString()+" demo credits":Number(data.freeSpins||0)>0?"FREE SPINS · "+data.freeSpins+" remaining":"No win this spin. Try another combination.");
 }catch(e){setError(e instanceof Error?e.message:"Could not complete the spin.");}
 finally{timers.current.forEach(clearTimeout);if(rollTimer.current!==undefined){window.clearInterval(rollTimer.current);rollTimer.current=undefined;}setBusy(false);}
 };

 const symbols:SymbolName[]=displaySymbols;
 const winning=new Set(result?.winningPositions||[]);

 return <div className="rf-game">\n <button className="rf-lobby-button" type="button" onClick={onBackToLobby}><Crown size={15} strokeWidth={2.2}/> <span>TO LOBBY</span></button>
 <div className="rf-game-top"><div className="rf-title-lockup"><div className="rf-emblem"><Crown size={28}/><span>✦</span></div><div><span className="rf-eyebrow">MAXWIN ORIGINAL · SLOT 001</span><h3>ROYAL <em>FORTUNE</em></h3><p>Fortune favours the bold.</p></div></div><div className="rf-top-actions"><span className="rf-status"><span/> DEMO PLAY</span><button className="rf-icon-button" type="button" onClick={()=>setSoundOn(v=>!v)} aria-label={soundOn?"Turn sound off":"Turn sound on"}>{soundOn?<Volume2 size={16}/>:<VolumeX size={16}/>}<small>{soundOn?"SOUND ON":"SOUND OFF"}</small></button></div></div>
 <div className="rf-mode-tabs"><button className={mode==="demo"?"active":""} onClick={()=>setMode("demo")}>DEMO PLAY <small>FREE CREDITS</small></button><button className={mode==="real"?"active rf-real-tab":"rf-real-tab"} onClick={()=>setMode("real")}>REAL MONEY <small><LockKeyhole size={11}/> LOCKED</small></button></div>
 {mode==="real"&&<div className="rf-locked-notice"><LockKeyhole size={18}/><span><b>Real-money play is not enabled.</b><small>No deposits or cash wagers are accepted. Licensing, age/jurisdiction controls, audited RNG, wallet settlement and withdrawals must be independently verified first.</small></span></div>}
 <div className="rf-cabinet"><div className="rf-cabinet-header"><span><Sparkles size={14}/> ROYAL REELS</span><span>5 REELS <i/> 4 ROWS <i/> WILD + SCATTER</span></div><div className={"rf-reel-window rf-speed-"+speed+(busy?" is-spinning":"")} aria-label="Five reels with four symbols each">{symbols.map((name,i)=>{const item=symbolMeta[name]||symbolMeta.crown;const reel=Math.floor(i/4);return <div className={"rf-reel "+item.className+(winning.has(i)?" rf-reel-win":"")+(busy&&reelStops<=reel?" rf-reel-spinning":"")} style={{"--reel-delay":(reel*.11)+"s"} as CSSProperties} key={(result?.id||"initial")+i}><span className="rf-reel-glow"/><span className="rf-symbol-art"><img src={`${import.meta.env.BASE_URL}images/royal-fortune/${item.image}.png`} alt={item.label} draggable={false}/></span><small>{item.label}</small></div>;})}</div><div className="rf-machine-footer"><span>20 SYMBOL POSITIONS</span><span>SCATTER → FREE SPINS</span><span>WILD SUBSTITUTES</span></div></div>
 {freeSpins>0&&<div className="rf-free-spin-banner"><Sparkles size={19}/><span><b>{freeSpins} FREE SPINS REMAINING</b><small>Locked feature stake: {freeSpinBet.toLocaleString()} demo credits per spin. No credits are deducted.</small></span></div>}
 <div className="rf-main-controls">
  <div className="rf-bet-control rf-bet-side"><label htmlFor="rf-bet">TOTAL BET</label><div><button disabled={busy||freeSpins>0} onClick={()=>setBet(v=>Math.max(5,v-5))} aria-label="Lower bet">−</button><strong>{bet.toLocaleString()}</strong><button disabled={busy||freeSpins>0} onClick={()=>setBet(v=>Math.min(100,v+5))} aria-label="Raise bet">+</button></div><small>Per spin</small></div>
  <div className="rf-speed-panel"><span><Gauge size={16}/> SPEED <button className="rf-icon-button rf-sound-inline" type="button" onClick={()=>setSoundOn(v=>!v)} aria-label={soundOn?"Turn sound off":"Turn sound on"}>{soundOn?<Volume2 size={16}/>:<VolumeX size={16}/>}<small>{soundOn?"SOUND ON":"SOUND OFF"}</small></button></span><div>{(["slow","normal","turbo"] as const).map(s=><button key={s} disabled={busy} className={speed===s?"active":""} onClick={()=>setSpeed(s)}>{s==="slow"?"SLOW":s==="normal"?"NORMAL":"TURBO"}</button>)}</div></div>
  <button className="rf-spin-button" disabled={busy||balance===null||(balance<bet&&freeSpins===0)||mode==="real"} onClick={()=>void play("spin")}>{busy?<><span className="rf-spinner"/> SPINNING…</>:<><span>✦</span> SPIN<small>{freeSpins>0?"FREE":bet+" CREDITS"}</small></>}</button>
  <div className="rf-credit-panel rf-balance-side"><span>BALANCE</span><strong>{balance===null?"—":balance.toLocaleString()}</strong><small>Demo credits</small></div>
  <button className="rf-buy-button" disabled={busy||balance===null||balance<bet*75||mode==="real"||freeSpins>0} onClick={()=>setBuyConfirm(true)}><Crown size={19}/><span>BUY BONUS<small>75× BET · {(bet*75).toLocaleString()}</small></span></button>
 </div>
 {result&&<div className={"rf-win-toast "+(result.payout>0?"has-win":"no-win")} role="status" aria-live="polite"><span className="rf-win-label">{result.payout>0?"✦ YOU WON":"LAST SPIN"}</span><strong>{result.payout>0?"+"+result.payout.toLocaleString():"NO WIN"}</strong><small>{result.payout>0?"DEMO CREDITS":result.mode==="buyBonus"?"BONUS ROUND COMPLETE":"Try your luck again"}</small></div>}
 {result?.mode==="buyBonus"&&result.bonusBreakdown&&<details className="rf-bonus-breakdown"><summary>BONUS ROUND BREAKDOWN · {result.bonusBreakdown.length} SPINS</summary>{result.bonusBreakdown.map(round=><div key={round.spin}><span>SPIN {round.spin}</span><b>{round.payout.toLocaleString()} credits</b></div>)}</details>}
 {buyConfirm&&<div className="modal-backdrop rf-bonus-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setBuyConfirm(false);}}><section className="modal rf-bonus-modal" role="dialog" aria-modal="true" aria-labelledby="rf-buy-title"><button className="modal-close" type="button" onClick={()=>setBuyConfirm(false)} aria-label="Close dialog"><span aria-hidden="true">×</span></button><div className="modal-mark"><Crown size={25}/></div><div className="eyebrow">ROYAL FORTUNE BONUS</div><h2 id="rf-buy-title">Get Free Spins</h2><p>Buy the bonus to trigger the Scatter feature and automatically play all awarded free spins.</p><div className="rf-bonus-price"><span>Bonus price</span><strong>{(bet*75).toLocaleString()} credits</strong><small>{bet} credit bet × 75</small></div><button className="btn btn-gold modal-done" type="button" disabled={busy||balance===null||balance<bet*75} onClick={()=>void play("buyBonus")}>{busy?"Starting bonus…":"Buy Now"}</button><button className="auth-switch" type="button" onClick={()=>setBuyConfirm(false)}>Cancel</button></section></div>}
 {bonusWin!==null&&<div className="modal-backdrop rf-bonus-overlay" role="presentation"><section className="modal rf-bonus-modal rf-bonus-win-modal" role="dialog" aria-modal="true" aria-labelledby="rf-bonus-win-title"><div className="modal-mark"><Crown size={27}/></div><div className="eyebrow">ROYAL FORTUNE</div><h2 id="rf-bonus-win-title">Congratulations!</h2><p>You won</p><div className="rf-bonus-price rf-bonus-total"><strong>{bonusWin.toLocaleString()} credits</strong><small>Total prize from all free spins</small></div><button className="btn btn-gold modal-done" type="button" onClick={()=>setBonusWin(null)}>Continue Playing</button></section></div>}
 {error&&<p className="rf-error" role="alert">{error}</p>}
 <p className={"rf-message "+(result?.payout?"is-win":"")} aria-live="polite">{message}</p>
 <div className="rf-info-grid"><div><span>BASE RTP MODEL</span><b>Demo mode</b></div><div><span>PAYLINES</span><b>10</b></div><div><span>BONUS BUY</span><b>75× BET</b></div></div>
 <details className="rf-paytable"><summary><Info size={14}/> PAYTABLE & GAME RULES</summary><p>Bets are 5–100 demo credits in steps of 5. Wins require 3, 4 or 5 matching symbols from LEFT TO RIGHT on one of the 10 active paylines. WILD substitutes for regular symbols. Vertical stacks alone do not pay. Multipliers apply to the bet per line, not the total bet. Buy Bonus costs 75× the selected bet and awards 8 or 12 automatic free spins after showing 3 or 4 Scatters. Scatter awards 8 free spins for 3, 12 for 4, or 15 for 5+ scatters. Free spins do not retrigger.</p><div>{paytable.map(([name,values])=><div key={name}><span>{name}</span><b>{values}</b></div>)}</div><p>RTP has not been independently certified. Outcomes are for demo credits only.</p></details>
 <div className="rf-demo-disclaimer">DEMO ONLY · No deposits, transfers or cash withdrawals. Real-money play remains locked.</div>
 </div>;
}
