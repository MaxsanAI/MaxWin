import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Bell, ChevronDown, CircleHelp, Crown, Gamepad2, Gem, Menu, Search, ShieldCheck, Sparkles, Star, Trophy, Wallet, X } from "lucide-react";

type Game = { title: string; category: string; art: string; tag?: string; provider: string; };
const games: Game[] = [
  { title: "Royal Fortune", category: "Slots", art: "royal", tag: "HOT", provider: "MAXWIN Originals" },
  { title: "Neon Dynasty", category: "Slots", art: "neon", tag: "NEW", provider: "MAXWIN Originals" },
  { title: "Golden Vault", category: "Jackpots", art: "vault", tag: "JACKPOT", provider: "MAXWIN Originals" },
  { title: "Moon Temple", category: "Slots", art: "moon", provider: "MAXWIN Originals" },
  { title: "Lucky 7s", category: "Classic", art: "lucky", provider: "MAXWIN Originals" },
  { title: "Cosmic Gems", category: "Slots", art: "cosmic", tag: "NEW", provider: "MAXWIN Originals" },
  { title: "Crown of Gold", category: "Jackpots", art: "crown", provider: "MAXWIN Originals" },
  { title: "Midnight Spin", category: "Classic", art: "midnight", provider: "MAXWIN Originals" },
];
const categories = ["All Games", "Slots", "Jackpots", "Classic"];
function App() {
  const [active, setActive] = useState("All Games");
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<"signin" | "register" | "deposit" | "withdraw" | "game" | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const filtered = useMemo(() => games.filter(g => (active === "All Games" || g.category === active) && g.title.toLowerCase().includes(search.toLowerCase())), [active, search]);
  const openGame = (game: Game) => { setSelectedGame(game); setModal("game"); };
  return <div className="app-shell">
    <div className="topline"><span><Sparkles size={13}/> MAXWIN ORIGINALS · A NEW ERA OF PLAY</span><span className="topline-right"><ShieldCheck size={13}/> Security-first platform <i /> 18+ only</span></div>
    <header className="header">
      <button className="mobile-menu icon-btn" aria-label="Open menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X/> : <Menu/>}</button>
      <a className="brand" href="#" aria-label="MAXWIN home"><span className="brand-mark"><Crown size={23}/></span><span>MAX<span className="brand-gold">WIN</span><small>CRYPTO CASINO</small></span></a>
      <nav className={mobileMenu ? "nav nav-open" : "nav"}>
        <a className="nav-active" href="#lobby" onClick={() => setMobileMenu(false)}><Gamepad2 size={16}/> Casino</a>
        <a href="#featured" onClick={() => setMobileMenu(false)}><Trophy size={16}/> Featured</a>
        <a href="#responsible" onClick={() => setMobileMenu(false)}><ShieldCheck size={16}/> Play responsibly</a>
      </nav>
      <div className="header-actions"><button className="btn btn-ghost" onClick={() => setModal("signin")}>Log in</button><button className="btn btn-gold" onClick={() => setModal("register")}>Create account <span>→</span></button></div>
    </header>
    <main>
      <section className="hero" id="featured">
        <div className="hero-glow" />
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> THE NEXT LEVEL STARTS HERE</div><h1>Make your<br/>next move <em>legendary.</em></h1><p>Step into a world of bold originals, royal jackpots, and a casino experience built around you.</p><div className="hero-actions"><button className="btn btn-gold btn-large" onClick={() => document.getElementById("lobby")?.scrollIntoView({ behavior: "smooth" })}>Explore games <span>→</span></button><button className="btn btn-outline btn-large" onClick={() => setModal("register")}>Join MAXWIN</button></div><div className="hero-trust"><span><ShieldCheck size={16}/> Security-focused</span><span><Gem size={16}/> Crypto-ready design</span><span><Crown size={16}/> MAXWIN Originals</span></div></div>
        <div className="hero-art" aria-label="Original royal casino artwork"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-crown"><Crown size={88} strokeWidth={1.2}/></div><div className="hero-coin coin-a">M</div><div className="hero-coin coin-b">✦</div><div className="hero-coin coin-c">7</div><div className="hero-art-label"><span className="live-dot"/> THE HOUSE OF BIG MOMENTS <small>YOUR STORY. YOUR PLAY.</small></div></div>
        <div className="hero-bottom"><div><strong>01</strong><span>Discover originals</span></div><div><strong>02</strong><span>Find your favourite</span></div><div><strong>03</strong><span>Play responsibly</span></div></div>
      </section>
      <section className="quick-strip"><div><span className="quick-icon"><Wallet size={18}/></span><span><b>Crypto architecture</b><small>Payments integration pending</small></span></div><div><span className="quick-icon"><ShieldCheck size={18}/></span><span><b>Security by design</b><small>Backend controls to be implemented</small></span></div><div><span className="quick-icon"><CircleHelp size={18}/></span><span><b>Clear game information</b><small>Rules shown before real play</small></span></div></section>
      <section className="lobby-section" id="lobby"><div className="section-heading"><div><div className="eyebrow">FIND YOUR NEXT FAVOURITE</div><h2>Explore the <em>lobby</em></h2></div><label className="search-box"><Search size={17}/><input aria-label="Search games" placeholder="Search games..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15}/></button>}</label></div>
        <div className="lobby-toolbar"><div className="category-tabs">{categories.map(c => <button key={c} className={active === c ? "category active" : "category"} onClick={() => setActive(c)}>{c}</button>)}</div><button className="sort-btn" onClick={() => setActive("All Games")}>All providers <ChevronDown size={15}/></button></div>
        <div className="game-grid">{filtered.map((g, i) => <button className="game-card" key={g.title} onClick={() => openGame(g)}><div className={"game-art art-" + g.art}><div className="art-glow"/><span className="art-symbol">{g.art === "royal" ? "♛" : g.art === "neon" ? "✦" : g.art === "vault" ? "◈" : g.art === "moon" ? "☾" : g.art === "lucky" ? "7" : g.art === "cosmic" ? "✧" : g.art === "crown" ? "♕" : "✺"}</span><span className="art-title">{g.title.toUpperCase()}</span>{g.tag && <span className={"game-tag " + (g.tag === "JACKPOT" ? "tag-gold" : "")}>{g.tag}</span>}<span className="play-overlay"><span>View game details <span>→</span></span></span></div><div className="game-info"><span><b>{g.title}</b><small>{g.provider}</small></span><span className="game-star"><Star size={15}/></span></div></button>)}</div>
        {filtered.length === 0 && <div className="empty-state">No games match that search. Try another title.</div>}
        <p className="catalog-note"><ShieldCheck size={15}/> Game cards are catalogue previews. Real-money gameplay is not enabled; certified game-provider integration and server-authoritative outcomes are pending.</p>
      </section>
      <section className="responsible" id="responsible"><div className="responsible-icon"><ShieldCheck size={24}/></div><div><div className="eyebrow">PLAY WITH A PLAN</div><h3>Entertainment should stay in your control.</h3><p>MAXWIN is being built with responsible-gambling controls in mind. Real-money play must remain unavailable until age checks, jurisdiction restrictions, licensing, and required safeguards are verified.</p></div><a href="#responsible" onClick={e => { e.preventDefault(); setModal("game"); setSelectedGame(null); }}>Platform status <span>→</span></a></section>
    </main>
    <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><Crown size={19}/></span><span>MAX<span className="brand-gold">WIN</span><small>CRYPTO CASINO</small></span></a><span>© 2026 MAXWIN. Play responsibly. 18+.</span><div><a href="#responsible">Responsible play</a><a href="#responsible">Privacy</a><a href="#responsible">Terms</a></div></footer>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog"><X size={19}/></button><div className="modal-mark"><Crown size={25}/></div><div className="eyebrow">MAXWIN PLATFORM STATUS</div><h2 id="modal-title">{modal === "signin" ? "Log in" : modal === "register" ? "Create your account" : modal === "deposit" ? "Deposit crypto" : modal === "withdraw" ? "Withdraw crypto" : selectedGame ? selectedGame.title : "Real-money features are not active"}</h2><p>{modal === "signin" || modal === "register" ? "Account services are not connected yet. No account will be created and no credentials will be submitted." : modal === "deposit" || modal === "withdraw" ? "Blockchain payment processing is not connected. No deposit address or withdrawal transaction is available yet." : selectedGame ? "This is a visual catalogue preview, not a playable or certified real-money game. Game-provider integration is pending." : "Authentication, real-money payments, certified game outcomes, and financial transactions are not yet implemented. MAXWIN will not accept wagers or claim to process payments at this stage."}</p><div className="modal-status"><span className="status-dot"/><span><b>Integration pending</b><small>No funds or personal information are being collected.</small></span></div><button className="btn btn-gold modal-done" onClick={() => setModal(null)}>Understood</button></section></div>}
    <div className="bottom-dock"><button onClick={() => setModal("signin")}><Wallet size={18}/> Account</button><button onClick={() => setModal("deposit")}><ArrowDownToLine size={18}/> Deposit</button><button onClick={() => setModal("withdraw")}><ArrowUpFromLine size={18}/> Withdraw</button><button onClick={() => setModal("register")}><Crown size={18}/> Join</button></div>
  </div>;
}
export default App;