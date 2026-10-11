import { useEffect, useRef, useState } from "react";
import { BookOpen, Crown, Shield, Flame, Sparkles, Volume2, VolumeX, Gauge, Info, Coins, Gem, Sun, Plus, Minus, Zap } from "lucide-react";

type SymbolName = "book" | "pharaoh" | "anubis" | "scarab" | "statue" | "ace" | "king" | "queen" | "jack" | "ten";
type SpinResult = { id:string; symbols:SymbolName[]; outcome:string; bet:number; payout:number; balance:number; mode:"spin"|"buyBonus"; awardedFreeSpins?:number; freeSpinsRemaining?:number; winningPositions?:number[]; wins?:{line:number;symbol:SymbolName;count:number;payout:number;positions:number[]}[]; expandingSymbol?:SymbolName|null };
const symbolMeta:Record<SymbolName,{label:string;Icon:typeof BookOpen;color:string;className:string}> = {
 book:{label:"BOOK OF RA",Icon:BookOpen,color:"#ffd779",className:"bra-symbol-book"},
 pharaoh:{label:"PHARAOH",Icon:Crown,color:"#f4ca72",className:"bra-symbol-pharaoh"},
 anubis:{label:"ANUBIS",Icon:Shield,color:"#c7a4ff",className:"bra-symbol-anubis"},
 scarab:{label:"SCARAB",Icon:Sun,color:"#79e8ff",className:"bra-symbol-scarab"},
 statue:{label:"STATUE",Icon:Gem,color:"#8ae5bd",className:"bra-symbol-statue"},
 ace:{label:"ACE",Icon:Sparkles,color:"#ff9b76",className:"bra-symbol-ace"},
 king:{label:"KING",Icon:Flame,color:"#ff9566",className:"bra-symbol-king"},
 queen:{label:"QUEEN",Icon:Coins,color:"#a6c5ff",className:"bra-symbol-queen"},
 jack:{label:"JACK",Icon:Shield,color:"#c7a4ff",className:"bra-symbol-jack"},
 ten:{label:"TEN",Icon:Gem,color:"#cfc3dd",className:"bra-symbol-ten"}
};
function requestId(){return typeof crypto.randomUUID==="function"?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");}

export default function BookOfRaSlot(){
 const [balance,setBalance]=useState<number|null>(null);
 const [bet,setBet]=useState(5);
 const [result,setResult]=useState<SpinResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [reelStops,setReelStops]=useState(5);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("Choose your bet and spin the ancient reels.");
 const [soundOn,setSoundOn]=useState(false);
 const [speed,setSpeed]=useState<"slow"|"normal"|"turbo">("normal");
 const [freeSpins,setFreeSpins]=useState(0);
 const [expandingSymbol,setExpandingSymbol]=useState<SymbolName|null>(null);
 const [buyConfirm,setBuyConfirm]=useState(false);
 const defaultGrid:SymbolName[]=["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten","book","pharaoh","scarab","statue","ace"];
 const [displaySymbols,setDisplaySymbols]=useState<SymbolName[]>(defaultGrid);
 const rollTimer=useRef<number|undefined>(undefined);

 useEffect(()=>{
  let live=true;
  fetch("/api/games/book-of-ra",{cache:"no-store"}).then(async r=>{
   const d=await r.json();
   if(live&&r.ok){setBalance(Number(d.balance));setFreeSpins(Number(d.freeSpins||0));if(d.expandingSymbol)setExpandingSymbol(d.expandingSymbol);}
   else if(live)setError(d.error||"Could not load the demo balance.");
  }).catch(()=>{if(live)setError("Could not connect to the Book of Ra game service.");});
  return ()=>{live=false;if(rollTimer.current)clearInterval(rollTimer.current);};
 },[]);

 const play=async(action:"spin"|"buyBonus")=>{
  if(busy||balance===null)return;
  if(action==="buyBonus"&&balance<bet*75){setError("Not enough demo credits for Buy Bonus.");return;}
  if(action==="spin"&&freeSpins<=0&&balance<bet){setError("Not enough demo credits.");return;}
  setBusy(true);setError("");setBuyConfirm(false);setReelStops(0);
  setMessage(action==="buyBonus"?"Opening the Sacred Book…":freeSpins>0?"Free spin in progress…":"Reels spinning…");
  const pool:SymbolName[]=["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten"];
  const interval=speed==="slow"?120:speed==="normal"?75:35;
  rollTimer.current=window.setInterval(()=>setDisplaySymbols(Array.from({length:15},()=>pool[Math.floor(Math.random()*pool.length)])),interval);
  try{
   const res=await fetch("/api/games/book-of-ra",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,bet,requestId:requestId()})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"Spin failed.");
   if(rollTimer.current)clearInterval(rollTimer.current);
   const finalSymbols=data.result.symbols as SymbolName[];
   for(let reel=0;reel<5;reel++){
    await new Promise(resolve=>window.setTimeout(resolve,speed==="slow"?210:speed==="normal"?155:105));
    setDisplaySymbols(current=>current.map((symbol,index)=>Math.floor(index/3)===reel?finalSymbols[index]:symbol));
    setReelStops(reel+1);
   }
   setResult(data.result);setBalance(Number(data.balance));setFreeSpins(Number(data.freeSpins||0));
   if(data.expandingSymbol)setExpandingSymbol(data.expandingSymbol);
   setMessage(data.result.payout>0?"WIN · "+data.result.payout.toLocaleString()+" CREDITS":data.result.awardedFreeSpins?"SACRED BOOK TRIGGERED · "+data.result.awardedFreeSpins+" FREE SPINS":"No match this time. Try another spin.");
  }catch(e:unknown){setError(e instanceof Error?e.message:"Error during spin.");}
  finally{if(rollTimer.current)clearInterval(rollTimer.current);setReelStops(5);setBusy(false);}
 };
 const winning=new Set(result?.winningPositions||[]);

 return <div className="rf-game book-of-ra-slot">
  <div className="rf-game-top"><div className="rf-title-lockup"><div className="rf-emblem"><BookOpen size={26}/><span>✦</span></div><div><span className="rf-eyebrow">MAXWIN ORIGINAL · ANCIENT TREASURES</span><h3>BOOK OF <em>RA</em></h3><p>5 reels · 3 rows · Demo credits</p></div></div><div className="rf-top-actions"><span className="rf-status"><span/> DEMO MODE</span><button className="rf-icon-button" type="button" onClick={()=>setSoundOn(v=>!v)} aria-label={soundOn?"Mute sound":"Enable sound"} title={soundOn?"Mute sound":"Sound off"}>{soundOn?<Volume2 size={16}/>:<VolumeX size={16}/>}</button></div></div>
  <div className="rf-cabinet bra-cabinet"><div className="rf-cabinet-header"><span><Crown size={13}/> TEMPLE OF RA</span><span><i/> 5 REELS <i/> 3 ROWS <i/> SACRED BOOK</span></div>
   <div className="rf-reel-window bra-reel-window" aria-label="Book of Ra slot reels">{displaySymbols.slice(0,15).map((name,i)=>{const item=symbolMeta[name]||symbolMeta.book;return <div key={i} className={"rf-reel bra-reel "+item.className+(winning.has(i)?" rf-reel-win":"")+(busy&&reelStops<=Math.floor(i/3)?" rf-reel-spinning":"")}><span className="rf-reel-glow"/><span className="rf-symbol-art"><img src={"/images/book-of-ra/"+name+".jpg"} alt={item.label} draggable={false} decoding="async" /></span><small>{item.label}</small></div>;})}</div>
   <div className="rf-machine-footer"><span>ANCIENT EGYPTIAN FORTUNE</span><span>•</span><span>PLAY FOR FUN · NO CASH VALUE</span></div>
  </div>
  {freeSpins>0&&<div className="rf-locked-notice bra-free-spins"><Sparkles size={18}/><span><b>{freeSpins} FREE SPINS REMAINING</b><small>{expandingSymbol?"Expanding symbol: "+(symbolMeta[expandingSymbol]?.label||expandingSymbol):"Your bonus spins are ready to play."}</small></span></div>}
  <div className="rf-main-controls bra-main-controls">
   <div className="rf-bet-control rf-bet-side"><label htmlFor="bra-bet">TOTAL BET</label><div><button type="button" aria-label="Decrease bet" disabled={busy||freeSpins>0||bet<=5} onClick={()=>setBet(v=>Math.max(5,v-5))}>−</button><strong id="bra-bet">{bet.toLocaleString()}</strong><button type="button" aria-label="Increase bet" disabled={busy||freeSpins>0||bet>=100} onClick={()=>setBet(v=>Math.min(100,v+5))}>+</button></div><small>Per spin</small></div>
   <button className="rf-spin-button" type="button" disabled={busy||balance===null||(balance<bet&&freeSpins===0)} onClick={()=>void play("spin")}>{busy?<><span className="rf-spinner"/> SPINNING…</>:<><span><Zap size={16}/></span> {freeSpins>0?"FREE SPIN":"SPIN"}<small>{freeSpins>0?"BONUS ROUND":bet+" CREDITS"}</small></>}</button>
   <div className="rf-credit-panel rf-balance-side"><span>DEMO BALANCE</span><strong>{balance===null?"—":balance.toLocaleString()}</strong><small>Demo credits</small></div>
  </div>
  <div className="rf-secondary-controls bra-secondary-controls">
   <div className="rf-speed-panel"><span><Gauge size={14}/> SPEED</span><div>{(["slow","normal","turbo"] as const).map(s=><button type="button" key={s} className={speed===s?"active":""} onClick={()=>setSpeed(s)} disabled={busy}>{s.toUpperCase()}</button>)}</div></div>
   <button className="rf-buy-button bra-buy-button" type="button" disabled={busy||balance===null||balance<bet*75||freeSpins>0} onClick={()=>setBuyConfirm(true)}><Sparkles size={16}/><span>BUY BONUS<small>{"75× BET · "+(bet*75).toLocaleString()+" CR"}</small></span></button>
   <button className="rf-icon-button bra-paytable-toggle" type="button" onClick={()=>document.getElementById("bra-paytable")?.scrollIntoView({behavior:"smooth",block:"nearest"})}><Info size={14}/> PAYTABLE</button>
  </div>
  {message&&<p className={"rf-message bra-message"+(result?.payout?" is-win":"")} role="status">{message}</p>}{error&&<p className="rf-error" role="alert">{error}</p>}
  {result&&<div className="rf-last-result"><span>LAST RESULT<small>{result.wins?.length?result.wins.length+" winning line(s)":result.awardedFreeSpins?"Bonus triggered":"Round complete"}</small></span><strong>{result.payout.toLocaleString()}<small>CREDITS WON</small></strong></div>}
  <details className="rf-paytable bra-paytable" id="bra-paytable"><summary>BOOK OF RA · SYMBOL GUIDE</summary><div>{(["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten"] as SymbolName[]).map(symbol=>{const item=symbolMeta[symbol];return <div key={symbol}><span><img src={"/images/book-of-ra/"+symbol+".jpg"} alt="" loading="lazy" decoding="async" style={{width:26,height:26,objectFit:"contain",verticalAlign:"middle",marginRight:6}}/>{item.label}</span><b>{symbol==="book"?"Wild / Scatter feature":["pharaoh","anubis","scarab","statue"].includes(symbol)?"Premium symbol":"Classic symbol"}</b></div>;})}</div><p>Demo presentation only. Actual line rules and awards are determined by the game service.</p></details>
  <div className="rf-demo-disclaimer">DEMO ONLY · CREDITS HAVE NO CASH VALUE · NO DEPOSITS OR WITHDRAWALS · PLAY RESPONSIBLY · 18+</div>
  {buyConfirm&&<div className="modal-backdrop rf-bonus-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBuyConfirm(false);}}><section className="modal rf-bonus-modal" role="dialog" aria-modal="true" aria-labelledby="bra-bonus-title"><button className="modal-close" type="button" onClick={()=>setBuyConfirm(false)} aria-label="Close bonus confirmation">×</button><div className="modal-mark"><BookOpen size={25}/></div><div className="eyebrow">SACRED BOOK BONUS</div><h2 id="bra-bonus-title">Unlock Free Spins?</h2><p>Trigger the bonus round for demo credits only. No cash value.</p><div className="rf-bonus-price">{(bet*75).toLocaleString()} <small>DEMO CREDITS</small></div><div className="rf-bonus-actions"><button className="btn btn-gold modal-done" type="button" onClick={()=>void play("buyBonus")}>Confirm bonus</button><button className="auth-switch" type="button" onClick={()=>setBuyConfirm(false)}>Cancel</button></div></section></div>}
 </div>;
}
