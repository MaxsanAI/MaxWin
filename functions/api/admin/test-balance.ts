import { Env, ensureWalletSchema, json, readJson, randomToken } from "../auth/_shared";

async function authorize(request: Request, env: Env): Promise<boolean> {
  const expected = env.MAXWIN_ADMIN_KEY || "";
  const supplied = request.headers.get("X-MAXWIN-ADMIN-KEY") || "";
  if (!expected || expected.length !== supplied.length) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(supplied);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function getSolUsd(): Promise<number | null> {
  const providers = [
    { url: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", get: (data: any) => data?.solana?.usd },
    { url: "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT", get: (data: any) => data?.price }
  ];
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(1500), cf: { cacheTtl: 60, cacheEverything: true } });
      if (!response.ok) continue;
      const data: any = await response.json();
      const price = Number(provider.get(data));
      if (Number.isFinite(price) && price > 0) return price;
    } catch { /* try next quote source */ }
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Admin test balance database is not configured." }, 503);
  if (!await authorize(request, env)) return json({ error: env.MAXWIN_ADMIN_KEY ? "Unauthorized admin access." : "Set MAXWIN_ADMIN_KEY as a Cloudflare secret." }, 401);
  const body = await readJson(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const amountUsd = Number(body?.amountUsd);
  if (!username || username.length > 32) return json({ error: "Enter the exact username of your test account." }, 400);
  if (!Number.isFinite(amountUsd) || amountUsd < 1 || amountUsd > 10000 || Math.round(amountUsd * 100) !== amountUsd * 100) {
    return json({ error: "Enter a test credit from $1.00 to $10,000.00, with up to 2 decimal places." }, 400);
  }

  try {
    await ensureWalletSchema(env.DB);
    const user = await env.DB.prepare("SELECT id, username FROM users WHERE username_key=? OR lower(username)=lower(?) LIMIT 1")
      .bind(username.toLowerCase(), username).first<{ id: string; username: string }>();
    if (!user) return json({ error: "No registered user was found with that username." }, 404);
    const solUsd = await getSolUsd();
    if (!solUsd) return json({ error: "Could not get the live SOL/USD rate. No test credit was added." }, 503);
    const lamportsNumber = Math.floor((amountUsd / solUsd) * 1_000_000_000);
    if (!Number.isSafeInteger(lamportsNumber) || lamportsNumber <= 0) return json({ error: "This amount cannot be converted safely to SOL units." }, 400);
    const credit = BigInt(lamportsNumber);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO admin_test_accounts (user_id,enabled,created_at,updated_at) VALUES (?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at")
      .bind(user.id, now, now).run();
    await env.DB.prepare("INSERT OR IGNORE INTO wallet_balances (user_id,asset,available_units,reserved_units,updated_at) VALUES (?,'SOL','0','0',?)")
      .bind(user.id, now).run();
    const wallet = await env.DB.prepare("SELECT available_units,reserved_units FROM wallet_balances WHERE user_id=? AND asset='SOL' LIMIT 1")
      .bind(user.id).first<{ available_units: string; reserved_units: string }>();
    if (!wallet) return json({ error: "Could not initialize the user's SOL wallet." }, 500);
    const previous = BigInt(wallet.available_units || "0");
    const next = previous + credit;
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) return json({ error: "This test credit would exceed the safe wallet limit." }, 400);
    const transactionId = randomToken(16);
    const metadata = JSON.stringify({ simulatedRealMoney: true, adminIssued: true, amountUsd, solUsdAtCredit: solUsd, cashoutDisabled: true });
    const updated = await env.DB.prepare("UPDATE wallet_balances SET available_units=?,updated_at=? WHERE user_id=? AND asset='SOL' AND available_units=? AND reserved_units=?")
      .bind(next.toString(), now, user.id, wallet.available_units, wallet.reserved_units).run();
    if (!updated.meta || updated.meta.changes !== 1) return json({ error: "Wallet changed while adding test credits. Refresh and try again." }, 409);
    try {
      await env.DB.prepare("INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) VALUES (?,?,'SOL','adjustment','confirmed',?,NULL,NULL,?,?,?,?)")
        .bind(transactionId, user.id, credit.toString(), "admin-test-credit:" + transactionId, now, now, metadata).run();
    } catch (error) {
      await env.DB.prepare("UPDATE wallet_balances SET available_units=?,updated_at=? WHERE user_id=? AND asset='SOL' AND available_units=?")
        .bind(previous.toString(), now, user.id, next.toString()).run();
      throw error;
    }
    return json({ ok: true, username: user.username, amountUsd, addedSol: Number(credit) / 1e9, balanceUsdEstimate: (Number(next) / 1e9) * solUsd, simulated: true, cashoutDisabled: true, message: "Simulated balance added. This account is locked to test-only play; deposits and withdrawals are disabled." }, 201);
  } catch (error) {
    console.error("[MAXWIN admin test balance] Failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not add the simulated balance." }, 500);
  }
};
