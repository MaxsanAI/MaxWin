import { Env, getUser, json } from "./_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ authenticated: false, configured: false }, 503);
  try {
    const user = await getUser(request, env.DB);
    return json(user ? { authenticated: true, user } : { authenticated: false });
  } catch {
    return json({ error: "Could not check the current session." }, 500);
  }
};
