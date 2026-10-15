import { Env, ensureWalletSchema, getUser, json, readJson, randomToken } from "../auth/_shared";

type RpcTransaction = {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
  } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean; writable?: boolean }>;
    };
  };
};

async function getSolUsd(): Promise<number | null> {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: true }
    });
    if (!response.ok) return null;
    const data = await response.json() as { solana?: { usd?: number } };
    const rate = data.solana?.usd;
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Wallet service is not configured. Check the D1 binding named DB." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in before verifying a deposit." }, 401);

  const body = await readJson(request);
  const signature = typeof body?.signature === "string" ? body.signature.trim() : "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)) {
    return json({ error: "Enter the transaction signature from your Solflare transaction details." }, 400);
  }

  const destination = env.SOL_DEPOSIT_ADDRESS?.trim();
  if (!destination) return json({ error: "SOL_DEPOSIT_ADDRESS is missing in Cloudflare Pages Variables." }, 503);

  try {
    await ensureWalletSchema(env.DB);
    const rpcUrl = env.SOLANA_RPC_URL?.trim() || "https://solana-rpc.publicnode.com";
    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "maxwin-deposit-verify",
        method: "getTransaction",
        params: [signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
      })
    });
    if (!rpcResponse.ok) return json({ error: "Solana RPC is temporarily unavailable. Try again shortly." }, 503);
    const rpc = await rpcResponse.json() as { result?: RpcTransaction | null; error?: { message?: string } };
    if (rpc.error) {
      console.error("[MAXWIN deposit] RPC error:", rpc.error.message || "unknown");
      return json({ error: "Could not verify this transaction with Solana RPC." }, 502);
    }
    const tx = rpc.result;
    if (!tx) return json({ error: "Transaction not found yet. Check the signature and wait for final confirmation." }, 404);
    if (!tx.meta || tx.meta.err !== null && tx.meta.err !== undefined) {
      return json({ error: "This Solana transaction failed or has no execution metadata." }, 400);
    }

    const keys = tx.transaction?.message?.accountKeys || [];
    const recipientIndex = keys.findIndex(key => (typeof key === "string" ? key : key.pubkey) === destination);
    if (recipientIndex < 0) return json({ error: "This transaction did not include your configured MAXWIN deposit address." }, 400);
    const pre = tx.meta.preBalances?.[recipientIndex];
    const post = tx.meta.postBalances?.[recipientIndex];
    if (typeof pre !== "number" || typeof post !== "number" || !Number.isSafeInteger(pre) || !Number.isSafeInteger(post)) {
      return json({ error: "Could not safely read the destination balance change from this transaction." }, 400);
    }
    const receivedLamports = post - pre;
    if (!Number.isSafeInteger(receivedLamports) || receivedLamports <= 0) {
      return json({ error: "This transaction did not add SOL to the configured deposit address." }, 400);
    }

    const solUsd = await getSolUsd();
    if (!solUsd) return json({ error: "Live SOL/USD rate is unavailable; no balance was changed. Try again later." }, 503);
    if ((receivedLamports / 1e9) * solUsd < 5) {
      return json({ error: "The verified transfer is below the current $5 minimum deposit. No balance was changed." }, 400);
    }

    const now = new Date().toISOString();
    const txId = randomToken(16);
    const amountUnits = String(receivedLamports);
    const statements = [
      env.DB.prepare("INSERT OR IGNORE INTO wallet_balances (user_id, asset, available_units, reserved_units, updated_at) VALUES (?, 'SOL', '0', '0', ?)").bind(user.id, now),
      env.DB.prepare("INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) VALUES (?,?,'SOL','deposit','confirmed',?,?,?, ?,?,?,?)")
        .bind(txId, user.id, amountUnits, signature, destination, signature, now, now, JSON.stringify({ slot: tx.slot ?? null, blockTime: tx.blockTime ?? null, solUsdAtCredit: solUsd, verification: "finalized-solana-rpc" })),
      env.DB.prepare("UPDATE wallet_balances SET available_units = CAST(available_units AS INTEGER) + ?, updated_at = ? WHERE user_id = ? AND asset = 'SOL'")
        .bind(receivedLamports, now, user.id)
    ];
    try {
      await env.DB.batch(statements);
    } catch (error) {
      const duplicate = await env.DB.prepare("SELECT id, user_id FROM wallet_transactions WHERE asset='SOL' AND tx_hash=? LIMIT 1").bind(signature).first<{ id: string; user_id: string }>();
      if (duplicate) return json({ error: duplicate.user_id === user.id ? "This transaction has already been credited to your wallet." : "This transaction has already been claimed and cannot be credited again." }, 409);
      throw error;
    }

    return json({
      ok: true,
      credited: { asset: "SOL", amount: (receivedLamports / 1e9).toFixed(9), amountUnits, status: "confirmed" },
      message: "Finalized Solana transaction verified and credited. Refresh your wallet to see the updated balance."
    }, 201);
  } catch (error) {
    console.error("[MAXWIN deposit] Verification failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not verify and credit this deposit. No success was reported; please retry or check the transaction in Solscan." }, 500);
  }
};
