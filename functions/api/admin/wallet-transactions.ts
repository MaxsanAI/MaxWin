import { Env, ensureWalletSchema, json, readJson } from "../auth/_shared";

async function authorize(request: Request, env: Env): Promise<boolean> {
  const expected = env.MAXWIN_ADMIN_KEY || "";
  const supplied = request.headers.get("X-MAXWIN-ADMIN-KEY") || "";
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(supplied);
  if (!expected || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Wallet transaction administration is not configured." }, 503);
  if (!await authorize(request, env)) return json({ error: "Unauthorized admin access." }, 401);

  const body = await readJson(request);
  const ids = Array.isArray(body?.transactionIds)
    ? [...new Set(body.transactionIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 128))]
    : [];
  if (!ids.length || ids.length > 30) return json({ error: "Select between 1 and 30 wallet transactions." }, 400);

  try {
    await ensureWalletSchema(env.DB);
    const statements = ids.map(id =>
      env.DB.prepare("DELETE FROM wallet_transactions WHERE id = ?").bind(id)
    );
    const results = await env.DB.batch(statements);
    const deletedCount = results.reduce((total, result) => total + Number(result.meta?.changes || 0), 0);
    return json({
      ok: true,
      deletedCount,
      message: `${deletedCount} transaction(s) permanently deleted from the wallet transaction records.`
    });
  } catch (error) {
    console.error("[MAXWIN admin transaction deletion] Failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not permanently delete selected wallet transactions." }, 500);
  }
};
