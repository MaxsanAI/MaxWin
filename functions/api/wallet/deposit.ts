import { Env, ensureWalletSchema, getUser, json, readJson, randomToken } from "../auth/_shared";

type RpcTransaction = {
  slot?: number;
  blockTime?: number | null;
  meta?: { err?: unknown; preBalances?: number[]; postBalances?: number[] } | null;
  transaction?: { message?: { accountKeys?: Array<string | { pubkey?: string }> } };
};

async function ensureDepositSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS wallet_deposit_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    asset TEXT NOT NULL DEFAULT 'SOL' CHECK (asset = 'SOL'),
    amount_units TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','confirmed','expired')),
    tx_hash TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_deposit_request_tx_hash ON wallet_deposit_requests(tx_hash) WHERE tx_hash IS NOT NULL").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_wallet_deposit_request_user_status ON wallet_deposit_requests(user_id, status, created_at DESC)").run();
}

async function fetchValidPrice(url: string, extract: (data: any) => unknown): Promise<number | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 20, cacheEverything: true }
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const value = extract(data);
    const price = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function getSolUsd(): Promise<number | null> {
  const providers: Array<{ url: string; extract: (data: any) => unknown }> = [
    {
      url: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      extract: data => data?.solana?.usd
    },
    {
      url: "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
      extract: data => data?.price
    },
    {
      url: "https://api.kraken.com/0/public/Ticker?pair=SOLUSD",
      extract: data => {
        const result = data?.result;
        if (!result || typeof result !== "object") return null;
        const pair = Object.values(result)[0] as { c?: unknown[] } | undefined;
        return pair?.c?.[0];
      }
    }
  ];
  for (const provider of providers) {
    const price = await fetchValidPrice(provider.url, provider.extract);
    if (price !== null) return price;
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Wallet service is not configured. Check the D1 binding named DB." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in before creating or verifying a deposit." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Submit a valid deposit request." }, 400);

  const destination = env.SOL_DEPOSIT_ADDRESS?.trim();
  if (!destination) return json({ error: "SOL_DEPOSIT_ADDRESS is missing in Cloudflare Pages Variables." }, 503);

  try {
    await ensureWalletSchema(env.DB);
    await ensureDepositSchema(env.DB);

    if (body.action === "create") {
      const usd = Number(body.usd);
      if (!Number.isInteger(usd) || usd < 5 || usd > 30 || usd % 5 !== 0) {
        return json({ error: "Choose a deposit amount from $5 to $30 in $5 increments." }, 400);
      }
      const solUsd = await getSolUsd();
      if (!solUsd) return json({ error: "Live SOL/USD rate is unavailable. No deposit request was created." }, 503);
      const random = new Uint16Array(1);
      crypto.getRandomValues(random);
      const uniqueOffset = (random[0] % 900) + 100;
      const amountUnits = String(Math.ceil((usd / solUsd) * 1e9) + uniqueOffset);
      const now = new Date();
      const expires = new Date(now.getTime() + 3 * 60 * 1000);
      const id = randomToken(16);
      await env.DB.prepare("UPDATE wallet_deposit_requests SET status='expired', updated_at=? WHERE user_id=? AND status='pending'").bind(now.toISOString(), user.id).run();
      await env.DB.prepare("INSERT INTO wallet_deposit_requests (id,user_id,asset,amount_units,status,tx_hash,expires_at,created_at,updated_at) VALUES (?,?,'SOL',?,'pending',NULL,?,?,?)")
        .bind(id, user.id, amountUnits, expires.toISOString(), now.toISOString(), now.toISOString()).run();
      return json({
        ok: true,
        request: { id, asset: "SOL", amountUnits, amountSol: (Number(amountUnits) / 1e9).toFixed(9), usdTarget: usd, solUsd, expiresAt: expires.toISOString() },
        message: "Deposit request created. Send the exact SOL amount shown before it expires."
      }, 201);
    }

    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (!requestId || !/^[a-f0-9]{32}$/.test(requestId)) return json({ error: "Create a deposit request first." }, 400);
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)) return json({ error: "Paste the transaction signature from Solflare." }, 400);

    const now = new Date();
    const depositRequest = await env.DB.prepare("SELECT id, amount_units, status, expires_at, created_at FROM wallet_deposit_requests WHERE id=? AND user_id=? LIMIT 1")
      .bind(requestId, user.id).first<{ id: string; amount_units: string; status: string; expires_at: string; created_at: string }>();
    if (!depositRequest) return json({ error: "Deposit request not found for this account. Create a new request." }, 404);
    if (depositRequest.status !== "pending") return json({ error: "This deposit request is no longer pending. Create a new request if needed." }, 409);
    if (Date.parse(depositRequest.expires_at) <= now.getTime()) {
      await env.DB.prepare("UPDATE wallet_deposit_requests SET status='expired', updated_at=? WHERE id=? AND status='pending'").bind(now.toISOString(), requestId).run();
      return json({ error: "This deposit request expired. Create a new one before sending SOL." }, 410);
    }

    const rpcUrl = env.SOLANA_RPC_URL?.trim() || "https://solana-rpc.publicnode.com";
    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "maxwin-deposit-verify", method: "getTransaction", params: [signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }] })
    });
    if (!rpcResponse.ok) return json({ error: "Solana RPC is temporarily unavailable. Try again shortly." }, 503);
    const rpc = await rpcResponse.json() as { result?: RpcTransaction | null; error?: { message?: string } };
    if (rpc.error) {
      console.error("[MAXWIN deposit] RPC error:", rpc.error.message || "unknown");
      return json({ error: "Could not verify this transaction with Solana RPC." }, 502);
    }
    const tx = rpc.result;
    if (!tx) return json({ error: "Transaction not found yet. Wait for Solana final confirmation and try again." }, 404);
    if (!tx.meta || tx.meta.err !== null && tx.meta.err !== undefined) return json({ error: "This Solana transaction failed or has no execution metadata." }, 400);
    if (typeof tx.blockTime !== "number" || tx.blockTime * 1000 < Date.parse(depositRequest.created_at) - 120000) {
      return json({ error: "This transaction predates the deposit request. Create a new request and send the exact amount shown." }, 400);
    }

    const keys = tx.transaction?.message?.accountKeys || [];
    const recipientIndex = keys.findIndex(key => (typeof key === "string" ? key : key.pubkey) === destination);
    if (recipientIndex < 0) return json({ error: "This transaction did not include your configured MAXWIN deposit address." }, 400);
    const pre = tx.meta.preBalances?.[recipientIndex];
    const post = tx.meta.postBalances?.[recipientIndex];
    if (typeof pre !== "number" || typeof post !== "number" || !Number.isSafeInteger(pre) || !Number.isSafeInteger(post)) {
      return json({ error: "Could not safely read the destination balance change." }, 400);
    }
    const receivedLamports = post - pre;
    if (!Number.isSafeInteger(receivedLamports) || receivedLamports <= 0) return json({ error: "This transaction did not add SOL to the configured deposit address." }, 400);
    if (String(receivedLamports) !== depositRequest.amount_units) {
      return json({ error: "The received SOL amount does not exactly match this deposit request. No balance was changed." }, 400);
    }

    const solUsd = await getSolUsd();
    if (!solUsd || (receivedLamports / 1e9) * solUsd < 5) return json({ error: "Could not validate the current $5 minimum deposit. No balance was changed." }, 503);

    const timestamp = now.toISOString();
    const txId = randomToken(16);
    const amountUnits = String(receivedLamports);
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO wallet_balances (user_id, asset, available_units, reserved_units, updated_at) VALUES (?, 'SOL', '0', '0', ?)").bind(user.id, timestamp),
        env.DB.prepare("UPDATE wallet_deposit_requests SET status='confirmed', tx_hash=?, updated_at=? WHERE id=? AND user_id=? AND status='pending' AND expires_at>?")
          .bind(signature, timestamp, requestId, user.id, timestamp),
        env.DB.prepare("INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) SELECT ?,?,'SOL','deposit','confirmed',?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wallet_deposit_requests WHERE id=? AND user_id=? AND status='confirmed' AND tx_hash=?)")
          .bind(txId, user.id, amountUnits, signature, destination, signature, timestamp, timestamp, JSON.stringify({ slot: tx.slot ?? null, blockTime: tx.blockTime, solUsdAtCredit: solUsd, verification: "finalized-solana-rpc", depositRequestId: requestId }), requestId, user.id, signature),
        env.DB.prepare("UPDATE wallet_balances SET available_units=CAST(available_units AS INTEGER)+?, updated_at=? WHERE user_id=? AND asset='SOL' AND EXISTS (SELECT 1 FROM wallet_transactions WHERE id=? AND tx_hash=?)")
          .bind(receivedLamports, timestamp, user.id, txId, signature)
      ]);
    } catch (error) {
      const duplicate = await env.DB.prepare("SELECT user_id FROM wallet_transactions WHERE asset='SOL' AND tx_hash=? LIMIT 1").bind(signature).first<{ user_id: string }>();
      if (duplicate) return json({ error: "This transaction has already been processed and cannot be credited twice." }, 409);
      throw error;
    }

    const credited = await env.DB.prepare("SELECT id FROM wallet_transactions WHERE id=? AND user_id=? AND tx_hash=?").bind(txId, user.id, signature).first();
    if (!credited) return json({ error: "This deposit request was already used or expired. Refresh the wallet and check transaction history." }, 409);
    return json({
      ok: true,
      credited: { asset: "SOL", amount: (receivedLamports / 1e9).toFixed(9), amountUnits, status: "confirmed" },
      message: "Finalized Solana transaction verified and credited. Refresh your wallet to see the updated balance."
    }, 201);
  } catch (error) {
    console.error("[MAXWIN deposit] Verification failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not verify and credit this deposit. Check the transaction in Solscan and retry." }, 500);
  }
};
