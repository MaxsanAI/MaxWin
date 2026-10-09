import { clearCookie, Env, json, SESSION_COOKIE, sha256 } from "./_shared";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rawCookie = request.headers.get("Cookie") || "";
  const match = rawCookie.match(new RegExp("(?:^|;\\s*)" + SESSION_COOKIE + "=([a-f0-9]{64})(?:;|$)"));
  if (match && env.DB) {
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(match[1])).run();
    } catch {
      // The browser cookie is still cleared even if the session row cannot be removed.
    }
  }
  return json({ authenticated: false }, 200, { "Set-Cookie": clearCookie() });
};
