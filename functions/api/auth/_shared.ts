export interface Env {
  DB: D1Database;
  SOL_DEPOSIT_ADDRESS?: string;
  TON_DEPOSIT_ADDRESS?: string;
  SOLANA_RPC_URL?: string;
  TON_API_URL?: string;
  TON_API_KEY?: string;
  WITHDRAWALS_ENABLED?: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export async function ensureAuthSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)").run();
}

export async function ensureWalletSchema(db: D1Database): Promise<void> {
  await ensureAuthSchema(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS wallet_balances (
    user_id TEXT NOT NULL,
    asset TEXT NOT NULL CHECK (asset IN ('SOL','TON')),
    available_units TEXT NOT NULL DEFAULT '0',
    reserved_units TEXT NOT NULL DEFAULT '0',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, asset),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    asset TEXT NOT NULL CHECK (asset IN ('SOL','TON')),
    kind TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal','wager','payout','adjustment')),
    status TEXT NOT NULL CHECK (status IN ('pending','confirming','confirmed','rejected','failed','cancelled')),
    amount_units TEXT NOT NULL,
    tx_hash TEXT,
    address TEXT,
    idempotency_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata_json TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_hash_asset ON wallet_transactions(asset, tx_hash) WHERE tx_hash IS NOT NULL").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_idempotency ON wallet_transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created ON wallet_transactions(user_id, created_at DESC)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    asset TEXT NOT NULL CHECK (asset IN ('SOL','TON')),
    amount_units TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','approved','processing','sent','rejected','failed')),
    tx_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON withdrawal_requests(user_id, created_at DESC)").run();
}

export async function getUser(request: Request, db: D1Database): Promise<PublicUser | null> {
  const rawCookie = request.headers.get("Cookie") || "";
  const match = rawCookie.match(/(?:^|;\\s*)maxwin_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  const row = await db.prepare(
    "SELECT u.id, u.username, u.email, u.created_at AS createdAt FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1"
  ).bind(tokenHash, new Date().toISOString()).first<PublicUser>();
  return row || null;
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const output = new Headers(headers);
  output.set("Content-Type", "application/json; charset=utf-8");
  output.set("Cache-Control", "no-store");
  output.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers: output });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 10_000) return null;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) || [], byte => parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function cookie(token: string, maxAge: number): string {
  return `maxwin_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookie(): string {
  return "maxwin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, expires, now.toISOString()).run();
  return token;
}

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
