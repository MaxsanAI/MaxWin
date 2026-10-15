import { useEffect, useRef, useState } from "react";
import { BookOpen, Crown, Shield, Flame, Sparkles, Volume2, VolumeX, Music, Gauge, Info, Coins, Gem, Sun, Plus, Minus, Zap } from "lucide-react";

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
const formatUSD=(value:number)=>"$"+(value/100).toFixed(2);
function requestId(){return typeof crypto.randomUUID==="function"?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");}

export default function BookOfRaSlot({ onBackToLobby, mode = "demo" }: { onBackToLobby: () => void; mode?: "demo" | "real" }){
 const [balance,setBalance]=useState<number|null>(null);
 const [walletSol,setWalletSol]=useState<number|null>(null);
 const [realModeLocked,setRealModeLocked]=useState(false);
 const [bet,setBet]=useState(20);
 const [result,setResult]=useState<SpinResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [resettingDemo,setResettingDemo]=useState(false);
 const [reelStops,setReelStops]=useState(5);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("Choose your bet and spin the ancient reels.");
 const [soundOn,setSoundOn]=useState(true);
 const [musicOn,setMusicOn]=useState(true);
 const musicAudio=useRef<HTMLAudioElement|null>(null);
 const winAudio=useRef<HTMLAudioElement|null>(null);
 const [speed,setSpeed]=useState<"slow"|"normal"|"turbo">("slow");
 const [freeSpins,setFreeSpins]=useState(0);
 const [bonusFinish,setBonusFinish]=useState<{total:number}|null>(null);
 const bonusWinTotal=useRef(0);
 const [expandingSymbol,setExpandingSymbol]=useState<SymbolName|null>(null);
 const [buyConfirm,setBuyConfirm]=useState(false);
 const [bonusReveal,setBonusReveal]=useState<{symbol:SymbolName;spins:number;mode:"spin"|"buyBonus"}|null>(null);
 const [scatterReveal,setScatterReveal]=useState<{spins:number;books:number;mode:"spin"|"buyBonus"}|null>(null);
 const [scatterContinueReady,setScatterContinueReady]=useState(false);
 const [showBookCelebration,setShowBookCelebration]=useState(false);
 const [rollingSymbol,setRollingSymbol]=useState<SymbolName>("pharaoh");
 const [symbolRollComplete,setSymbolRollComplete]=useState(false);
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
 const playBookSuspense=()=>{
  // A sustained cinematic air-rush, rising in pitch and intensity for the whole Book hunt.
  if(!soundOn||typeof window.AudioContext==="undefined")return;
  try{
   const ctx=audioContext.current||(audioContext.current=new window.AudioContext());
   if(ctx.state==="suspended")void ctx.resume();
   const start=ctx.currentTime+0.025;
   const duration=3.15;
   const length=Math.floor(ctx.sampleRate*duration);
   const buffer=ctx.createBuffer(1,length,ctx.sampleRate);
   const channel=buffer.getChannelData(0);
   for(let i=0;i<length;i++){
    const fadeIn=Math.min(1,i/(ctx.sampleRate*0.32));
    const fadeOut=Math.min(1,(length-i)/(ctx.sampleRate*0.42));
    channel[i]=(Math.random()*2-1)*fadeIn*fadeOut;
   }
   const source=ctx.createBufferSource();
   source.buffer=buffer;
   const filter=ctx.createBiquadFilter();
   filter.type="bandpass";
   filter.frequency.setValueAtTime(320,start);
   filter.frequency.exponentialRampToValueAtTime(1850,start+2.55);
   filter.Q.setValueAtTime(0.65,start);
   const gain=ctx.createGain();
   gain.gain.setValueAtTime(0.0001,start);
   gain.gain.linearRampToValueAtTime(0.095,start+0.55);
   gain.gain.linearRampToValueAtTime(0.15,start+2.45);
   gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
   source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
   source.start(start);source.stop(start+duration+0.03);
   // Layer a rising engine tone under the air-rush, then let it fade with the reels.
   tone(92,2.9,"sawtooth",0.065,330,0.02);
   tone(150,2.65,"triangle",0.055,720,0.12);
   tone(245,2.35,"sawtooth",0.04,980,0.32);
  }catch{}
 };
 const playWin=()=>{
  if(!soundOn)return;
  const audio=winAudio.current;
  if(audio){
   try{audio.currentTime=0;audio.volume=0.7;void audio.play().catch(()=>{});}catch{}
   return;
  }
 };
 // Triumphant Egyptian-style fanfare for the moment the Sacred Books land.
 const playBonus=()=>{
  if(!soundOn)return;
  // Deep ceremonial impact and a warm, layered major chord.
  tone(82.41,0.72,"sine",0.24,41.2);
  tone(110,0.58,"triangle",0.18,55,0.015);
  tone(164.81,0.72,"triangle",0.12,196,0.02);
  tone(261.63,0.92,"triangle",0.14,392,0.025);
  tone(329.63,1.02,"sine",0.13,329.63,0.025);
  tone(392,1.04,"triangle",0.15,392,0.025);
  tone(523.25,0.92,"sine",0.12,659.25,0.045);
  // Bright rising fanfare and sparkling final note.
  tone(392,0.32,"triangle",0.12,523.25,0.16);
  tone(523.25,0.34,"triangle",0.13,659.25,0.30);
  tone(659.25,0.38,"triangle",0.13,783.99,0.44);
  tone(783.99,0.48,"sine",0.13,1046.5,0.58);
  tone(1046.5,0.82,"sine",0.12,1318.5,0.72);
  tone(1567.98,0.68,"sine",0.065,1318.5,0.82);
 };
 const playDum=()=>{
  tone(105,0.17,"sine",0.18,52);
  tone(760,0.12,"triangle",0.055,420,0.025);
 };
 const defaultGrid:SymbolName[]=["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten","book","pharaoh","scarab","statue","ace"];
 useEffect(()=>{
  if(!bonusReveal){setSymbolRollComplete(false);return;}
  const choices:SymbolName[]=["pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten"];
  let index=0;
  setSymbolRollComplete(false);
  setRollingSymbol(choices[0]);
  const interval=window.setInterval(()=>{index=(index+1)%choices.length;setRollingSymbol(choices[index]);},95);
  const timeout=window.setTimeout(()=>{window.clearInterval(interval);setRollingSymbol(bonusReveal.symbol);setSymbolRollComplete(true);},2300);
  return ()=>{window.clearInterval(interval);window.clearTimeout(timeout);};
 },[bonusReveal]);

 const [displaySymbols,setDisplaySymbols]=useState<SymbolName[]>(defaultGrid);
 const [reelStrips,setReelStrips]=useState<SymbolName[][]>(Array.from({length:5},()=>Array.from({length:8},(_,i)=>defaultGrid[i%defaultGrid.length])));
 const rollTimer=useRef<number|undefined>(undefined);
 const pendingRealRound=useRef<{id:string;action:"spin"|"buyBonus";bet:number}|null>(null);

 useEffect(()=>{
  const audio=musicAudio.current;
  if(!audio)return;
  audio.loop=true;
  audio.volume=0.02;
  const tryStart=()=>{if(musicOn){audio.volume=0.02;void audio.play().catch(()=>{});}};
  tryStart();
  window.addEventListener("pointerdown",tryStart,{once:true});
  window.addEventListener("keydown",tryStart,{once:true});
  return ()=>{
   window.removeEventListener("pointerdown",tryStart);
   window.removeEventListener("keydown",tryStart);
  };
 },[musicOn]);

 useEffect(()=>{
  let live=true;
  fetch("/api/games/book-of-ra?mode="+mode,{cache:"no-store",credentials:"same-origin"}).then(async r=>{
   const d=await r.json();
   if(live&&r.ok){setBalance(Number(d.balance));setWalletSol(typeof d.balanceSol==="number"?d.balanceSol:null);setFreeSpins(Number(d.freeSpins||0));if(d.expandingSymbol)setExpandingSymbol(d.expandingSymbol);setRealModeLocked(false);}
   else if(live){setRealModeLocked(mode==="real"&&r.status===423);setError(d.error||(mode==="real"?"Could not load the real SOL wallet.":"Could not load the demo balance."));}
  }).catch(()=>{if(live)setError("Could not connect to the Temple of Ra game service.");});
  return ()=>{live=false;if(rollTimer.current)clearInterval(rollTimer.current);};
 },[mode]);

 const play=async(action:"spin"|"buyBonus")=>{
  if(busy||balance===null||bonusFinish!==null)return;
  if(action==="buyBonus"&&balance<bet*50){setError(mode==="real"?"Insufficient available SOL wallet balance for Buy Bonus.":"Not enough demo credits for Buy Bonus.");return;}
  if(action==="spin"&&freeSpins<=0&&balance<bet){setError(mode==="real"?"Insufficient available SOL wallet balance.":"Not enough demo credits.");return;}
  if(mode==="real"&&pendingRealRound.current&&(pendingRealRound.current.action!==action||pendingRealRound.current.bet!==bet)){
   setError("A previous real-money round may still be processing. Retry that same action before starting another round.");
   return;
  }
  const roundRequestId=mode==="real"?(pendingRealRound.current?.id||requestId()):requestId();
  if(mode==="real"&&!pendingRealRound.current)pendingRealRound.current={id:roundRequestId,action,bet};
  const isBonusSpin=action==="spin"&&freeSpins>0;
  const activeBonusSymbol=isBonusSpin?expandingSymbol:null;
  if(soundOn&&typeof window.AudioContext!=="undefined"){try{const ctx=audioContext.current||(audioContext.current=new window.AudioContext());if(ctx.state==="suspended")void ctx.resume();}catch{}}
  const stripPool:SymbolName[]=["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten"];
  setReelStrips(Array.from({length:5},()=>Array.from({length:8},()=>stripPool[Math.floor(Math.random()*stripPool.length)])));
  setBusy(true);setError("");setBuyConfirm(false);setReelStops(0);
  setShowBookCelebration(false);setScatterReveal(null);setScatterContinueReady(false);
  setMessage(action==="buyBonus"?"Opening the Sacred Book…":freeSpins>0?"Free spin in progress…":"Reels spinning…");
  const spinStartedAt=performance.now();
  try{
   const res=await fetch("/api/games/book-of-ra",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,bet,requestId:roundRequestId,walletMode:mode})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"Spin failed.");
   if(mode==="real")pendingRealRound.current=null;
   const minimumSpin=speed==="slow"?1250:speed==="normal"?950:700;
   const remainingSpin=minimumSpin-(performance.now()-spinStartedAt);
   if(remainingSpin>0)await new Promise(resolve=>window.setTimeout(resolve,remainingSpin));
   const finalSymbols=data.result.symbols as SymbolName[];
   const booksInFirstThreeReels=finalSymbols.slice(0,9).filter(symbol=>symbol==="book").length;
   const bookHunt=booksInFirstThreeReels>=2;
   for(let reel=0;reel<5;reel++){
    if(reel===3&&bookHunt)playBookSuspense();
    if(reel===4&&bookHunt){tone(330,0.9,"sawtooth",0.085,690);tone(620,0.65,"triangle",0.07,1040,0.08);}
    // If two Books land anywhere on reels 1–3, reels 4 and 5 spin rapidly, then pause and stop one at a time.
    const stopDelay=bookHunt&&reel===3
      ? (speed==="slow"?2250:speed==="normal"?2050:1850)
      : bookHunt&&reel===4
        ? (speed==="slow"?2050:speed==="normal"?1850:1650)
        : (speed==="slow"?210:speed==="normal"?155:105);
    if(bookHunt&&reel>=3)tone(reel===3?520:690,0.32,"triangle",0.07,reel===3?760:980);
    await new Promise(resolve=>window.setTimeout(resolve,stopDelay));
    if(bookHunt&&reel>=3){
     // Reveal each symbol as the reel eases to a stop instead of dropping all three at once.
     setReelStops(reel+1);
     await new Promise(resolve=>window.setTimeout(resolve,180));
     for(let row=0;row<3;row++){
      await new Promise(resolve=>window.setTimeout(resolve,speed==="slow"?300:speed==="normal"?260:220));
      const position=reel*3+row;
      setDisplaySymbols(current=>current.map((symbol,index)=>index===position?finalSymbols[position]:symbol));
      tone(330-row*28,0.09,"triangle",0.045,230-row*18);
     }
    }else{
     setDisplaySymbols(current=>current.map((symbol,index)=>Math.floor(index/3)===reel?finalSymbols[index]:symbol));
     setReelStops(reel+1);
    }
    playReelStop();
   }
   await new Promise(resolve=>window.setTimeout(resolve,500));
   const symbolToExpand=(activeBonusSymbol||null) as SymbolName|null;
   if(isBonusSpin&&symbolToExpand){
    const reelsToExpand=[0,1,2,3,4].filter(reel=>finalSymbols.slice(reel*3,reel*3+3).includes(symbolToExpand));
    // Only play the expanding "tuck-tuck" sequence when the chosen symbol appears on 3+ reels.
    if(reelsToExpand.length>=3){
     for(const reel of reelsToExpand){
      for(let row=0;row<3;row++){
       await new Promise(resolve=>window.setTimeout(resolve,speed==="slow"?230:speed==="normal"?170:115));
       const position=reel*3+row;
       setExpandingPosition(position);playDum();
       setDisplaySymbols(current=>current.map((symbol,index)=>index===position?symbolToExpand:symbol));
      }
     }
    }
    setExpandingPosition(null);
   }
   let bonusTotalThisRound=bonusWinTotal.current;
   if(isBonusSpin){
    bonusTotalThisRound+=Number(data.result.payout||0);
    bonusWinTotal.current=bonusTotalThisRound;
   }
   setResult(data.result);setBalance(Number(data.balance));setWalletSol(typeof data.balanceSol==="number"?data.balanceSol:null);setFreeSpins(Number(data.freeSpins||0));
   setExpandingSymbol((data.expandingSymbol||null) as SymbolName|null);
   if(Number(data.result.awardedFreeSpins)>0 && data.expandingSymbol){
    if(!isBonusSpin){bonusWinTotal.current=0;setBonusFinish(null);}
    playBonus();
    const bookCount=finalSymbols.filter((symbol:SymbolName)=>symbol==="book").length;
    setShowBookCelebration(true);
    setScatterReveal({spins:Number(data.result.awardedFreeSpins),books:bookCount,mode:action});
    setScatterContinueReady(false);
    setMessage("THE SACRED BOOKS HAVE AWAKENED");
    await new Promise(resolve=>window.setTimeout(resolve,1150));
    setScatterContinueReady(true);
    setMessage("SACRED BOOKS AWAKENED · CONTINUE TO BONUS");
   }else{
    if(Number(data.result.payout)>0)playWin();
    setMessage(data.result.payout>0?"WIN · "+formatUSD(data.result.payout):data.result.awardedFreeSpins?"SACRED BOOK TRIGGERED · "+data.result.awardedFreeSpins+" FREE SPINS":"No match this time. Try another spin.");
    if(isBonusSpin&&Number(data.freeSpins||0)===0){
     setBonusFinish({total:bonusTotalThisRound});
     setMessage("BONUS ROUND COMPLETE");
    }
   }
  }catch(e:unknown){setError(e instanceof Error?e.message:"Error during spin.");}
  finally{setReelStops(5);setBusy(false);}
 };
 const leaveDemo=async()=>{
  if(busy||resettingDemo)return;
  if(mode==="real"){onBackToLobby();return;}
  setResettingDemo(true);
  setError("");
  try{
   const response=await fetch("/api/games/book-of-ra",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"resetDemo"})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Could not reset demo balance.");
   setBalance(Number(data.balance??1000));
   setFreeSpins(0);
   bonusWinTotal.current=0;
   setBonusFinish(null);
   setExpandingSymbol(null);
   setResult(null);
   setScatterReveal(null);
   setScatterContinueReady(false);
   setShowBookCelebration(false);
   setBonusReveal(null);
   setBuyConfirm(false);
   onBackToLobby();
  }catch(e:unknown){
   setError(e instanceof Error?e.message:"Could not reset demo balance.");
  }finally{
   setResettingDemo(false);
  }
 };
 const winning=new Set(result?.winningPositions||[]);

 return <div className={"rf-game book-of-ra-slot rf-speed-"+speed}>
  <style>{`.bra-book-search-spin .bra-reel-strip{animation-duration:.12s!important;animation-timing-function:linear!important}.bra-book-search-spin .bra-final-column{transition:opacity .18s ease-out}`}</style>
  <audio ref={musicAudio} src="/audio/book-of-ra-music.mp3" loop preload="auto" aria-hidden="true" />
  <audio ref={winAudio} src="/audio/egypt-win.mp3" preload="auto" aria-hidden="true" />
  <div className="rf-game-top"><div className="rf-title-lockup"><div className="rf-emblem"><BookOpen size={26}/><span>✦</span></div><div><span className="rf-eyebrow">MAXWIN ORIGINAL · ANCIENT TREASURES</span><h3>TEMPLE OF <em>RA</em></h3><p>5 reels · 3 rows · {mode==="real"?"SOL wallet settlement":"Demo credits"}</p></div></div><div className="rf-top-actions"><span className={"rf-status"+(realModeLocked?" is-locked":"")}><span/> {mode==="real"?(realModeLocked?"REAL MODE LOCKED":"REAL SOL WALLET"):"DEMO MODE"}</span><button className="rf-icon-button" type="button" onClick={()=>setSoundOn(v=>!v)} aria-label={soundOn?"Mute game sound effects":"Enable game sound effects"} title={soundOn?"Game sound effects on":"Game sound effects off"}>{soundOn?<Volume2 size={16}/>:<VolumeX size={16}/>}</button><button className="rf-icon-button" type="button" onClick={()=>setMusicOn(v=>{const next=!v;const audio=musicAudio.current;if(audio){if(next){audio.volume=0.02;void audio.play().catch(()=>{});}else audio.pause();}return next;})} aria-label={musicOn?"Turn background music off":"Turn background music on"} title={musicOn?"Background music on · low volume":"Background music off"}>{musicOn?<Music size={16}/>:<Music size={16} style={{opacity:0.45}}/>}</button></div></div>
  <div className="rf-cabinet bra-cabinet"><div className="rf-cabinet-header"><span><Crown size={13}/> TEMPLE OF RA</span><span><i/> 5 REELS <i/> 3 ROWS <i/> SACRED BOOK</span></div>
   <div className={"rf-reel-window bra-reel-window bra-strip-reels"+(showBookCelebration?" bra-scatter-active":"")} aria-label="Temple of Ra slot reels">
    {Array.from({length:5},(_,reel)=>{
     const spinning=busy&&reelStops<=reel;
     const finalColumn=displaySymbols.slice(reel*3,reel*3+3);
     const strip=[...(reelStrips[reel]||defaultGrid.slice(0,8)),...(reelStrips[reel]||defaultGrid.slice(0,8))];
     return <div key={reel} className={"bra-reel-column"+(spinning?" is-spinning":"")+(busy&&!spinning?" is-stopping":"")+(spinning&&reel>=3&&displaySymbols.slice(0,9).filter(symbol=>symbol==="book").length>=2?" bra-book-search-spin":"")}>
      <div className="bra-reel-viewport">
       <div className="bra-reel-strip" aria-hidden="true">{strip.map((name,index)=>{const item=symbolMeta[name]||symbolMeta.book;return <div key={index} className={"bra-strip-symbol "+item.className}><img src={"/images/book-of-ra/"+name+".jpg"} alt="" draggable={false} decoding="async"/></div>;})}</div>
       <div className={"bra-final-column"+(spinning?" is-hidden":"")}>{finalColumn.map((name,row)=>{const i=reel*3+row;const item=symbolMeta[name]||symbolMeta.book;return <div key={i} className={"rf-reel bra-reel "+item.className+(winning.has(i)?" rf-reel-win":"")+(expandingPosition===i?" bra-cell-expanding":"")+(showBookCelebration&&name==="book"?" bra-book-trigger":"")}><span className="rf-reel-glow"/><span className="rf-symbol-art"><img src={"/images/book-of-ra/"+name+".jpg"} alt={item.label} draggable={false} decoding="async"/></span></div>;})}</div>
      </div>
     </div>;
    })}
   </div>
   <div className="rf-machine-footer"><span>ANCIENT EGYPTIAN FORTUNE</span><span>•</span><span>{mode==="real"?"SERVER-SETTLED SOL WALLET":"PLAY FOR FUN · NO CASH VALUE"}</span></div>
  </div>
  {scatterReveal&&scatterContinueReady&&<div className="bra-continue-wrap">
   <button className="bra-continue-button" type="button" onClick={()=>{const reveal=scatterReveal;const symbol=expandingSymbol;if(!reveal||!symbol)return;setScatterReveal(null);setScatterContinueReady(false);setShowBookCelebration(false);setBonusReveal({symbol,spins:reveal.spins,mode:reveal.mode});setMessage("CHOOSING YOUR EXPANDING SYMBOL…");}}>CONTINUE TO BONUS</button>
  </div>}
  {freeSpins>0&&!scatterReveal&&<div className="rf-locked-notice bra-free-spins"><Sparkles size={18}/><span><b>{freeSpins} FREE SPINS REMAINING</b><small>{expandingSymbol?"Expanding symbol: "+(symbolMeta[expandingSymbol]?.label||expandingSymbol):"Your bonus spins are ready to play."}</small></span></div>}
  <div className="rf-main-controls bra-main-controls">
   <div className="rf-bet-control rf-bet-side"><label htmlFor="bra-bet">TOTAL BET</label><div><button type="button" aria-label="Decrease bet" disabled={busy||freeSpins>0||bet<=20} onClick={()=>setBet(v=>Math.max(20,v-10))}>−</button><strong id="bra-bet">{formatUSD(bet)}</strong><button type="button" aria-label="Increase bet" disabled={busy||freeSpins>0||bet>=100} onClick={()=>setBet(v=>Math.min(100,v+10))}>+</button></div><small>Per spin</small></div>
   <div className="rf-speed-panel bra-inline-speed"><span><Gauge size={14}/> SPEED</span><div>{(["slow","normal","turbo"] as const).map(s=><button type="button" key={s} className={speed===s?"active":""} onClick={()=>setSpeed(s)} disabled={busy}>{s.toUpperCase()}</button>)}</div></div>
   <button className="rf-spin-button" type="button" disabled={busy||bonusReveal!==null||scatterReveal!==null||bonusFinish!==null||balance===null||(balance<bet&&freeSpins===0)} onClick={()=>void play("spin")}>{busy?<><span className="rf-spinner"/> SPINNING…</>:<><span><Zap size={16}/></span> {freeSpins>0?"FREE SPIN":"SPIN"}<small>{freeSpins>0?"BONUS ROUND":formatUSD(bet)}</small></>}</button>
   <div className="rf-credit-panel rf-balance-side"><span>{mode==="real"?"WALLET BALANCE":"DEMO BALANCE"}</span><strong>{balance===null?"—":formatUSD(balance)}</strong><small>{mode==="real"?(walletSol===null?"USD equivalent":walletSol.toFixed(6)+" SOL available"):"Demo credits"}</small></div>
   <button className="rf-buy-button bra-buy-button" type="button" disabled={busy||bonusReveal!==null||scatterReveal!==null||bonusFinish!==null||balance===null||balance<bet*50||freeSpins>0} onClick={()=>setBuyConfirm(true)}><Sparkles size={16}/><span>BUY BONUS<small>{"50× BET · "+(bet*50).toLocaleString()+" CR"}</small></span></button>
  </div>
  {message&&<p className={"rf-message bra-message"+(result?.payout?" is-win":"")} role="status">{message}</p>}{error&&<p className="rf-error" role="alert">{error}</p>}
  {result&&<div className="rf-last-result"><span>LAST RESULT<small>{result.wins?.length?result.wins.length+" winning line(s)":result.awardedFreeSpins?"Bonus triggered":"Round complete"}</small></span><strong>{formatUSD(result.payout)}<small>{mode==="real"?"USD-EQUIVALENT PAYOUT":"DEMO USD WON"}</small></strong></div>}
  <details className="rf-paytable bra-paytable" id="bra-paytable"><summary>TEMPLE OF RA · PAYTABLE &amp; SYMBOL GUIDE</summary><div>{(["book","pharaoh","anubis","scarab","statue","ace","king","queen","jack","ten"] as SymbolName[]).map(symbol=>{const item=symbolMeta[symbol];const payouts:Record<SymbolName,string>={book:"3 books: 0.5× total bet + 6 free spins · 4: 2× + 8 spins · 5+: 5× + 10 spins",pharaoh:"3: 4× total bet · 4: 7× · 5: 15×",anubis:"3: 3× total bet · 4: 6× · 5: 12×",scarab:"3: 2× total bet · 4: 4× · 5: 10×",statue:"3: 3× total bet · 4: 5× · 5: 10×",ace:"3: 2× total bet · 4: 4× · 5: 8×",king:"3: 2× total bet · 4: 4× · 5: 8×",queen:"3: 2× total bet · 4: 3× · 5: 5×",jack:"3: 2× total bet · 4: 3× · 5: 5×",ten:"3: 2× total bet · 4: 3× · 5: 5×"};return <div key={symbol}><span><img src={"/images/book-of-ra/"+symbol+".jpg"} alt="" loading="lazy" decoding="async" style={{width:26,height:26,objectFit:"contain",verticalAlign:"middle",marginRight:6}}/>{item.label}</span><b>{payouts[symbol]}</b></div>;})}</div><p>Regular-symbol wins require consecutive matches from the left on a payline and 3+ symbols. The Book acts as a wild, and a Book plus 2 matching regular symbols pays 2× total bet. Book scatter pays on 3+ books anywhere and triggers free spins. Free Spins use a separate, slightly improved symbol-payout table; two matching regular symbols do not pay. The selected expanding symbol receives an additional 35% expansion payout boost. Book probability: 2.0% per cell on the first 3 reels; 1.6% per cell on the final 2 reels. Buy Bonus costs 50× bet; maximum win is capped at 50× bet. {mode==="real"?"Real mode uses the same game rules, with wagers and payouts settled in SOL.":"All values are demo-game rules."}</p></details>
  <button className="bra-lobby-button" type="button" disabled={busy||resettingDemo} onClick={()=>void leaveDemo()}><Crown size={15} strokeWidth={2.2}/> <span>{resettingDemo?(mode==="real"?"LEAVING…":"RESETTING DEMO…"):"TO LOBBY"}</span></button>
  <div className="rf-demo-disclaimer">{mode==="real"?"REAL-MONEY MODE · SOL SETTLEMENT · PLAY RESPONSIBLY · 18+":"DEMO ONLY · CREDITS HAVE NO CASH VALUE · NO DEPOSITS OR WITHDRAWALS · PLAY RESPONSIBLY · 18+"}</div>
  {bonusReveal&&<div className="bra-awakening-backdrop" role="presentation">
   <section className="bra-awakening" role="dialog" aria-modal="true" aria-labelledby="bra-awakening-title">
    <div className="bra-awakening-stars" aria-hidden="true">✦ · ✧ · ✦</div>
    <div className="bra-opening-book"><img src="/images/book-of-ra/book.jpg" alt="The Sacred Book opening" /></div>
    <div className="bra-awakening-kicker">THE SACRED BOOK HAS CHOSEN</div>
    <h2 id="bra-awakening-title">Your expanding symbol</h2>
    <div className={"bra-revealed-symbol"+(!symbolRollComplete?" bra-symbol-rolling":"")}><img src={"/images/book-of-ra/"+rollingSymbol+".jpg"} alt={symbolRollComplete?symbolMeta[rollingSymbol].label:"Choosing expanding symbol"}/><span>{symbolRollComplete?symbolMeta[rollingSymbol].label:"CHOOSING…"}</span></div>
    <p>{symbolRollComplete?bonusReveal.spins+" FREE SPINS ARE WAITING":"THE EXPANDING SYMBOL IS BEING CHOSEN"}</p>
    <small>{symbolRollComplete?"The selected symbol is locked in. Start the bonus round when ready.":"Watch the symbols spin and settle on your expanding symbol."}</small>
    <button className="btn btn-gold bra-awakening-start" type="button" disabled={!symbolRollComplete} onClick={()=>{setBonusReveal(null);setShowBookCelebration(false);setMessage("BONUS ROUND · "+(symbolMeta[bonusReveal.symbol]?.label||"EXPANDING SYMBOL"));}}>START FREE SPINS <span>›</span></button>
   </section>
  </div>}
  {bonusFinish&&<div className="bra-bonus-finish-backdrop" role="presentation">
   <section className={"bra-bonus-finish"+(bonusFinish.total>0?" is-winner":" is-no-win")} role="dialog" aria-modal="true" aria-labelledby="bra-bonus-finish-title">
    <div className="bra-finish-smoke bra-finish-smoke-back" aria-hidden="true"/>
    <div className="bra-finish-stars" aria-hidden="true">✦　✧　✦　✧　✦</div>
    <div className="bra-finish-lamp" aria-hidden="true">✧</div>
    <div className="bra-finish-kicker">TEMPLE OF RA · BONUS ROUND COMPLETE</div>
    {bonusFinish.total>0?<>
     <h2 id="bra-bonus-finish-title">CONGRATULATIONS!</h2>
     <div className="bra-finish-win-label">YOU WIN</div>
     <div className="bra-finish-total">{formatUSD(bonusFinish.total)} <span>CREDITS</span></div>
     <p className="bra-finish-copy">The ancient treasure is yours.</p>
    </>:<>
     <h2 id="bra-bonus-finish-title">THE TREASURE SLEEPS</h2>
     <div className="bra-finish-win-label bra-finish-sorry">SORRY, NO WIN THIS TIME</div>
     <p className="bra-finish-copy">The sands have settled. Fortune may return on your next spin.</p>
    </>}
    <div className="bra-finish-divider"><span/>✦<span/></div>
    <button className="bra-finish-continue" type="button" onClick={()=>{setBonusFinish(null);bonusWinTotal.current=0;setMessage("BONUS ROUND COMPLETE · READY TO SPIN");}}>CONTINUE TO SPIN</button>
    <div className="bra-finish-footnote">DEMO CREDITS · NO CASH VALUE</div>
   </section>
  </div>}
  {buyConfirm&&<div className="modal-backdrop rf-bonus-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBuyConfirm(false);}}><section className="modal rf-bonus-modal" role="dialog" aria-modal="true" aria-labelledby="bra-bonus-title"><button className="modal-close" type="button" onClick={()=>setBuyConfirm(false)} aria-label="Close bonus confirmation">×</button><div className="modal-mark"><BookOpen size={25}/></div><div className="eyebrow">SACRED BOOK BONUS</div><h2 id="bra-bonus-title">Unlock Free Spins?</h2><p>{mode==="real"?"Buy the bonus using your available SOL wallet balance. The wager and any payout are settled server-side.":"Trigger the bonus round for demo credits only. No cash value."}</p><div className="rf-bonus-price">{formatUSD(bet*50)} <small>DEMO USD</small></div><div className="rf-bonus-actions"><button className="btn btn-gold modal-done" type="button" onClick={()=>void play("buyBonus")}>Confirm bonus</button><button className="auth-switch" type="button" onClick={()=>setBuyConfirm(false)}>Cancel</button></div></section></div>}
 </div>;
}
