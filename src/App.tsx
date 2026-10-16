import { useEffect, useMemo, useState } from "react";
import { Bell, CircleHelp, Crown, Gamepad2, Gem, Menu, Moon, Search, ShieldCheck, Sparkles, Star, Sun, Trophy, Wallet, X } from "lucide-react";
import RoyalFortune from "./components/RoyalFortune";
import BookOfRaSlot from "./components/games/BookOfRa";
import AIDynasty from "./components/games/AIDynasty";
import GoldenVault from "./components/games/GoldenVault";
import MoonTemple from "./components/games/MoonTemple";
import MathTuner from "./components/MathTuner";
import AdminPanel from "./components/AdminPanel";
import SupportPage from "./components/SupportPage";
import SupportAdmin from "./components/SupportAdmin";

type Game = { title: string; category: string; art: string; tag?: string; provider: string; comingSoon?: boolean; };
type AuthUser = { id: string; username: string; email: string; createdAt: string };
type ProfileData = { avatarDataUrl: string | null; bonuses: Array<{ id: string; title: string; amount: string; status: string; created_at: string }>; freeSpins?: { available: number; totalAwarded: number; nextRecurringAt: string | null; grants: Array<{ id: string; grantType: string; spins: number; createdAt: string }> } };
const games: Game[] = [
  { title: "Royal Fortune", category: "Slots", art: "royal", tag: "HOT", provider: "MAXWIN Originals" },
  { title: "AI NEON DYNASTY", category: "Slots", art: "neon", tag: "NEW", provider: "MAXWIN Originals" },
  { title: "Golden Vault", category: "Jackpots", art: "vault", tag: "JACKPOT", provider: "MAXWIN Originals" },
  { title: "Temple of Ra", category: "Jackpots", art: "book", tag: "JACKPOT", provider: "MAXWIN Originals" },
  { title: "Moon Temple", category: "Slots", art: "moon", provider: "MAXWIN Originals" },
  { title: "Lucky 7s", category: "Classic", art: "lucky", tag: "COMING SOON", provider: "MAXWIN Originals", comingSoon: true },
  { title: "Cosmic Gems", category: "Slots", art: "cosmic", tag: "COMING SOON", provider: "MAXWIN Originals", comingSoon: true },
  { title: "Crown of Gold", category: "Jackpots", art: "crown", tag: "COMING SOON", provider: "MAXWIN Originals", comingSoon: true },
  { title: "Midnight Spin", category: "Classic", art: "midnight", tag: "COMING SOON", provider: "MAXWIN Originals", comingSoon: true },
];
const heroSlides = [
  { title: "Temple of Ra", badge: "FEATURED", image: "/images/book-of-ra/book-of-ra-desktop.jpg", gameTitle: "Temple of Ra", mode: "real" as const },
  { title: "AI NEON DYNASTY", badge: "JUST OPENED", image: "/images/slots/ai-neon-dynasty/cover-desktop.jpg", gameTitle: "AI NEON DYNASTY", mode: "demo" as const },
  { title: "Royal Fortune", badge: "FEATURED", image: "/images/royal-fortune/royal-fortune-cover-desktop.jpg", gameTitle: "Royal Fortune", mode: "demo" as const },
  { title: "Golden Vault", badge: "JUST OPENED", image: "/images/golden-vault/golden-vault-desktop.jpg", gameTitle: "Golden Vault", mode: "demo" as const },
];
const categories = ["All Games", "Slots", "Jackpots", "Classic"];
const gameSlugs: Record<string,string> = {
  "Royal Fortune":"royal-fortune",
  "AI NEON DYNASTY":"ai-neon-dynasty",
  "Golden Vault":"golden-vault",
  "Temple of Ra":"temple-of-ra",
  "Moon Temple":"moon-temple",
  "Lucky 7s":"lucky-7s",
  "Cosmic Gems":"cosmic-gems",
  "Crown of Gold":"crown-of-gold",
  "Midnight Spin":"midnight-spin"
};
const getGameFromPath = (pathname:string):Game|null => {
  const slug = pathname.replace(/\/+$/, "").match(/^\/games\/([^/]+)$/)?.[1];
  if (!slug) return null;
  const title = Object.entries(gameSlugs).find(([,value])=>value===slug)?.[0];
  return title ? games.find(game=>game.title===title) || null : null;
};
const getGamePath = (game:Game,mode:"demo"|"real"="demo") => {
  const path = "/games/"+(gameSlugs[game.title] || game.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""));
  return mode==="real" && game.title==="Temple of Ra" ? path+"?mode=real" : path;
};
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
  const [licenseOpen, setLicenseOpen] = useState(() => window.location.pathname.replace(/\/$/, "") === "/license");
  useEffect(() => {
    const syncLicenseRoute = () => setLicenseOpen(window.location.pathname.replace(/\/$/, "") === "/license");
    window.addEventListener("popstate", syncLicenseRoute);
    return () => window.removeEventListener("popstate", syncLicenseRoute);
  }, []);
  const openLicensePage = () => {
    window.history.pushState({}, "", "/license");
    setLicenseOpen(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const closeLicensePage = () => {
    window.history.pushState({}, "", "/");
    setLicenseOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const [active, setActive] = useState("All Games");
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<"signin" | "register" | "deposit" | "withdraw" | "game" | "profile" | null>(() => getGameFromPath(window.location.pathname) ? "game" : null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(() => getGameFromPath(window.location.pathname));
  const [selectedPlayMode, setSelectedPlayMode] = useState<"demo" | "real">(() => new URLSearchParams(window.location.search).get("mode") === "real" && getGameFromPath(window.location.pathname)?.title === "Temple of Ra" ? "real" : "demo");
  const [returnToGameAfterDeposit, setReturnToGameAfterDeposit] = useState(false);
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
  const [referralData, setReferralData] = useState<any>(null);
  const [referralBusy, setReferralBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [bonusBusy, setBonusBusy] = useState<string | null>(null);
  const [freeSpinBusy, setFreeSpinBusy] = useState(false);
  const [templeSlotBusy, setTempleSlotBusy] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");
  const walletAsset = "SOL" as const;
  const [depositUsd, setDepositUsd] = useState(5);
  const [depositAmountChosen, setDepositAmountChosen] = useState(true);
  const [solUsdRate, setSolUsdRate] = useState<number | null>(null);
  const [solRateUpdatedAt, setSolRateUpdatedAt] = useState<string | null>(null);
  const [solRateError, setSolRateError] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawMessage, setWithdrawMessage] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [depositSignature, setDepositSignature] = useState("");
  const [depositMessage, setDepositMessage] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositRequest, setDepositRequest] = useState<{ id: string; amountSol: string; usdTarget: number; expiresAt: string } | null>(null);
  const [depositNow, setDepositNow] = useState(() => Date.now());
  const depositExpiryMs = depositRequest ? Date.parse(depositRequest.expiresAt) : NaN;
  const depositSecondsLeft = depositRequest && Number.isFinite(depositExpiryMs) ? Math.max(0, Math.ceil((depositExpiryMs - depositNow) / 1000)) : null;
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
  useEffect(() => { if (modal === "profile" && authUser) void loadReferrals(); }, [modal, authUser?.id]);
  const loadReferrals = async () => {
    setReferralBusy(true);
    try {
      const response = await fetch("/api/referrals", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load referral program.");
      setReferralData(data);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not load referral program.");
    } finally { setReferralBusy(false); }
  };
  const chooseReferralReward = async (rewardId: string, choice: "wallet" | "book_of_temple") => {
    setReferralBusy(true); setProfileMessage("");
    try {
      const response = await fetch("/api/referrals", { method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({rewardId,choice}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not request referral reward.");
      setProfileMessage(data.message || "Referral reward request submitted.");
      await loadReferrals();
    } catch(error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not request referral reward.");
    } finally { setReferralBusy(false); }
  };

  useEffect(() => {
    if (modal !== "deposit" || !depositRequest) return;
    const updateNow = () => setDepositNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 1000);
    return () => window.clearInterval(interval);
  }, [modal, depositRequest?.expiresAt]);
  useEffect(() => {
    if (modal !== "deposit" || !authUser) return;
    let cancelled = false;
    let scanning = false;
    const scan = async () => {
      if (scanning || cancelled) return;
      scanning = true;
      try {
        const response = await fetch("/api/wallet/deposit", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "autoScan" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Automatic deposit check is temporarily unavailable.");
        if (!cancelled && data.currentUserCredited) {
          setDepositMessage(data.message || "Deposit automatically verified and credited.");
          setDepositRequest(null);
          setDepositSignature("");
          setDepositAmountChosen(false);
          await loadWallet();
        }
      } catch (error) {
        if (!cancelled) setDepositMessage(error instanceof Error ? error.message : "Automatic deposit check is temporarily unavailable.");
      } finally { scanning = false; }
    };
    void scan();
    const interval = window.setInterval(() => void scan(), 8000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [modal, authUser?.id]);
  useEffect(() => {
    if (modal !== "deposit" || !authUser) return;
    let cancelled = false;
    fetch("/api/wallet/deposit", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not recover deposit request.");
        if (!cancelled && data.request) setDepositRequest(data.request);
      })
      .catch(error => {
        if (!cancelled) setDepositMessage(error instanceof Error ? error.message : "Could not recover deposit request.");
      });
    return () => { cancelled = true; };
  }, [modal, authUser?.id]);
  useEffect(() => {
    if (modal !== "deposit" && modal !== "withdraw") return;
    let cancelled = false;
    setSolRateError("");
    fetch("/api/wallet/quote", { credentials: "same-origin", cache: "no-store" }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Number.isFinite(data.solUsd) || data.solUsd <= 0) throw new Error(data.error || "Live SOL/USD quote is unavailable.");
      if (!cancelled) { setSolUsdRate(data.solUsd); setSolRateUpdatedAt(data.updatedAt || null); }
    }).catch(error => { if (!cancelled) { setSolUsdRate(null); setSolRateError(error instanceof Error ? error.message : "Live SOL/USD quote is unavailable."); } });
    return () => { cancelled = true; };
  }, [modal]);
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
  const playFreeSpin = () => {
    if (!authUser) { setModal("signin"); return; }
    const temple = games.find(game => game.title === "Temple of Ra");
    if (temple) openGame(temple, "real");
  };
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
  const cancelDepositRequest = async (nextAmount?: number) => {
    if (!depositRequest) { if (typeof nextAmount === "number") setDepositUsd(nextAmount); return; }
    setDepositBusy(true); setDepositMessage("");
    try {
      const response = await fetch("/api/wallet/deposit", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", requestId: depositRequest.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not change deposit quote.");
      setDepositRequest(null);
      setDepositSignature("");
      setDepositAmountChosen(typeof nextAmount === "number");
      if (typeof nextAmount === "number") setDepositUsd(nextAmount);
      setDepositMessage("Quote closed. Choose a new deposit amount. Any transfer already sent before the original expiry can still be verified.");
    } catch (error) {
      setDepositMessage(error instanceof Error ? error.message : "Could not change deposit quote.");
    } finally {
      setDepositBusy(false);
    }
  };
  const createDepositRequest = async () => {
    setDepositBusy(true); setDepositMessage(""); setDepositRequest(null); setDepositSignature("");
    try {
      const response = await fetch("/api/wallet/deposit", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", usd: depositUsd })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not create deposit request.");
      setDepositRequest(data.request);
      setDepositMessage(data.message || "Deposit request created.");
    } catch (error) {
      setDepositMessage(error instanceof Error ? error.message : "Could not create deposit request.");
    } finally {
      setDepositBusy(false);
    }
  };
  useEffect(() => {
    if (modal !== "deposit" || !depositRequest || depositSecondsLeft !== 0 || depositBusy) return;
    setDepositRequest(null);
    setDepositSignature("");
    setDepositAmountChosen(false);
    setDepositMessage("Quote expired. Select a deposit amount to start a new request. If you already sent SOL before expiry, MAXWIN will keep checking the transaction.");
  }, [modal, depositRequest?.id, depositSecondsLeft, depositBusy]);

  const submitDeposit = async () => {
    const signature = depositSignature.trim();
    if (!depositRequest) { setDepositMessage("Create a deposit request first."); return; }
    if (!signature) { setDepositMessage("Paste the Solana transaction signature first."); return; }
    setDepositBusy(true); setDepositMessage("");
    try {
      const response = await fetch("/api/wallet/deposit", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: depositRequest.id, signature })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not verify this deposit.");
      setDepositMessage(data.message || "Deposit verified.");
      setDepositSignature("");
      setDepositRequest(null);
      setDepositAmountChosen(false);
      await loadWallet();
    } catch (error) {
      setDepositMessage(error instanceof Error ? error.message : "Could not verify this deposit.");
    } finally {
      setDepositBusy(false);
    }
  };
  const submitWithdrawal = async () => {
    setWithdrawBusy(true); setWithdrawMessage("");
    try {
      const response = await fetch("/api/wallet/withdraw", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: "SOL", amountUsd: withdrawAmount, address: withdrawAddress }) });
      const data = await response.json().catch(() => ({}));
      setWithdrawMessage(response.ok ? (data.message || ("Request recorded: " + (data.request?.status || "pending"))) : (data.error || "Withdrawal request failed."));
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
          ? { username: authUsername, email: authEmail, password: authPassword, referralUsername: new URLSearchParams(window.location.search).get("ref") }
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
      setModal(selectedGame && getGameFromPath(window.location.pathname) ? "game" : null);
    } catch {
      setAuthError("Account API is not available yet. Check the Cloudflare deployment and database binding.");
    } finally {
      setAuthBusy(false);
    }
  };
  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch { /* clear local account view regardless */ }
    setAuthUser(null);
    setDepositRequest(null);
    setDepositSignature("");
    setDepositMessage("");
    setWalletData(null);
    setModal(null);
  };
  const filtered = useMemo(() => games.filter(g => (active === "All Games" || g.category === active) && g.title.toLowerCase().includes(search.toLowerCase())), [active, search]);
  useEffect(() => {
    const syncGameRoute = () => {
      const routeGame = getGameFromPath(window.location.pathname);
      if (routeGame) {
        setSelectedGame(routeGame);
        setSelectedPlayMode(new URLSearchParams(window.location.search).get("mode") === "real" && routeGame.title === "Temple of Ra" ? "real" : "demo");
        setModal("game");
      } else {
        setSelectedGame(null);
        setSelectedPlayMode("demo");
        setModal(current => current === "game" ? null : current);
      }
    };
    window.addEventListener("popstate", syncGameRoute);
    return () => window.removeEventListener("popstate", syncGameRoute);
  }, []);
  const returnToLobby = () => {
    if (getGameFromPath(window.location.pathname)) window.history.pushState({}, "", "/");
    setSelectedGame(null);
    setSelectedPlayMode("demo");
    setModal(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const openGame = (game: Game, playMode: "demo" | "real" = "demo") => {
    window.history.pushState({}, "", getGamePath(game, playMode));
    setSelectedGame(game); setSelectedPlayMode(playMode); setModal("game");
  };
  const closeModal = () => {
    if (modal === "deposit" && returnToGameAfterDeposit) { setReturnToGameAfterDeposit(false); setModal("game"); return; }
    if ((modal === "signin" || modal === "register") && selectedGame && getGameFromPath(window.location.pathname)) { setModal("game"); return; }
    if (modal === "game" && selectedGame?.title === "Temple of Ra" && templeSlotBusy) return;
    const isDemoSlot = modal === "game" && selectedPlayMode === "demo" && Boolean(authUser);
    const gameToReset = selectedGame?.title === "Royal Fortune"
      ? "/api/games/royal-fortune"
      : selectedGame?.title === "Temple of Ra"
        ? "/api/games/book-of-ra"
        : selectedGame?.title === "Golden Vault"
          ? "/api/games/golden-vault"
          : null;
    if (!isDemoSlot || !gameToReset) { if (modal === "game" && selectedGame) returnToLobby(); else setModal(null); return; }
    void fetch(gameToReset, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetDemo" })
    }).finally(returnToLobby);
  };
  if (window.location.pathname.replace(/\/+$/, "") === "/admin") return <AdminPanel />;
  if (window.location.pathname.replace(/\/+$/, "") === "/admin/support") return <SupportAdmin />;
  if (window.location.pathname.replace(/\/+$/, "") === "/admin/math-tuner") return <MathTuner />;
  if (window.location.pathname.replace(/\/+$/, "") === "/support") return <SupportPage />;
  return <div className={theme === "light" ? "app-shell theme-light" : "app-shell"}>
    <div className="topline"><span><Sparkles size={13}/> MAXWIN ORIGINALS · A NEW ERA OF PLAY</span><span className="topline-right"><ShieldCheck size={13}/> Security-first platform <i /> 18+ only</span></div>
    <header className="header">
      <button className="mobile-menu icon-btn" aria-label="Open menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X/> : <Menu/>}</button>
      <a className="brand" href="#" aria-label="MAXWIN home"><span className="brand-mark"><Crown size={23}/></span><span>MAX<span className="brand-gold">WIN</span><small>CRYPTO CASINO</small></span></a>
      <nav className={mobileMenu ? "nav nav-open" : "nav"}>
        <a className="nav-active" href="#lobby" onClick={() => setMobileMenu(false)}><Gamepad2 size={16}/> Casino</a>
        <a href="#featured" onClick={() => setMobileMenu(false)}><Trophy size={16}/> Featured</a>
        <a href="#responsible" onClick={() => setMobileMenu(false)}><ShieldCheck size={16}/> Play responsibly</a>
        <a href="/support"><CircleHelp size={16}/> Support</a>
      </nav>
      <div className="header-actions"><button className="theme-toggle" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}<span>{theme === "dark" ? "Light" : "Dark"}</span></button><button className="btn btn-ghost" onClick={() => { if (authUser) { setSelectedGame(null); setProfileMessage(""); setModal("profile"); } else openAuth("signin"); }}>{authUser ? <><span className="header-avatar">{profileData?.avatarDataUrl ? <img src={profileData.avatarDataUrl} alt="" /> : authUser.username.slice(0,1).toUpperCase()}</span>{authUser.username}</> : "Log in"}</button>{!authUser && <button className="btn btn-gold" onClick={() => openAuth("register")}>Create account</button>}{authUser && <button className="btn btn-gold" onClick={logout}>Log out</button>}</div>
    </header>
    {licenseOpen ? <main className="license-page">
      <div className="license-page-top"><button type="button" className="btn btn-outline" onClick={closeLicensePage}>← Back to MAXWIN</button><span><ShieldCheck size={15}/> MAXWIN LEGAL</span></div>
      <article className="license-document">
        <div className="eyebrow">MAXWIN · ALL RIGHTS RESERVED</div>
        <h1>Proprietary <em>License</em></h1>
        <p className="license-lead">The original MAXWIN casino website, application, and project materials are protected by applicable intellectual-property laws. All rights are reserved except where a written permission or mandatory legal right applies.</p>
        <p className="license-effective">Effective date: October 2026</p>
        <h2>1. Ownership and scope</h2>
        <p>This notice applies only to original materials in the MAXWIN project to the extent the relevant rights holder owns or is authorized to license them, including original source code, application logic, server functions, interface layouts, visual designs, original game implementations, artwork, animations, audio, text, branding, logos, and project-specific assets.</p>
        <h2>2. Restrictions</h2>
        <p>Without prior written permission from the relevant rights holder, you may not copy, reproduce, modify, adapt, redistribute, republish, sublicense, sell, commercially exploit, host, deploy, mirror, rebrand, or operate a website, casino, application, or service using MAXWIN-owned materials, except where applicable law expressly permits the activity.</p>
        <h2>3. No open-source or commercial-use grant</h2>
        <p>This is a proprietary rights notice. It does not grant a general license to reuse, modify, distribute, or commercially deploy MAXWIN-owned materials. Public visibility of project materials does not by itself grant those permissions.</p>
        <h2>4. Third-party materials</h2>
        <p>This notice does not claim ownership of third-party code, open-source dependencies, fonts, services, trademarks, game titles, artwork, sound recordings, or other third-party materials. Those remain subject to their respective owners’ rights and applicable license terms. Third-party components must be used in accordance with their own terms.</p>
        <h2>5. Trademarks and branding</h2>
        <p>You may not use MAXWIN names, logos, branding, or original assets in a way that falsely suggests affiliation, sponsorship, or approval by MAXWIN or the relevant rights holder.</p>
        <h2>6. No warranty</h2>
        <p>To the extent permitted by applicable law, project materials are provided “as is”, without warranties of any kind.</p>
        <div className="license-notice"><ShieldCheck size={19}/><p>This page is a project-level rights notice, not legal advice. Ownership and enforceability depend on the rights held by the relevant parties and applicable law.</p></div>
        <p className="license-copyright">© 2026 MaxsanAI / MAXWIN, to the extent of rights held by the relevant rights holder. All rights reserved.</p>
      </article>
    </main> : <main>
      <section className="hero-slot-slider" id="featured">
        <div className="hero-slider-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> FEATURED &amp; NEWLY OPENED</div><h1>Find your next <em>big game.</em></h1><p>New releases and featured MAXWIN originals, moving from right to left.</p></div><button className="btn btn-gold" type="button" onClick={() => document.getElementById("lobby")?.scrollIntoView({behavior:"smooth"})}>Explore games</button></div>
        <div className="hero-slider-viewport"><div className="hero-slider-track">{[...heroSlides,...heroSlides].map((slide,index) => { const game=games.find(item=>item.title===slide.gameTitle); return <button className="hero-slide-card" type="button" key={slide.title+"-"+index} onClick={() => {if(game)openGame(game,slide.mode);}} aria-label={(slide.badge==="JUST OPENED"?"Newly opened: ":"Featured: ")+slide.title}><img src={slide.image} alt={slide.title+" slot artwork"} loading={index<3?"eager":"lazy"} /><span className={"hero-slide-badge"+(slide.badge==="JUST OPENED"?" is-new":"")}>{slide.badge}</span><span className="hero-slide-shade"/><span className="hero-slide-copy"><small>MAXWIN ORIGINALS</small><strong>{slide.title}</strong><span>{slide.mode==="real"?"PLAY FOR REAL":"PLAY DEMO"} <b>›</b></span></span></button>;})}</div></div>
      </section>
      <section className="quick-strip"><div><span className="quick-icon"><Wallet size={18}/></span><span><b>Crypto architecture</b><small>Payments integration pending</small></span></div><div><span className="quick-icon"><ShieldCheck size={18}/></span><span><b>Security by design</b><small>Backend controls to be implemented</small></span></div><div><span className="quick-icon"><CircleHelp size={18}/></span><span><b>Clear game information</b><small>Rules shown before real play</small></span></div></section>
      <section className="lobby-section" id="lobby"><div className="section-heading"><div><div className="eyebrow">FIND YOUR NEXT FAVOURITE</div><h2>Explore the <em>lobby</em></h2></div><label className="search-box"><Search size={17}/><input aria-label="Search games" placeholder="Search games..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15}/></button>}</label></div>
        <div className="lobby-toolbar"><div className="category-tabs">{categories.map(c => <button key={c} className={active === c ? "category active" : "category"} onClick={() => setActive(c)}>{c}</button>)}</div><button className="sort-btn" onClick={() => setActive("All Games")}>All providers </button></div>
        <div className="game-grid">{filtered.map((g) => <article className="game-card" key={g.title}><button type="button" className="game-card-preview" onClick={() => { if (!g.comingSoon) openGame(g, "demo"); }} disabled={g.comingSoon} aria-label={g.comingSoon ? g.title + " coming soon" : "View " + g.title}><div className={"game-art art-" + g.art + (g.art === "royal" ? " royal-cover-art" : "") + (g.art === "book" ? " book-cover-art" : "") + (g.art === "neon" ? " neon-cover-art" : "") + (g.art === "vault" ? " vault-cover-art" : "")}><div className="art-glow"/>{g.art === "royal" && <picture className="royal-cover-picture"><source media="(max-width: 720px)" srcSet="/images/royal-fortune/royal-fortune-cover-mobile.jpg"/><img src="/images/royal-fortune/royal-fortune-cover-desktop.jpg" alt="Royal Fortune slot cover" loading="eager" fetchPriority="high"/></picture>}{g.art === "book" && <picture className="book-cover-picture"><source media="(max-width: 720px)" srcSet="/images/book-of-ra/book-of-ra-mobile.jpg"/><img src="/images/book-of-ra/book-of-ra-desktop.jpg" alt="Temple of Ra slot cover" loading="eager" decoding="async"/></picture>}{g.art === "neon" && <picture className="neon-cover-picture"><source media="(max-width: 720px)" srcSet="/images/slots/ai-neon-dynasty/cover-mobile.jpg"/><img src="/images/slots/ai-neon-dynasty/cover-desktop.jpg" alt="AI NEON DYNASTY slot cover" loading="eager" decoding="async"/></picture>}{g.art === "vault" && <picture className="vault-cover-picture"><source media="(max-width: 720px)" srcSet="/images/golden-vault/golden-vault-mobile.jpg"/><img src="/images/golden-vault/golden-vault-desktop.jpg" alt="Golden Vault mafia slot cover featuring Giovanni Don and his right-hand man" loading="eager" decoding="async"/></picture>}<span className="art-symbol">{g.art === "royal" || g.art === "book" || g.art === "neon" || g.art === "vault" ? "" : g.art === "vault" ? "◈" : g.art === "moon" ? "☾" : g.art === "lucky" ? "7" : g.art === "cosmic" ? "✧" : g.art === "crown" ? "♕" : "✺"}</span>{g.art !== "royal" && g.art !== "book" && g.art !== "neon" && g.art !== "vault" && <span className="art-title">{g.title.toUpperCase()}</span>}{g.tag && <span className={"game-tag " + (g.tag === "JACKPOT" ? "tag-gold" : "")}>{g.tag}</span>}<span className="play-overlay"><span>View game details</span></span></div><div className="game-info"><span><b>{g.title}</b><small>{g.provider}</small></span><span className="game-star"><Star size={15}/></span></div></button><div className="game-mode-picker">{g.comingSoon ? <div className="game-coming-soon" role="status">COMING SOON</div> : <><button type="button" className="game-mode-demo" onClick={() => openGame(g, "demo")}>DEMO PLAY</button><button type="button" className="game-mode-real" disabled={g.title !== "Temple of Ra"} onClick={() => openGame(g, "real")}>{g.title === "Temple of Ra" ? "PLAY FOR REAL" : "LOCKED"} <small>{g.title === "Temple of Ra" ? "BOOK ONLY" : "UNAVAILABLE"}</small></button></>}</div></article>)}</div>
        {filtered.length === 0 && <div className="empty-state">No games match that search. Try another title.</div>}
        <p className="catalog-note">
         <ShieldCheck size={15} />
         Book of Ra is available in Real Money mode. Other games remain in Demo mode.
      </p>
      </section>
      <section className="responsible" id="responsible"><div className="responsible-icon"><ShieldCheck size={24}/></div><div><div className="eyebrow">PLAY WITH A PLAN</div><h3>Entertainment should stay in your control.</h3><p>MAXWIN is being built with responsible-gambling controls in mind. Real-money play must remain unavailable until age checks, jurisdiction restrictions, licensing, and required safeguards are verified.</p></div><a href="#responsible" onClick={e => { e.preventDefault(); setModal("game"); setSelectedGame(null); }}>Platform status</a></section>
    </main>}
    <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><Crown size={19}/></span><span>MAX<span className="brand-gold">WIN</span><small>CRYPTO CASINO</small></span></a><span>© 2026 MAXWIN. All rights reserved. Play responsibly. 18+.</span><div><a href="#responsible">Responsible play</a><a href="#responsible">Privacy</a><a href="#responsible">Terms</a><a href="/license" onClick={e => { e.preventDefault(); openLicensePage(); }}>Proprietary license</a><a href="/admin/math-tuner">Math Tuner</a></div></footer>
    {modal && <div className={`modal-backdrop${selectedGame?.title === "Golden Vault" && modal === "game" && selectedPlayMode === "demo" ? " modal-backdrop-golden-vault" : ""}`} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}><section className={`modal ${modal === "game" && (selectedGame?.title === "Royal Fortune" || selectedGame?.title === "Temple of Ra" || selectedGame?.title === "AI NEON DYNASTY" || selectedGame?.title === "Golden Vault" || selectedGame?.title === "Moon Temple") && (selectedPlayMode === "demo" || (selectedGame?.title === "Temple of Ra" && selectedPlayMode === "real")) ? (selectedGame?.title === "Golden Vault" ? "modal-slot modal-slot-golden-vault" : "modal-slot") : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={closeModal} disabled={modal === "game" && selectedGame?.title === "Temple of Ra" && templeSlotBusy} aria-label="Close dialog"><X size={19}/></button><div className="modal-mark"><Crown size={25}/></div><div className="eyebrow">{modal === "signin" || modal === "register" ? "YOUR MAXWIN ACCOUNT" : "MAXWIN PLATFORM STATUS"}</div><h2 id="modal-title">{modal === "signin" ? "Log in" : modal === "register" ? "Create your account" : modal === "deposit" ? "Deposit crypto" : modal === "withdraw" ? "Withdraw crypto" : modal === "profile" ? "Your profile" : selectedGame ? selectedGame.title : authUser ? "Your account" : "Real-money features are not active"}</h2>{(modal === "signin" || modal === "register") ? <form className="auth-form" onSubmit={e => { e.preventDefault(); void submitAuth(); }}><p>{modal === "register" ? "Create your MAXWIN login. Use an email you can access and a unique password." : "Sign in to your MAXWIN account."}</p>{modal === "register" && <label>Username<input autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required value={authUsername} onChange={e => setAuthUsername(e.target.value)} placeholder="Choose a username"/></label>}<label>Email address<input type="email" autoComplete="email" maxLength={254} required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete={modal === "register" ? "new-password" : "current-password"} minLength={modal === "register" ? 10 : 1} maxLength={128} required value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder={modal === "register" ? "At least 10 characters" : "Your password"}/></label>{authError && <p className="auth-error" role="alert">{authError}</p>}<button className="btn btn-gold modal-done" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : modal === "register" ? "Create account" : "Log in"}</button><button className="auth-switch" type="button" onClick={() => openAuth(modal === "register" ? "signin" : "register")}>{modal === "register" ? "Already have an account? Log in" : "New to MAXWIN? Create an account"}</button><small className="auth-note">Book of Ra supports real-mode SOL wallet settlement. Deposits are credited after on-chain verification; withdrawals require manual approval.</small></form> : (modal === "deposit" || modal === "withdraw") ? <div className="auth-form wallet-form">
      <p>{modal === "deposit" ? "Choose a network to view its configured deposit address. Deposits are only credited after an on-chain processor verifies the transfer." : "Request a withdrawal from your confirmed available balance. Requests require manual approval; MAXWIN does not send withdrawals automatically."}</p>
      <div className="category-tabs wallet-network-tabs"><button type="button" className="category active">Solana · SOL</button></div>
      {walletLoading && <p>Loading wallet…</p>}
      {walletError && <p className="auth-error" role="alert">{walletError} {(!authUser) && <button type="button" className="auth-switch" onClick={() => openAuth("signin")}>Log in</button>}</p>}
      {walletData && <div className="modal-status"><span className="status-dot"/><span><b>Available balance: {(Number(walletData.balances?.[walletAsset]?.availableUnits || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })} {walletAsset}</b><small>Reserved: {(Number(walletData.balances?.[walletAsset]?.reservedUnits || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })} {walletAsset}</small></span></div>}
      {modal === "deposit" ? <div className="wallet-address-panel">
        <p><b>Choose deposit amount (USD)</b></p><p className="auth-note">Automatic SOL deposit detection is active while this window is open. Keep this page open after sending; MAXWIN checks finalized Solana transactions every 8 seconds. If detection fails, the transaction-signature field remains available as a fallback.</p>
        <div className="category-tabs wallet-network-tabs">{[5, 10, 15, 20, 25, 30].map(amount => <button key={amount} type="button" disabled={depositBusy} className={depositAmountChosen && depositUsd === amount ? "category active" : "category"} onClick={() => { if (depositRequest) { void cancelDepositRequest(amount); return; } setDepositUsd(amount); setDepositAmountChosen(true); setDepositSignature(""); setDepositMessage(""); }}>{amount}</button>)}</div>
        <div className="modal-status"><span className="status-dot"/><span><b>{!depositAmountChosen ? "Select a deposit amount" : solUsdRate ? ((depositUsd / solUsdRate).toFixed(6) + " SOL") : "SOL quote loading…"}</b><small>{depositAmountChosen ? "$" + depositUsd.toFixed(2) + " USD" + (solUsdRate ? " at $" + solUsdRate.toLocaleString(undefined, { maximumFractionDigits: 4 }) + " per SOL" : "") : "Choose $5–$30 USD to continue"}</small></span></div>
        {solRateUpdatedAt && <small className="auth-note">Rate updated: {new Date(solRateUpdatedAt).toLocaleTimeString()}</small>}
        {solRateError && <p className="auth-error" role="alert">{solRateError}</p>}
        <label>SOL deposit address<input readOnly value={walletData?.deposits?.SOL?.address || ""} placeholder={walletLoading ? "Loading…" : "Deposit address not configured"} /></label>
        {walletData?.deposits?.SOL?.address ? <button type="button" className="btn btn-gold modal-done" onClick={() => { void navigator.clipboard?.writeText(walletData.deposits.SOL.address); }}>Copy SOL deposit address</button> : <p className="auth-note">Set SOL_DEPOSIT_ADDRESS in Cloudflare Pages → Settings → Variables and secrets. Use only an address controlled by you.</p>}
        <button type="button" className="btn btn-gold modal-done" onClick={() => void createDepositRequest()} disabled={depositBusy || Boolean(depositRequest) || !depositAmountChosen || !walletData?.deposits?.SOL?.address || !solUsdRate}>{depositBusy ? "Preparing request…" : depositRequest ? "Verify or clear the current request first" : "Create SOL deposit request"}</button>
        {depositRequest && <div className="modal-status"><span className="status-dot"/><span><b>Send exactly {depositRequest.amountSol} SOL</b><small>For the ${depositRequest.usdTarget} deposit quote · expires {new Date(depositRequest.expiresAt).toLocaleTimeString()}</small><small>{depositSecondsLeft === null ? "Calculating expiry…" : depositSecondsLeft === 0 ? "QUOTE EXPIRED — choose an amount to start again." : `Time remaining: ${String(Math.floor(depositSecondsLeft / 60)).padStart(2, "0")}:${String((depositSecondsLeft % 60)).padStart(2, "0")}`}</small></span></div>}
        {depositRequest && <button type="button" className="auth-switch" disabled={depositBusy} onClick={() => void cancelDepositRequest()}>{depositBusy ? "Updating quote…" : "Change deposit amount"}</button>}
        {depositRequest && <label>Transaction signature (fallback only)<input value={depositSignature} onChange={e => setDepositSignature(e.target.value)} placeholder="Only if automatic detection fails" autoComplete="off" spellCheck={false} /></label>}
        {depositRequest && <button type="button" className="btn btn-gold modal-done" onClick={() => void submitDeposit()} disabled={depositBusy || !depositSignature.trim()}>{depositBusy ? "Verifying on Solana…" : depositSecondsLeft === 0 ? "Verify on-chain transaction" : "Verify deposit and credit wallet"}</button>}
        {depositMessage && <p className={depositMessage.toLowerCase().includes("credited") || depositMessage.toLowerCase().includes("verified") || depositMessage.toLowerCase().includes("request created") ? "auth-note" : "auth-error"} role="status">{depositMessage}</p>}
        <p className="auth-note">Send the exact SOL amount shown before the quote expires. MAXWIN checks the finalized Solana transaction and prevents duplicate credits. Keep your transaction signature until the deposit appears in your wallet.</p>
      </div> : <form className="auth-form" onSubmit={e => { e.preventDefault(); void submitWithdrawal(); }}>
        <label>Withdrawal amount (USD)<input required inputMode="decimal" type="number" min="10" step="0.01" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="10.00" /><small className="auth-note">Minimum withdrawal: $10. {solUsdRate && Number(withdrawAmount) > 0 ? `Estimated payout: ${(Number(withdrawAmount) / solUsdRate).toFixed(6)} SOL at ${solUsdRate.toFixed(2)}/SOL.` : solRateError || "Fetching the live SOL/USD rate…"}</small></label>
        <label>Your Solana address (SOL payout)<input required value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value.trim())} placeholder="Solana address" /></label>
        <button className="btn btn-gold modal-done" type="submit" disabled={withdrawBusy}>{withdrawBusy ? "Submitting…" : "Request withdrawal"}</button>
        {withdrawMessage && <p className={withdrawMessage.startsWith("Request recorded") ? "auth-note" : "auth-error"} role="status">{withdrawMessage}</p>}<p className="auth-note">Withdrawals are processed Monday–Saturday, Serbia time. Requests submitted on Sunday remain pending until Monday. Every payout requires manual admin approval; no SOL is sent automatically.</p>
      </form>}
      {walletData?.notice && <small className="auth-note">{walletData.notice}</small>}
      <button className="btn btn-ghost modal-done" onClick={() => void loadWallet()}>Refresh wallet</button>
    </div> : modal === "profile" && authUser ? <div className="auth-form profile-form">
      <div className="profile-identity"><div className="profile-avatar">{profileData?.avatarDataUrl ? <img src={profileData.avatarDataUrl} alt="Profile photo" /> : authUser.username.slice(0,1).toUpperCase()}</div><div><b>{authUser.username}</b><small>{authUser.email}</small></div></div>
      <label className="upload-photo"><span>Upload profile photo</span><span className="upload-photo-button">{profileBusy ? "Saving…" : "Choose file"}</span><input className="profile-file-input" type="file" accept="image/*" disabled={profileBusy} aria-label="Choose profile photo" onChange={e => { void uploadAvatar(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
      {profileBusy && <p>Saving photo…</p>}{profileMessage && <p className={profileMessage.toLowerCase().includes("could not") || profileMessage.toLowerCase().includes("choose") ? "auth-error" : "profile-success"} role="status">{profileMessage}</p>}
      <div className="profile-account-info"><span>Email</span><b>{authUser.email}</b><span>Account created</span><b>{new Date(authUser.createdAt).toLocaleDateString()}</b></div>
      <section className="profile-wallet"><h3>Wallet balances</h3>{walletLoading && <p>Loading balances…</p>}{walletError && <p className="auth-error">{walletError}</p>}<div className="profile-balance-grid">{(["SOL"] as const).map(asset => <div key={asset}><span>{asset}</span><b>{(Number(walletData?.balances?.[asset]?.availableUnits || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })}</b><small>Available</small></div>)}</div>{walletData?.transactions?.length ? <div className="profile-transactions"><b>Recent wallet activity</b>{walletData.transactions.slice(0, 4).map((tx: any) => <div key={tx.id}><span>{tx.kind} · {tx.asset}<small>{tx.status} · {new Date(tx.created_at).toLocaleDateString()}</small></span><strong>{(Number(tx.amount_units || "0") / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })}</strong></div>)}</div> : <p className="profile-muted">Deposits and transactions appear here after verified processing is active.</p>}</section>
      <section className="free-spins-panel"><div className="free-spins-heading"><span className="free-spins-icon"><Sparkles size={20}/></span><div><small>MAXWIN REWARDS</small><h3>Free Spins</h3></div><strong>{profileData?.freeSpins?.available ?? 0}</strong></div><p className="free-spins-desc">Welcome spins are awarded once after registration and can only be used in Temple of Ra Real Play. Claim 30 more every 15 days; bonus-funded wins stay non-withdrawable.</p><div className="free-spins-next"><span>Next 30-spin reward</span><b>{profileData?.freeSpins?.nextRecurringAt ? new Date(profileData.freeSpins.nextRecurringAt).toLocaleDateString() : "Pending setup"}</b></div><button type="button" className="bonus-claim free-spins-claim" disabled={freeSpinBusy || !profileData?.freeSpins?.nextRecurringAt || new Date(profileData.freeSpins.nextRecurringAt).getTime() > Date.now()} onClick={() => void claimRecurringSpins()}>{freeSpinBusy ? "Claiming…" : "Claim 30 Free Spins"}</button><small className="auth-note">Total awarded: {profileData?.freeSpins?.totalAwarded ?? 0} · Available only in Temple of Ra Real Play, not Demo mode.</small></section>
      <section className="profile-bonuses referral-profile"><h3>Refer friends · Earn $10</h3><p>Invite 10 new players. Each must make at least one confirmed deposit. Once all 10 qualify, request one $10 reward.</p>
        {referralData && <><div className="profile-account-info"><span>Registered referrals</span><b>{referralData.total}/10</b><span>With confirmed deposit</span><b>{referralData.qualified}/10</b></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><input aria-label="Your referral link" readOnly value={referralData.referralUrl} style={{flex:"1 1 240px",minWidth:0}}/><button className="btn btn-outline" type="button" onClick={() => { void navigator.clipboard?.writeText(referralData.referralUrl).then(()=>setProfileMessage("Referral link copied.")).catch(()=>setProfileMessage("Copy failed; select the link and copy it manually.")); }}>Copy link</button></div>
        {referralData.rewards?.map((reward:any) => <div className="bonus-row" key={reward.id}><span><b>$10 Referral Reward</b><small>{reward.choice === "wallet" ? "Wallet" : reward.choice === "book_of_temple" ? "Book of Temple" : "Choose destination"}</small></span><strong>{reward.status === "paid" && reward.walletTransactionId ? "credited to SOL wallet" : reward.status === "paid" && reward.gameBonusGrantId ? "Book of Temple credits activated" : reward.status}</strong>{reward.status === "paid" && reward.walletTransactionId && <small style={{display:"block",flexBasis:"100%",opacity:.8}}>Ledger: {String(reward.walletTransactionId).slice(0,12)}… · {reward.creditedUnits ? (Number(reward.creditedUnits)/1e9).toFixed(6)+" SOL" : "confirmed wallet entry"}{reward.solUsdAtCredit ? " · $10 at $"+Number(reward.solUsdAtCredit).toFixed(2)+"/SOL" : ""}</small>}{reward.status === "paid" && reward.gameBonusGrantId && <small style={{display:"block",flexBasis:"100%",opacity:.8}}>Slot grant: {String(reward.gameBonusGrantId).slice(0,14)}… · $10 non-withdrawable credits</small>}{reward.status === "eligible" && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="bonus-claim" disabled={referralBusy} onClick={() => void chooseReferralReward(reward.id,"wallet")}>Request wallet reward</button><button className="bonus-claim" disabled={referralBusy} onClick={() => void chooseReferralReward(reward.id,"book_of_temple")}>Request Book of Temple bonus</button></div>}</div>)}
        </>}
        {referralBusy && <small className="auth-note">Updating referral status…</small>}
      </section>
      <div className="profile-actions"><button className="btn btn-gold" onClick={() => setModal("deposit")}>Deposit</button><button className="btn btn-outline" onClick={() => setModal("withdraw")}>Withdraw</button></div>
      <section className="profile-bonuses"><h3>Bonuses</h3>{profileData?.bonuses?.length ? profileData.bonuses.map(bonus => <div className="bonus-row" key={bonus.id}><span><b>{bonus.title}</b><small>{new Date(bonus.created_at).toLocaleDateString()}</small></span><strong>{bonus.amount}</strong><em>{bonus.status}</em>{bonus.status === "available" && <button className="bonus-claim" disabled={bonusBusy !== null} onClick={() => void requestBonus(bonus.id)}>{bonusBusy === bonus.id ? "Requesting…" : "Request bonus"}</button>}</div>) : <p>Your bonus offers and rewards will appear here when they are added to your account.</p>}{profileMessage && <p className={profileMessage.toLowerCase().includes("could not") || profileMessage.toLowerCase().includes("not found") || profileMessage.toLowerCase().includes("already") ? "auth-error" : "profile-success"} role="status">{profileMessage}</p>}</section>
      <small className="auth-note">Wallet balances and transaction history are stored server-side. SOL deposits require on-chain verification; withdrawals are manually approved and sent.</small>
    </div> : selectedGame && selectedPlayMode === "real" && selectedGame.title !== "Temple of Ra" ? <div className="auth-form"><div className="modal-status"><span className="status-dot"/><span><b>REAL-MONEY PLAY IS LOCKED</b><small>No deposits or cash wagers are accepted. Licensing, age/jurisdiction controls, audited game outcomes, wallet settlement and withdrawals must be verified before real-money play can be enabled.</small></span></div><button className="btn btn-gold modal-done" type="button" onClick={() => setModal(null)}>Back to lobby</button></div> : selectedGame?.title === "AI NEON DYNASTY" && authUser ? <AIDynasty onBackToLobby={returnToLobby} /> : selectedGame?.title === "AI NEON DYNASTY" ? <div className="auth-form"><p>Log in to play AI NEON DYNASTY. Demo credits have no cash value.</p><button className="btn btn-gold modal-done" type="button" onClick={() => openAuth("signin")}>Log in to play</button></div> : selectedGame?.title === "Temple of Ra" && authUser ? <BookOfRaSlot mode={selectedPlayMode} onBusyChange={setTempleSlotBusy} onRequestDeposit={() => { setReturnToGameAfterDeposit(true); setModal("deposit"); }} onBackToLobby={returnToLobby} /> : selectedGame?.title === "Temple of Ra" ? <div className="auth-form"><p>Log in to play Temple of Ra and keep your demo-credit balance on your account.</p><button className="btn btn-gold modal-done" type="button" onClick={() => openAuth("signin")}>Log in to play</button></div> : selectedGame?.title === "Golden Vault" && authUser ? <GoldenVault onBackToLobby={returnToLobby} /> : selectedGame?.title === "Golden Vault" ? <div className="auth-form"><p>Log in to play Golden Vault. Demo credits have no cash value.</p><button className="btn btn-gold modal-done" type="button" onClick={() => openAuth("signin")}>Log in to play</button></div> : selectedGame?.title === "Moon Temple" && authUser ? <MoonTemple onBackToLobby={returnToLobby} /> : selectedGame?.title === "Moon Temple" ? <div className="auth-form"><p>Log in to play Moon Temple and keep your demo-credit balance on your account.</p><button className="btn btn-gold modal-done" type="button" onClick={() => openAuth("signin")}>Log in to play</button></div> : selectedGame?.title === "Royal Fortune" && authUser ? <RoyalFortune onBackToLobby={returnToLobby} /> : selectedGame?.title === "Royal Fortune" ? <div className="auth-form"><p>Log in to play Royal Fortune and keep your demo-credit balance on your account.</p><button className="btn btn-gold modal-done" type="button" onClick={() => openAuth("signin")}>Log in to play</button></div> : selectedGame ? <div className="auth-form spin-game-panel">
       <div className="spin-game-provider"><span className={"game-art spin-mini-art art-" + selectedGame.art}><span className="art-symbol">{selectedGame.art === "royal" ? "♛" : selectedGame.art === "neon" ? "✦" : selectedGame.art === "vault" ? "◈" : selectedGame.art === "moon" ? "☾" : selectedGame.art === "lucky" ? "7" : selectedGame.art === "cosmic" ? "✧" : selectedGame.art === "crown" ? "♕" : "✺"}</span></span><span><b>{selectedGame.title}</b><small>DEMO MODE · FREE SPINS DISABLED</small></span></div>
       <p>Registration and recurring free spins can only be played in Temple of Ra Real Play. They cannot be used in this demo slot.</p>
       <button className="btn btn-gold modal-done" type="button" onClick={playFreeSpin}>{authUser ? "OPEN TEMPLE OF RA · REAL PLAY" : "LOG IN TO CONTINUE"}</button>
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
    <div className="bottom-dock"><button onClick={() => authUser ? setModal("profile") : openAuth("signin")}><Wallet size={18}/> Account</button><button onClick={() => document.getElementById("lobby")?.scrollIntoView({ behavior: "smooth" })}><Gamepad2 size={18}/> Casino</button><button onClick={() => authUser ? setModal("profile") : openAuth("signin")}><Sparkles size={18} style={{ color: "#b184ff", filter: "drop-shadow(0 0 7px rgba(155,114,255,.8))" }} />Bonuses</button><button onClick={() => authUser ? setModal("profile") : openAuth("register")}><Crown size={18}/> Join</button></div>
  </div>;
}
export default App;
