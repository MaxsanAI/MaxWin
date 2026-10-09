import { createSession, cookie, Env, ensureAuthSchema, hashPassword, json, randomToken, readJson, SESSION_MAX_AGE } from "./_shared";
import { grantWelcomeFreeSpins } from "../profile/_free-spins";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Account service is not configured yet.", diagnostic: "D1 binding env.DB is missing." }, 503);
  const body = await readJson(request);
  if (!body) return json({ error: "Please submit valid form details." }, 400);

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return json({ error: "Username must be 3–24 characters using letters, numbers, or underscores." }, 400);
  }
  // In a regex literal, use \s to detect whitespace. A doubled backslash here
  // would incorrectly reject normal addresses such as name@gmail.com.
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (password.length < 10 || password.length > 128) {
    return json({ error: "Password must be at least 10 characters and no more than 128." }, 400);
  }

  try {
    await ensureAuthSchema(env.DB);
    const duplicate = await env.DB.prepare("SELECT id FROM users WHERE username_key = ? OR email = ? LIMIT 1")
      .bind(username.toLowerCase(), email).first<{ id: string }>();
    if (duplicate) return json({ error: "That username or email is already registered." }, 409);

    const id = randomToken(16);
    const salt = randomToken(16);
    const passwordHash = await hashPassword(password, salt);
    const createdAt = new Date().toISOString();
    await env.DB.prepare("INSERT INTO users (id, username, username_key, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, username, username.toLowerCase(), email, passwordHash, salt, createdAt).run();
    await grantWelcomeFreeSpins(env.DB, id, new Date(createdAt));
    const token = await createSession(env.DB, id);
    return json({ authenticated: true, user: { id, username, email, createdAt } }, 201, {
      "Set-Cookie": cookie(token, SESSION_MAX_AGE)
    });
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    console.error("[MAXWIN auth/register] Registration failed:", diagnostic);
    return json({
      error: "Registration failed.",
      diagnostic,
      stage: "register-or-create-session"
    }, 500);
  }
};
