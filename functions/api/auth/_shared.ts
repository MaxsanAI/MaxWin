export interface Env {
  DB: D1Database;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export const SESSION_COOKIE = "maxwin_session";
const SESSION_DAYS = 7;

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const output = new Headers(headers);
  output.set("Content-Type", "application/json; charset=utf-8");
  output.set("Cache-Control", "no-store");
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
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function cookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, expires, now.toISOString()).run();
  return token;
}

export async function getUser(request: Request, db: D1Database): Promise<PublicUser | null> {
  const rawCookie = request.headers.get("Cookie") || "";
  const match = rawCookie.match(/(?:^|;\s*)maxwin_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  const row = await db.prepare(
    "SELECT u.id, u.username, u.email, u.created_at AS createdAt FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1"
  ).bind(tokenHash, new Date().toISOString()).first<PublicUser>();
  return row || null;
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
