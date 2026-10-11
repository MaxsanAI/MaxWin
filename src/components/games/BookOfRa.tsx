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

export default function BookOfRaSlot({ onBackToLobby }: { onBackToLobby: () => void }){
 const [balance,setBalance]=useState<number|null>(null);
 const [bet,setBet]=useState(5);
 const [result,setResult]=useState<SpinResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [reelStops,setReelStops]=useState(5);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("Choose your bet and spin the ancient reels.");
 const [soundOn,setSoundOn]=useState(true);
 const [speed,setSpeed]=useState<"slow"|"normal"|"turbo">("slow");
 const [freeSpins,setFreeSpins]=useState(0);
 const [expandingSymbol,setExpandingSymbol]=useState<SymbolName|null>(null);
 const [buyConfirm,setBuyConfirm]=useState(false);
 const [bonusReveal,setBonusReveal]=useState<{symbol:SymbolName;spins:number;mode:"spin"|"buyBonus"}|null>(null);
 const [expandingPosition,setExpandingPosition]=useState<number|null>(null);
 const audioContext=useRef<AudioContext|null>(null);
 const lastSpinTick=useRef(0);
 const tone=(frequency:number,duration:number,wave:OscillatorType="sine",volume=0.12,slide?:number,delay=0)=>{
  if(!soundOn||typeof window.AudioContext==="undefined")return;
  try{
   const ctx=audioContext.current||(audioContext.current=new window.AudioContext());
   if(ctx.state==="suspended")void ctx.resume();
   const start=ctx.currentTime+delay;
   const osc=ctx.createOscillator();const gain=ctx.createGain();
   osc.type=wave;osc.frequency.setValueAtTime(frequency,start);
   if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(1,slide),start+duration);
   gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+0.012);
   gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
   osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+duration+0.015);
  }catch{}
 };
 const playSpinTick=()=>{
  const now=performance.now();
  if(now-lastSpinTick.current<105)return;
  lastSpinTick.current=now;
  tone(210,0.055,"triangle",0.045,145);
 };
 const playReelStop=()=>{tone(150,0.12,"triangle",0.13,82);tone(620,0.07,"sine",0.055,460,0.025);};
 const playWin=()=>{
  // Short, warm premium win chime: soft bell notes with a clean resolving finish.
  tone(659.25,0.24,"sine",0.085,783.99);
  tone(830.61,0.28,"sine",0.075,987.77,0.085);
  tone(987.77,0.38,"sine",0.07,1318.51,0.17);
  tone(1318.51,0.48,"sine",0.055,1174.66,0.27);
 };
 const playBonus=()=>{
  tone(196,0.28,"triangle",0.15,392);
  tone(392,0.32,"sine",0.12,587.33,0.12);
  tone(587.33,0.38,"triangle",0.13,783.99,0.24);
  tone(1174.66,0.52,"sine",0.09,1567.98,0.34);
 };
 const playDum=()=>{
  tone(105,0.17,"sine",0.18,52);
  tone(760,0.12,"triangle",0.055,420,0.025);
 };
 const defaultGrid:SymbolName[]=["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten","book","pharaoh","scarab","statue","ace"];
 const [displaySymbols,setDisplaySymbols]=useState<SymbolName[]>(defaultGrid);
 const [reelStrips,setReelStrips]=useState<SymbolName[][]>(Array.from({length:5},()=>Array.from({length:8},(_,i)=>defaultGrid[i%defaultGrid.length])));
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
  const isBonusSpin=action==="spin"&&freeSpins>0;
  const activeBonusSymbol=isBonusSpin?expandingSymbol:null;
  if(soundOn&&typeof window.AudioContext!=="undefined"){try{const ctx=audioContext.current||(audioContext.current=new window.AudioContext());if(ctx.state==="suspended")void ctx.resume();}catch{}}
  const stripPool:SymbolName[]=["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten"];
  setReelStrips(Array.from({length:5},()=>Array.from({length:8},()=>stripPool[Math.floor(Math.random()*stripPool.length)])));
  setBusy(true);setError("");setBuyConfirm(false);setReelStops(0);
  setMessage(action==="buyBonus"?"Opening the Sacred Book…":freeSpins>0?"Free spin in progress…":"Reels spinning…");
  const spinStartedAt=performance.now();
  try{
   const res=await fetch("/api/games/book-of-ra",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,bet,requestId:requestId()})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"Spin failed.");
   const minimumSpin=speed==="slow"?1250:speed==="normal"?950:700;
   const remainingSpin=minimumSpin-(performance.now()-spinStartedAt);
   if(remainingSpin>0)await new Promise(resolve=>window.setTimeout(resolve,remainingSpin));
   const finalSymbols=data.result.symbols as SymbolName[];
   for(let reel=0;reel<5;reel++){
    await new Promise(resolve=>window.setTimeout(resolve,speed==="slow"?210:speed==="normal"?155:105));
    setDisplaySymbols(current=>current.map((symbol,index)=>Math.floor(index/3)===reel?finalSymbols[index]:symbol));
    playReelStop();
    setReelStops(reel+1);
   }
   const symbolToExpand=(activeBonusSymbol||null) as SymbolName|null;
   if(isBonusSpin&&symbolToExpand){
    const reelsToExpand=[0,1,2,3,4].filter(reel=>finalSymbols.slice(reel*3,reel*3+3).includes(symbolToExpand));
    for(const reel of reelsToExpand){
     for(let row=0;row<3;row++){
      await new Promise(resolve=>window.setTimeout(resolve,speed==="slow"?230:speed==="normal"?170:115));
      const position=reel*3+row;
      setExpandingPosition(position);playDum();
      setDisplaySymbols(current=>current.map((symbol,index)=>index===position?symbolToExpand:symbol));
     }
    }
    setExpandingPosition(null);
   }
   setResult(data.result);setBalance(Number(data.balance));setFreeSpins(Number(data.freeSpins||0));
   if(data.expandingSymbol)setExpandingSymbol(data.expandingSymbol);
   if(Number(data.result.awardedFreeSpins)>0 && data.expandingSymbol){
    playBonus();
    setBonusReveal({symbol:data.expandingSymbol as SymbolName,spins:Number(data.result.awardedFreeSpins),mode:action});
    setMessage("THE SACRED BOOK HAS AWAKENED");
   }else{
    if(Number(data.result.payout)>0)playWin();
    setMessage(data.result.payout>0?"WIN · "+data.result.payout.toLocaleString()+" CREDITS":data.result.awardedFreeSpins?"SACRED BOOK TRIGGERED · "+data.result.awardedFreeSpins+" FREE SPINS":"No match this time. Try another spin.");
   }
  }catch(e:unknown){setError(e instanceof Error?e.message:"Error during spin.");}
  finally{setReelStops(5);setBusy(false);}
 };
 const winning=new Set(result?.winningPositions||[]);

 return <div className={"rf-game book-of-ra-slot rf-speed-"+speed}>
  <div className="rf-game-top"><div className="rf-title-lockup"><div className="rf-emblem"><BookOpen size={26}/><span>✦</span></div><div><span className="rf-eyebrow">MAXWIN ORIGINAL · ANCIENT TREASURES</span><h3>BOOK OF <em>RA</em></h3><p>5 reels · 3 rows · Demo credits</p></div></div><div className="rf-top-actions"><span className="rf-status"><span/> DEMO MODE</span><button className="rf-icon-button" type="button" onClick={()=>setSoundOn(v=>!v)} aria-label={soundOn?"Mute sound":"Enable sound"} title={soundOn?"Mute sound":"Sound off"}>{soundOn?<Volume2 size={16}/>:<VolumeX size={16}/>}</button></div></div>
  <div className="rf-cabinet bra-cabinet"><div className="rf-cabinet-header"><span><Crown size={13}/> TEMPLE OF RA</span><span><i/> 5 REELS <i/> 3 ROWS <i/> SACRED BOOK</span></div>
   <div className="rf-reel-window bra-reel-window bra-strip-reels" aria-label="Book of Ra slot reels">
    {Array.from({length:5},(_,reel)=>{
     const spinning=busy&&reelStops<=reel;
     const finalColumn=displaySymbols.slice(reel*3,reel*3+3);
     const strip=[...(reelStrips[reel]||defaultGrid.slice(0,8)),...(reelStrips[reel]||defaultGrid.slice(0,8))];
     return <div key={reel} className={"bra-reel-column"+(spinning?" is-spinning":"")+(busy&&!spinning?" is-stopping":"")}>
      <div className="bra-reel-viewport">
       <div className="bra-reel-strip" aria-hidden="true">{strip.map((name,index)=>{const item=symbolMeta[name]||symbolMeta.book;return <div key={index} className={"bra-strip-symbol "+item.className}><img src={"/images/book-of-ra/"+name+".jpg"} alt="" draggable={false} decoding="async"/></div>;})}</div>
       <div className={"bra-final-column"+(spinning?" is-hidden":"")}>{finalColumn.map((name,row)=>{const i=reel*3+row;const item=symbolMeta[name]||symbolMeta.book;return <div key={i} className={"rf-reel bra-reel "+item.className+(winning.has(i)?" rf-reel-win":"")+(expandingPosition===i?" bra-cell-expanding":"")+(bonusReveal&&name==="book"?" bra-book-trigger":"")}><span className="rf-reel-glow"/><span className="rf-symbol-art"><img src={"/images/book-of-ra/"+name+".jpg"} alt={item.label} draggable={false} decoding="async"/></span></div>;})}</div>
      </div>
     </div>;
    })}
   </div>
   <div className="rf-machine-footer"><span>ANCIENT EGYPTIAN FORTUNE</span><span>•</span><span>PLAY FOR FUN · NO CASH VALUE</span></div>
  </div>
  {freeSpins>0&&<div className="rf-locked-notice bra-free-spins"><Sparkles size={18}/><span><b>{freeSpins} FREE SPINS REMAINING</b><small>{expandingSymbol?"Expanding symbol: "+(symbolMeta[expandingSymbol]?.label||expandingSymbol):"Your bonus spins are ready to play."}</small></span></div>}
  <div className="rf-main-controls bra-main-controls">
   <div className="rf-bet-control rf-bet-side"><label htmlFor="bra-bet">TOTAL BET</label><div><button type="button" aria-label="Decrease bet" disabled={busy||freeSpins>0||bet<=5} onClick={()=>setBet(v=>Math.max(5,v-5))}>−</button><strong id="bra-bet">{bet.toLocaleString()}</strong><button type="button" aria-label="Increase bet" disabled={busy||freeSpins>0||bet>=100} onClick={()=>setBet(v=>Math.min(100,v+5))}>+</button></div><small>Per spin</small></div>
   <div className="rf-speed-panel bra-inline-speed"><span><Gauge size={14}/> SPEED</span><div>{(["slow","normal","turbo"] as const).map(s=><button type="button" key={s} className={speed===s?"active":""} onClick={()=>setSpeed(s)} disabled={busy}>{s.toUpperCase()}</button>)}</div></div>
   <button className="rf-spin-button" type="button" disabled={busy||bonusReveal!==null||balance===null||(balance<bet&&freeSpins===0)} onClick={()=>void play("spin")}>{busy?<><span className="rf-spinner"/> SPINNING…</>:<><span><Zap size={16}/></span> {freeSpins>0?"FREE SPIN":"SPIN"}<small>{freeSpins>0?"BONUS ROUND":bet+" CREDITS"}</small></>}</button>
   <div className="rf-credit-panel rf-balance-side"><span>DEMO BALANCE</span><strong>{balance===null?"—":balance.toLocaleString()}</strong><small>Demo credits</small></div>
   <button className="rf-buy-button bra-buy-button" type="button" disabled={busy||bonusReveal!==null||balance===null||balance<bet*75||freeSpins>0} onClick={()=>setBuyConfirm(true)}><Sparkles size={16}/><span>BUY BONUS<small>{"75× BET · "+(bet*75).toLocaleString()+" CR"}</small></span></button>
  </div>
  {message&&<p className={"rf-message bra-message"+(result?.payout?" is-win":"")} role="status">{message}</p>}{error&&<p className="rf-error" role="alert">{error}</p>}
  {result&&<div className="rf-last-result"><span>LAST RESULT<small>{result.wins?.length?result.wins.length+" winning line(s)":result.awardedFreeSpins?"Bonus triggered":"Round complete"}</small></span><strong>{result.payout.toLocaleString()}<small>CREDITS WON</small></strong></div>}
  <details className="rf-paytable bra-paytable" id="bra-paytable"><summary>BOOK OF RA · PAYTABLE &amp; SYMBOL GUIDE</summary><div>{(["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten"] as SymbolName[]).map(symbol=>{const item=symbolMeta[symbol];return <div key={symbol}><span><img src={"/images/book-of-ra/"+symbol+".jpg"} alt="" loading="lazy" decoding="async" style={{width:26,height:26,objectFit:"contain",verticalAlign:"middle",marginRight:6}}/>{item.label}</span><b>{symbol==="book"?"Wild / Scatter feature":["pharaoh","anubis","scarab","statue"].includes(symbol)?"Premium symbol":"Classic symbol"}</b></div>;})}</div><p>Demo presentation only. Actual line rules and awards are determined by the game service.</p></details>
  <button className="bra-lobby-button" type="button" onClick={onBackToLobby}><Crown size={15} strokeWidth={2.2}/> <span>TO LOBBY</span></button>
  <div className="rf-demo-disclaimer">DEMO ONLY · CREDITS HAVE NO CASH VALUE · NO DEPOSITS OR WITHDRAWALS · PLAY RESPONSIBLY · 18+</div>
  {bonusReveal&&<div className="bra-awakening-backdrop" role="presentation">
   <section className="bra-awakening" role="dialog" aria-modal="true" aria-labelledby="bra-awakening-title">
    <div className="bra-awakening-stars" aria-hidden="true">✦ · ✧ · ✦</div>
    <div className="bra-opening-book"><img src="/images/book-of-ra/book.jpg" alt="The Sacred Book opening" /></div>
    <div className="bra-awakening-kicker">THE SACRED BOOK HAS CHOSEN</div>
    <h2 id="bra-awakening-title">Your expanding symbol</h2>
    <div className="bra-revealed-symbol"><img src={"/images/book-of-ra/"+bonusReveal.symbol+".jpg"} alt={symbolMeta[bonusReveal.symbol].label}/><span>{symbolMeta[bonusReveal.symbol].label}</span></div>
    <p>{bonusReveal.spins} FREE SPINS ARE WAITING</p>
    <small>The symbol and bonus were selected by the game server.</small>
    <button className="btn btn-gold bra-awakening-start" type="button" onClick={()=>{setBonusReveal(null);setMessage("BONUS ROUND · "+(symbolMeta[expandingSymbol||"book"]?.label||"EXPANDING SYMBOL"));}}>OPEN BONUS ROUND <span>→</span></button>
   </section>
  </div>}
  {buyConfirm&&<div className="modal-backdrop rf-bonus-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBuyConfirm(false);}}><section className="modal rf-bonus-modal" role="dialog" aria-modal="true" aria-labelledby="bra-bonus-title"><button className="modal-close" type="button" onClick={()=>setBuyConfirm(false)} aria-label="Close bonus confirmation">×</button><div className="modal-mark"><BookOpen size={25}/></div><div className="eyebrow">SACRED BOOK BONUS</div><h2 id="bra-bonus-title">Unlock Free Spins?</h2><p>Trigger the bonus round for demo credits only. No cash value.</p><div className="rf-bonus-price">{(bet*75).toLocaleString()} <small>DEMO CREDITS</small></div><div className="rf-bonus-actions"><button className="btn btn-gold modal-done" type="button" onClick={()=>void play("buyBonus")}>Confirm bonus</button><button className="auth-switch" type="button" onClick={()=>setBuyConfirm(false)}>Cancel</button></div></section></div>}
 </div>;
}
