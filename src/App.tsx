import { useEffect, useMemo, useState } from "react";
import { Bell, CircleHelp, Crown, Gamepad2, Gem, Menu, Moon, Search, ShieldCheck, Sparkles, Star, Sun, Trophy, Wallet, X } from "lucide-react";
import RoyalFortune from "./components/RoyalFortune";

type Game = { title: string; category: string; art: string; tag?: string; provider: string; };
type AuthUser = { id: string; username: string; email: string; createdAt: string };
type ProfileData = { avatarDataUrl: string | null; bonuses: Array<{ id: string; title: string; amount: string; status: string; created_at: string }>; freeSpins?: { available: number; totalAwarded: number; nextRecurringAt: string | null; grants: Array<{ id: string; grantType: string; spins: number; createdAt: string }> } };
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
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return localStorage.getItem("maxwin-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  useEffect(() => {
    try { localStorage.setItem("maxwin-theme", theme); } catch { /* theme still works for this session */ }
    document.documentElement.style.colorScheme = theme;
    document.body.dataset.theme = theme;
  }, [theme]);
  const [active, setActive] = useState("All Games");
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<"signin" | "register" | "deposit" | "withdraw" | "game" | "profile" | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authCheckDone, setAuthCheckDone] = useState(false);
  const [welcomePromoOpen, setWelcomePromoOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [walletData, setWalletData] = useState<any>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [bonusBusy, setBonusBusy] = useState<string | null>(null);
  const [freeSpinBusy, setFreeSpinBusy] = useState(false);
  const [spinBusy, setSpinBusy] = useState(false);
  const [spinError, setSpinError] = useState("");
  const [spinNotice, setSpinNotice] = useState("");
  const [spinRound, setSpinRound] = useState<{ id: string; gameTitle: string; symbols: string[]; outcome: string; createdAt: string } | null>(null);
  const [spinHistory, setSpinHistory] = useState<Array<{ id: string; gameTitle: string; symbols: string[]; outcome: string; createdAt: string }>>([]);
  const [spinBalance, setSpinBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletAsset, setWalletAsset] = useState<"SOL" | "TON">("SOL");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawMessage, setWithdrawMessage] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const loadWallet = async () => {
    setWalletLoading(true); setWalletError("");
    try {
      const response = await fetch("/api/wallet", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load wallet.");
      setWalletData(data);
    } catch (error) { setWalletError(error instanceof Error ? error.message : "Could not load wallet."); }
    finally { setWalletLoading(false); }
  };
  useEffect(() => { if (modal === "deposit" || modal === "withdraw" || modal === "profile") void loadWallet(); }, [modal, authUser?.id]);
  useEffect(() => { if (!authUser) { setProfileData(null); return; } fetch("/api/profile", { credentials: "same-origin", cache: "no-store" }).then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Could not load profile."); setProfileData(data.profile); }).catch(error => setProfileMessage(error instanceof Error ? error.message : "Could not load profile.")); }, [authUser?.id]);
  const requestBonus = async (bonusId: string) => {
    setBonusBusy(bonusId); setProfileMessage("");
    try {
      const response = await fetch("/api/profile/bonus", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bonusId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not request bonus.");
      setProfileMessage(data.message || "Bonus request submitted for review.");
      const refreshed = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
      const refreshedData = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) setProfileData(refreshedData.profile);
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : "Could not request bonus."); }
    finally { setBonusBusy(null); }
  };
  const claimRecurringSpins = async () => {
    setFreeSpinBusy(true); setProfileMessage("");
    try {
      const response = await fetch("/api/profile/free-spins", { method: "POST", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || "Could not claim free spins.");
      setProfileMessage(data.message || "30 free spins added.");
      const refreshed = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
      const refreshedData = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) setProfileData(refreshedData.profile);
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : "Could not claim free spins."); }
    finally { setFreeSpinBusy(false); }
  };
  const playFreeSpin = async () => {
    if (!authUser) { setModal("signin"); return; }
    if (!selectedGame || spinBusy || (spinBalance ?? profileData?.freeSpins?.available ?? 0) < 1) return;
    setSpinBusy(true); setSpinError(""); setSpinNotice("");
    try {
      const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch("/api/games/spin", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameTitle: selectedGame.title, requestId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not complete the free spin.");
      if (data.spin) {
        setSpinRound(data.spin);
        setSpinNotice(data.message || (data.spin.outcome === "triple-match" ? "Three matching symbols!" : data.spin.outcome === "pair-match" ? "Two matching symbols!" : "No match this time."));
      }
      if (typeof data.availableSpins === "number") setSpinBalance(data.availableSpins);
      else setSpinBalance(current => Math.max(0, (current ?? profileData?.freeSpins?.available ?? 0) - (data.replayed ? 0 : 1)));
      setSpinHistory(current => data.spin && !current.some(round => round.id === data.spin.id) ? [data.spin, ...current].slice(0, 12) : current);
      const refreshed = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
      const refreshedData = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) setProfileData(refreshedData.profile);
    } catch (error) {
      setSpinError(error instanceof Error ? error.message : "Could not complete the free spin.");
    } finally { setSpinBusy(false); }
  };
  useEffect(() => {
    if (modal !== "game" || !selectedGame || !authUser) {
      setSpinRound(null); setSpinNotice(""); setSpinError(""); setSpinBalance(null); setSpinHistory([]);
      return;
    }
    let cancelled = false;
    fetch("/api/games/spin", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load free spins.");
        if (!cancelled) {
          setSpinBalance(Number(data.availableSpins || 0));
          setSpinHistory(Array.isArray(data.history) ? data.history : []);
        }
      })
      .catch(error => { if (!cancelled) setSpinError(error instanceof Error ? error.message : "Could not load free spins."); });
    return () => { cancelled = true; };
  }, [modal, selectedGame?.title, authUser?.id]);
  const uploadAvatar = async (file?: File) => {
    if (!file || !authUser) return;
    if (!file.type.startsWith("image/")) { setProfileMessage("Choose an image file."); return; }
    setProfileBusy(true); setProfileMessage("");
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read that image.")); reader.onload = () => { const image = new Image(); image.onerror = () => reject(new Error("That image could not be opened.")); image.onload = () => { const canvas = document.createElement("canvas"); const scale = Math.min(1, 320 / Math.max(image.width, image.height)); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); const ctx = canvas.getContext("2d"); if (!ctx) return reject(new Error("Image processing is not available.")); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.78)); }; image.src = String(reader.result); }; reader.readAsDataURL(file); });
      const response = await fetch("/api/profile", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatarDataUrl: imageUrl }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Could not save profile photo."); setProfileData(data.profile); setProfileMessage("Profile photo saved.");
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : "Could not save profile photo."); } finally { setProfileBusy(false); }
  };
  const submitWithdrawal = async () => {
    setWithdrawBusy(true); setWithdrawMessage("");
    try {
      const response = await fetch("/api/wallet/withdraw", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: walletAsset, amount: withdrawAmount, address: withdrawAddress }) });
      const data = await response.json().catch(() => ({}));
      setWithdrawMessage(response.ok ? "Request recorded: " + (data.request?.status || "pending") : (data.error || "Withdrawal request failed."));
      if (response.ok) { setWithdrawAmount(""); await loadWallet(); }
    } catch { setWithdrawMessage("Wallet API is not available. Please try again after deployment."); }
    finally { setWithdrawBusy(false); }
  };
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (data?.authenticated && data.user) setAuthUser(data.user as AuthUser); })
      .catch(() => undefined)
      .finally(() => setAuthCheckDone(true));
  }, []);
  useEffect(() => {
    if (!authCheckDone || authUser) return;
    try { if (sessionStorage.getItem("maxwin-welcome-promo-seen") === "1") return; } catch { /* show promo for this visit */ }
    const timer = window.setTimeout(() => setWelcomePromoOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [authCheckDone, authUser?.id]);
  const closeWelcomePromo = () => {
    setWelcomePromoOpen(false);
    try { sessionStorage.setItem("maxwin-welcome-promo-seen", "1"); } catch { /* dismissal still works */ }
  };
  const registerFromPromo = () => {
    closeWelcomePromo();
    openAuth("register");
  };
  const openAuth = (kind: "signin" | "register") => {
    setAuthError("");
    setAuthEmail("");
    setAuthUsername("");
    setAuthPassword("");
    setModal(kind);
  };
  const submitAuth = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch(modal === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal === "register"
          ? { username: authUsername, email: authEmail, password: authPassword }
          : { email: authEmail, password: authPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError([typeof data.error === "string" ? data.error : "Could not complete that request.", typeof data.diagnostic === "string" ? "Details: " + data.diagnostic : ""].filter(Boolean).join(" "));
        return;
      }
      setAuthUser(data.user as AuthUser);
      setAuthPassword("");
      setAuthError("");
      setModal(null);
    } catch {
      setAuthError("Account API is not available yet. Check the Cloudflare deployment and database binding.");
    } finally {
      setAuthBusy(false);
    }
  };
  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch { /* clear local account view regardless */ }
    setAuthUser(null);
    setModal(null);
  };
  const filtered = useMemo(() => games.filter(g => (active === "All Games" || g.category === active) && g.title.toLowerCase().includes(search.toLowerCase())), [active, search]);
  const openGame = (game: Game) => { setSelectedGame(game); setModal("game"); };
  return <div className={theme === "light" ? "app-shell theme-light" : "app-shell"}>
    <div className="topline"><span><Sparkles size={13}/> MAXWIN ORIGINALS · A NEW ERA OF PLAY</span><span className="topline-right"><ShieldCheck size={13}/> Security-first platform <i /> 18+ only</span></div>
    <header className="header">
      <button className="mobile-menu icon-btn" aria-label="Open menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X/> : <Menu/>}</button>
      <a className="brand" href="#" aria-label="MAXWIN home"><span className="brand-mark"><Crown size={23}/></span><span>MAX<span className="brand-gold">WIN</span><small>CRYPTO CASINO</small></span></a>
      <nav className={mobileMenu ? "nav nav-open" : "nav"}>
        <a className="nav-active" href="#lobby" onClick={() => setMobileMenu(false)}><Gamepad2 size={16}/> Casino</a>
        <a href="#featured" onClick={() => setMobileMenu(false)}><Trophy size={16}/> Featured</a>
        <a href="#responsible" onClick={() => setMobileMenu(false)}><ShieldCheck size={16}/> Play responsibly</a>
      </nav>
      <div className="header-actions"><button className="theme-toggle" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}<span>{theme === "dark" ? "Light" : "Dark"}</span></button><button className="btn btn-ghost" onClick={() => { if (authUser) { setSelectedGame(null); setProfileMessage(""); setModal("profile"); } else openAuth("signin"); }}>{authUser ? <><span className="header-avatar">{profileData?.avatarDataUrl ? <img src={profileData.avatarDataUrl} alt="" /> : authUser.username.slice(0,1).toUpperCase()}</span>{authUser.username}</> : "Log in"}</button>{!authUser && <button className="btn btn-gold" onClick={() => openAuth("register")}>Create account</button>}{authUser && <button className="btn btn-gold" onClick={logout}>Log out</button>}</div>
    </header>
    <main>
      <section className="hero" id="featured">
        <div className="hero-glow" />
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> THE NEXT LEVEL STARTS HERE</div><h1>Make your<br/>next move <em>legendary.</em></h1><p>Step into a world of bold originals, royal jackpots, and a casino experience built around you.</p><div className="hero-actions"><button className="btn btn-gold btn-large" onClick={() => document.getElementById("lobby")?.scrollIntoView({ behavior: "smooth" })}>Explore games</button><button className="btn btn-outline btn-large" onClick={() => openAuth("register")}>Join MAXWIN</button></div><div className="hero-trust"><span><ShieldCheck size={16}/> Security-focused</span><span><Gem size={16}/> Crypto-ready design</span><span><Crown size={16}/> MAXWIN Originals</span></div></div>
        <div className="hero-art" aria-label="Original royal casino artwork"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-crown"><Crown size={88} strokeWidth={1.2}/></div><div className="hero-coin coin-a">M</div><div className="hero-coin coin-b">✦</div><div className="hero-coin coin-c">7</div><div className="hero-art-label"><span className="live-dot"/> THE HOUSE OF BIG MOMENTS <small>YOUR STORY. YOUR PLAY.</small></div></div>
        <div className="hero-bottom"><div><strong>01</strong><span>Discover originals</span></div><div><strong>02</strong><span>Find your favourite</span></div><div><strong>03</strong><span>Play responsibly</span></div></div>
      </section>
      <section className="quick-strip"><div><span className="quick-icon"><Wallet size={18}/></span><span><b>Crypto architecture</b><small>Payments integration pending</small></span></div><div><span className="quick-icon"><ShieldCheck size={18}/></span><span><b>Security by design</b><small>Backend controls to be implemented</small></span></div><div><span className="quick-icon"><CircleHelp size={18}/></span><span><b>Clear game information</b><small>Rules shown before real play</small></span></div></section>
      <section className="lobby-section" id="lobby"><div className="section-heading"><div><div className="eyebrow">FIND YOUR NEXT FAVOURITE</div><h2>Explore the <em>lobby</em></h2></div><label className="search-box"><Search size={17}/><input aria-label="Search games" placeholder="Search games..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15}/></button>}</label></div>
        <div className="lobby-toolbar"><div className="category-tabs">{categories.map(c => <button key={c} className={active === c ? "category active" : "category"} onClick={() => setActive(c)}>{c}</button>)}</div><button className="sort-btn" onClick={() => setActive("All Games")}>All providers </button></div>
        <div className="game-grid">{filtered.map((g, i) => <button className="game-card" key={g.title} onClick={() => openGame(g)}><div className={"game-art art-" + g.art}><div className="art-glow"/><span className="art-symbol">{g.art === "royal" ? "♛" : g.art === "neon" ? "✦" : g.art === "vault" ? "◈" : g.art === "moon" ? "☾" : g.art === "lucky" ? "7" : g.art === "cosmic" ? "✧" : g.art === "crown" ? "♕" : "✺"}</span><span className="art-title">{g.title.toUpperCase()}</span>{g.tag && <span className={"game-tag " + (g.tag === "JACKPOT" ? "tag-gold" : "")}>{g.tag}</span>}<span className="play-overlay"><span>View game details</span></span></div><div className="game-info"><span><b>{g.title}</b><small>{g.provider}</small></span><span className="game-star"><Star size={15}/></span></div></button>)}</div>
        {filtered.length === 0 && <div className="empty-state">No games match that search. Try another title.</div>}
        <p className="catalog-note"><ShieldCheck size={15}/> Game cards are catalogue previews. Real-money gameplay is not enabled; certified game-provider integration and server-authoritative outcomes are pending.</p>
      </section>
      <section className="responsible" id="responsible"><div className="responsible-icon"><ShieldCheck size={24}/></div><div><div className="eyebrow">PLAY WITH A PLAN</div><h3>Entertainment should stay in your control.</h3><p>MAXWIN is being built with responsible-gambling controls in mind. Real-money play must remain unavailable until age checks, jurisdiction restrictions, licensing, and required safeguards are verified.</p></div><a href="#responsible" onClick={e => { e.preventDefault(); setModal("game"); setSelectedGame(null); }}>Platform status</a></section>
    </main>
    <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><Crown size={19}/></span><span>MAX<span className="brand-gold">WIN</span><small>CRYPTO CASINO</small></span></a><span>© 2026 MAXWIN. Play responsibly. 18+.</span><div><a href="#responsible">Responsible play</a><a href="#responsible">Privacy</a><a href="#responsible">Terms</a></div></footer>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className={`modal ${modal === "game" && selectedGame?.title === "Royal Fortune" ? "modal-slot" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog"><X size={19}/></button><div className="modal-mark"><Crown size={25}/></div><div className="eyebrow">{modal === "signin" || modal === "register" ? "YOUR MAXWIN ACCOUNT" : "MAXWIN PLATFORM STATUS"}</div><h2 id="modal-title">{modal === "signin" ? "Log in" : modal === "register" ? "Create your account" : modal === "deposit" ? "Deposit crypto" : modal === "withdraw" ? "Withdraw crypto" : modal === "profile" ? "Your profile" : selectedGame ? selectedGame.title : authUser ? "Your account" : "Real-money features are not active"}</h2>{(modal === "signin" || modal === "register") ? <form className="auth-form" onSubmit={e => { e.preventDefault(); void submitAuth(); }}><p>{modal === "register" ? "Create your MAXWIN login. Use an email you can access and a unique password." : "Sign in to your MAXWIN account."}</p>{modal === "register" && <label>Username<input autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required value={authUsername} onChange={e => setAuthUsername(e.target.value)} placeholder="Choose a username"/></label>}<label>Email address<input type="email" autoComplete="email" maxLength={254} required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete={modal === "register" ? "new-password" : "current-password"} minLength={modal === "register" ? 10 : 1} maxLength={128} required value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder={modal === "register" ? "At least 10 characters" : "Your password"}/></label>{authError && <p className="auth-error" role="alert">{authError}</p>}<button className="btn btn-gold modal-done" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : modal === "register" ? "Create account" : "Log in"}</button><button className="auth-switch" type="button" onClick={() => openAuth(modal === "register" ? "signin" : "register")}>{modal === "register" ? "Already have an account? Log in" : "New to MAXWIN? Create an account"}</button><small className="auth-note">Account access only. Deposits, withdrawals, and real-money games are not enabled.</small></form> : (modal === "deposit" || modal === "withdraw") ? <div className="auth-form wallet-form">
      <p>{modal === "deposit" ? "Choose a network to view its configured deposit address. Deposits are only credited after an on-chain processor verifies the transfer." : "Request a withdrawal from your confirmed available balance. Sending funds is disabled until the secure signing service is configured."}</p>
      <div className="category-tabs wallet-network-tabs"><button type="button" className={walletAsset === "SOL" ? "category active" : "category"} onClick={() => { setWalletAsset("SOL"); setWithdrawMessage(""); }}>Solana · SOL</button><button type="button" className={walletAsset === "TON" ? "category active" : "category"} onClick={() => { setWalletAsset("TON"); setWithdrawMessage(""); }}>TON</button></div>
      {walletLoading && <p>Loading wallet…</p>}
      {walletError && <p className="auth-error" role="alert">{walletError} {(!authUser) && <button type="button" className="auth-switch" onClick={() => openAuth("signin")}>Log in</button>}</p>}
      {walletData && <div className="modal-status"><span className="status-dot"/><span><b>Available balance: {(Number(walletData.balances?.[walletAsset]?.availableUnits || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })} {walletAsset}</b><small>Reserved: {(Number(walletData.balances?.[walletAsset]?.reservedUnits || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })} {walletAsset}</small></span></div>}
      {modal === "deposit" ? <div className="wallet-address-panel">
        <label>{walletAsset} deposit address<input readOnly value={walletData?.deposits?.[walletAsset]?.address || ""} placeholder={walletLoading ? "Loading…" : "Deposit address not configured"} /></label>
        {walletData?.deposits?.[walletAsset]?.address ? <button type="button" className="btn btn-gold modal-done" onClick={() => { void navigator.clipboard?.writeText(walletData.deposits[walletAsset].address); }}>Copy deposit address</button> : <p className="auth-note">Set {walletAsset === "SOL" ? "SOL_DEPOSIT_ADDRESS" : "TON_DEPOSIT_ADDRESS"} in Cloudflare Pages → Settings → Variables and secrets. Use only an address controlled by you.</p>}
        <p className="auth-note">Important: the address alone does not credit your account. Chain monitoring and confirmation must be deployed first. Do not send funds until the deposit processor is active.</p>
      </div> : <form className="auth-form" onSubmit={e => { e.preventDefault(); void submitWithdrawal(); }}>
        <label>Amount ({walletAsset})<input required inputMode="decimal" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="0.1" /></label>
        <label>Destination {walletAsset} address<input required value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value.trim())} placeholder={walletAsset === "SOL" ? "Solana address" : "TON address (EQ… / UQ…)"} /></label>
        <button className="btn btn-gold modal-done" type="submit" disabled={withdrawBusy}>{withdrawBusy ? "Submitting…" : "Request withdrawal"}</button>
        {withdrawMessage && <p className={withdrawMessage.startsWith("Request recorded") ? "" : "auth-error"} role="status">{withdrawMessage}</p>}
      </form>}
      {walletData?.notice && <small className="auth-note">{walletData.notice}</small>}
      <button className="btn btn-ghost modal-done" onClick={() => void loadWallet()}>Refresh wallet</button>
    </div> : modal === "profile" && authUser ? <div className="auth-form profile-form">
      <div className="profile-identity"><div className="profile-avatar">{profileData?.avatarDataUrl ? <img src={profileData.avatarDataUrl} alt="Profile photo" /> : authUser.username.slice(0,1).toUpperCase()}</div><div><b>{authUser.username}</b><small>{authUser.email}</small></div></div>
      <label className="upload-photo">Upload profile photo<input type="file" accept="image/*" disabled={profileBusy} onChange={e => { void uploadAvatar(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
      {profileBusy && <p>Saving photo…</p>}{profileMessage && <p className={profileMessage.toLowerCase().includes("could not") || profileMessage.toLowerCase().includes("choose") ? "auth-error" : "profile-success"} role="status">{profileMessage}</p>}
      <div className="profile-account-info"><span>Email</span><b>{authUser.email}</b><span>Account created</span><b>{new Date(authUser.createdAt).toLocaleDateString()}</b></div>
      <section className="profile-wallet"><h3>Wallet balances</h3>{walletLoading && <p>Loading balances…</p>}{walletError && <p className="auth-error">{walletError}</p>}<div className="profile-balance-grid">{(["SOL", "TON"] as const).map(asset => <div key={asset}><span>{asset}</span><b>{(Number(walletData?.balances?.[asset]?.availableUnits || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })}</b><small>Available</small></div>)}</div>{walletData?.transactions?.length ? <div className="profile-transactions"><b>Recent wallet activity</b>{walletData.transactions.slice(0, 4).map((tx: any) => <div key={tx.id}><span>{tx.kind} · {tx.asset}<small>{tx.status} · {new Date(tx.created_at).toLocaleDateString()}</small></span><strong>{(Number(tx.amount_units || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })}</strong></div>)}</div> : <p className="profile-muted">Deposits and transactions appear here after verified processing is active.</p>}</section>
      <section className="free-spins-panel"><div className="free-spins-heading"><span className="free-spins-icon"><Sparkles size={20}/></span><div><small>MAXWIN REWARDS</small><h3>Free Spins</h3></div><strong>{profileData?.freeSpins?.available ?? 0}</strong></div><p className="free-spins-desc">Welcome spins are awarded once after registration. Claim 30 more every 15 days. Your balance is stored on your account; playable spins require the game engine integration to be enabled.</p><div className="free-spins-next"><span>Next 30-spin reward</span><b>{profileData?.freeSpins?.nextRecurringAt ? new Date(profileData.freeSpins.nextRecurringAt).toLocaleDateString() : "Pending setup"}</b></div><button type="button" className="bonus-claim free-spins-claim" disabled={freeSpinBusy || !profileData?.freeSpins?.nextRecurringAt || new Date(profileData.freeSpins.nextRecurringAt).getTime() > Date.now()} onClick={() => void claimRecurringSpins()}>{freeSpinBusy ? "Claiming…" : "Claim 30 Free Spins"}</button><small className="auth-note">Total awarded: {profileData?.freeSpins?.totalAwarded ?? 0} · Free spins cannot currently be wagered or redeemed.</small></section>
      <div className="profile-actions"><button className="btn btn-gold" onClick={() => setModal("deposit")}>Deposit</button><button className="btn btn-outline" onClick={() => setModal("withdraw")}>Withdraw</button></div>
      <section className="profile-bonuses"><h3>Bonuses</h3>{profileData?.bonuses?.length ? profileData.bonuses.map(bonus => <div className="bonus-row" key={bonus.id}><span><b>{bonus.title}</b><small>{new Date(bonus.created_at).toLocaleDateString()}</small></span><strong>{bonus.amount}</strong><em>{bonus.status}</em>{bonus.status === "available" && <button className="bonus-claim" disabled={bonusBusy !== null} onClick={() => void requestBonus(bonus.id)}>{bonusBusy === bonus.id ? "Requesting…" : "Request bonus"}</button>}</div>) : <p>Your bonus offers and rewards will appear here when they are added to your account.</p>}{profileMessage && <p className={profileMessage.toLowerCase().includes("could not") || profileMessage.toLowerCase().includes("not found") || profileMessage.toLowerCase().includes("already") ? "auth-error" : "profile-success"} role="status">{profileMessage}</p>}</section>
      <small className="auth-note">Wallet balances and transaction history are loaded from the wallet service. Deposits and withdrawals remain unavailable until their secure processing services are active.</small>
    </div> : selectedGame?.title === "Royal Fortune" && authUser ? <RoyalFortune /> : selectedGame?.title === "Royal Fortune" ? <div className="auth-form"><p>Log in to play Royal Fortune and keep your demo-credit balance on your account.</p><button className="btn btn-gold modal-done" type="button" onClick={() => openAuth("signin")}>Log in to play</button></div> : selectedGame ? <div className="auth-form spin-game-panel">
      <div className="spin-game-provider"><span className={"game-art spin-mini-art art-" + selectedGame.art}><span className="art-symbol">{selectedGame.art === "royal" ? "♛" : selectedGame.art === "neon" ? "✦" : selectedGame.art === "vault" ? "◈" : selectedGame.art === "moon" ? "☾" : selectedGame.art === "lucky" ? "7" : selectedGame.art === "cosmic" ? "✧" : selectedGame.art === "crown" ? "♕" : "✺"}</span></span><span><b>{selectedGame.title}</b><small>MAXWIN promotional slot · Demo mode</small></span></div>
      {!authUser ? <><p>Log in to use free spins stored on your MAXWIN account.</p><button className="btn btn-gold modal-done" type="button" onClick={() => openAuth("signin")}>Log in to play</button></> : <>
        <div className="spin-balance-bar"><span>FREE SPINS AVAILABLE</span><strong>{spinBalance ?? profileData?.freeSpins?.available ?? "…"}</strong></div>
        <div className="spin-reels" aria-live="polite" aria-label="Slot result">{(spinRound?.symbols || ["✦", "♛", "✦"]).map((symbol, index) => <div className={"spin-reel" + (spinRound ? " spin-reel-result" : "")} key={spinRound?.id + "-" + index}>{symbol}</div>)}</div>
        {spinNotice && <p className={"spin-result-message " + (spinRound?.outcome === "triple-match" ? "spin-result-win" : "")} role="status">{spinNotice}</p>}
        {spinError && <p className="auth-error" role="alert">{spinError}</p>}
        <button className="btn btn-gold modal-done spin-play-button" type="button" onClick={() => void playFreeSpin()} disabled={spinBusy || (spinBalance ?? profileData?.freeSpins?.available ?? 0) < 1}>{spinBusy ? "Spinning…" : (spinBalance ?? profileData?.freeSpins?.available ?? 0) < 1 ? "No free spins left" : "SPIN · USE 1 FREE SPIN"}</button>
        <small className="auth-note spin-demo-note">Promotional demo only. Results have no cash value, no monetary payout, and cannot be redeemed. Each spin is generated and recorded server-side. Switching slots does not reset your balance.</small>
        {spinHistory.length > 0 && <section className="spin-history"><h3>Recent spins</h3>{spinHistory.slice(0,5).map(round => <div key={round.id}><span>{round.gameTitle}<small>{new Date(round.createdAt).toLocaleString()}</small></span><strong>{round.symbols.join(" ")}</strong></div>)}</section>}
      </>}
    </div> : <><p>{authUser ? "You are signed in. Your account is active, but financial features remain disabled." : "Authentication, real-money payments, certified game outcomes, and financial transactions are not yet implemented. MAXWIN will not accept wagers or claim to process payments at this stage."}</p>{authUser && modal === "game" && !selectedGame && <div className="modal-status"><span className="status-dot"/><span><b>{authUser.username}</b><small>{authUser.email}</small></span></div>}<div className="modal-status"><span className="status-dot"/><span><b>Real-money play disabled</b><small>No funds are being accepted or transferred.</small></span></div><button className="btn btn-gold modal-done" onClick={() => setModal(null)}>Understood</button></>}</section></div>}
    {welcomePromoOpen && !authUser && <div className="welcome-promo-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeWelcomePromo(); }}>
      <section className="welcome-promo" role="dialog" aria-modal="true" aria-labelledby="welcome-promo-title">
        <button className="welcome-promo-close" type="button" aria-label="Close welcome offer" onClick={closeWelcomePromo}><X size={19}/></button>
        <div className="welcome-promo-orbit promo-orbit-one"/><div className="welcome-promo-orbit promo-orbit-two"/>
        <div className="welcome-promo-badge"><Sparkles size={14}/> EXCLUSIVE WELCOME OFFER</div>
        <div className="welcome-promo-crown"><Crown size={43}/><span>MAXWIN</span></div>
        <p className="welcome-promo-kicker">YOUR FIRST SPIN STARTS HERE</p>
        <h2 id="welcome-promo-title">GET <strong>25</strong><br/><em>FREE SPINS</em></h2>
        <p className="welcome-promo-copy">A royal welcome for new members. Your promotional spin balance is designed to stay with your account when you switch between supported slots.</p>
        <div className="welcome-promo-perks"><span><ShieldCheck size={15}/> One welcome offer per account</span><span><Gem size={15}/> Bonus rules shown before activation</span></div>
        <button className="welcome-promo-cta" type="button" onClick={registerFromPromo}>REGISTER NOW <span>↗</span></button>
        <button className="welcome-promo-later" type="button" onClick={closeWelcomePromo}>Maybe later</button>
        <small className="welcome-promo-note">Promotional offer preview. Free spins activate only when bonus-enabled games and server-side bonus tracking are live. 18+ · Terms apply.</small>
      </section>
    </div>}
    <div className="bottom-dock"><button onClick={() => authUser ? setModal("profile") : openAuth("signin")}><Wallet size={18}/> Account</button><button onClick={() => document.getElementById("lobby")?.scrollIntoView({ behavior: "smooth" })}><Gamepad2 size={18}/> Casino</button><button onClick={() => authUser ? setModal("profile") : openAuth("signin")}>Bonuses</button><button onClick={() => authUser ? setModal("profile") : openAuth("register")}><Crown size={18}/> Join</button></div>
  </div>;
}
export default App;