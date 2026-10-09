import { createSession, cookie, Env, ensureAuthSchema, hashPassword, json, readJson, SESSION_MAX_AGE } from "./_shared";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Account service is not configured yet.", diagnostic: "D1 binding env.DB is missing." }, 503);
  const body = await readJson(request);
  if (!body) return json({ error: "Please enter your email and password." }, 400);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || password.length > 128) return json({ error: "Email or password is incorrect." }, 401);

  try {
    await ensureAuthSchema(env.DB);
    const user = await env.DB.prepare("SELECT id, username, email, password_hash, password_salt, created_at AS createdAt FROM users WHERE email = ? LIMIT 1")
      .bind(email).first<{ id: string; username: string; email: string; password_hash: string; password_salt: string; createdAt: string }>();
    if (!user) return json({ error: "Email or password is incorrect." }, 401);
    const candidate = await hashPassword(password, user.password_salt);
    if (candidate !== user.password_hash) return json({ error: "Email or password is incorrect." }, 401);
    const token = await createSession(env.DB, user.id);
    return json({ authenticated: true, user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt } }, 200, {
      "Set-Cookie": cookie(token, SESSION_MAX_AGE)
    });
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    console.error("[MAXWIN auth/login] Login failed:", diagnostic);
    return json({
      error: "Login failed.",
      diagnostic,
      stage: "login-or-create-session"
    }, 500);
  }
};
