import { Env, ensureWalletSchema, getUser, isAdminTestAccount, json, readJson, randomToken } from "../auth/_shared";
import { getSolUsd } from "../_shared/sol-price";
import { refreshReferralEligibility } from "../referrals/_shared";

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
    usd_target INTEGER,
    sol_usd_at_request REAL,
    status TEXT NOT NULL CHECK (status IN ('pending','confirmed','expired')),
    tx_hash TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  const columns = await db.prepare("PRAGMA table_info(wallet_deposit_requests)").all<{ name: string }>();
  const columnNames = new Set((columns.results || []).map(column => column.name));
  if (!columnNames.has("usd_target")) await db.prepare("ALTER TABLE wallet_deposit_requests ADD COLUMN usd_target INTEGER").run();
  if (!columnNames.has("sol_usd_at_request")) await db.prepare("ALTER TABLE wallet_deposit_requests ADD COLUMN sol_usd_at_request REAL").run();
  if (!columnNames.has("cancelled_at")) await db.prepare("ALTER TABLE wallet_deposit_requests ADD COLUMN cancelled_at TEXT").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_deposit_request_tx_hash ON wallet_deposit_requests(tx_hash) WHERE tx_hash IS NOT NULL").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_wallet_deposit_request_user_status ON wallet_deposit_requests(user_id, status, created_at DESC)").run();
}

async function autoScanDeposits(db: D1Database, destination: string, rpcUrl: string, currentUserId: string): Promise<{ credited: number; currentUserCredited: boolean }> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "maxwin-auto-deposit-scan", method: "getSignaturesForAddress", params: [destination, { limit: 20, commitment: "finalized" }] })
  });
  if (!response.ok) throw new Error("Solana RPC is temporarily unavailable.");
  const signatureData = await response.json() as { result?: Array<{ signature: string; err: unknown; blockTime?: number | null; confirmationStatus?: string }> };
  const signatures = (signatureData.result || []).filter(item => !item.err && item.signature && item.confirmationStatus === "finalized");
  let credited = 0;
  let currentUserCredited = false;

  for (const item of signatures) {
    const alreadyProcessed = await db.prepare("SELECT id FROM wallet_transactions WHERE asset='SOL' AND tx_hash=? LIMIT 1").bind(item.signature).first();
    if (alreadyProcessed) continue;
    const txResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "maxwin-auto-deposit-tx", method: "getTransaction", params: [item.signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }] })
    });
    if (!txResponse.ok) continue;
    const txData = await txResponse.json() as { result?: RpcTransaction | null };
    const tx = txData.result;
    if (!tx?.meta || (tx.meta.err !== null && tx.meta.err !== undefined) || typeof tx.blockTime !== "number") continue;
    const keys = tx.transaction?.message?.accountKeys || [];
    const recipientIndex = keys.findIndex(key => (typeof key === "string" ? key : key.pubkey) === destination);
    if (recipientIndex < 0) continue;
    const pre = tx.meta.preBalances?.[recipientIndex];
    const post = tx.meta.postBalances?.[recipientIndex];
    if (typeof pre !== "number" || typeof post !== "number" || !Number.isSafeInteger(pre) || !Number.isSafeInteger(post)) continue;
    const received = post - pre;
    if (!Number.isSafeInteger(received) || received <= 0) continue;
    const txTime = tx.blockTime * 1000;
    const matches = await db.prepare("SELECT d.id,d.user_id,d.amount_units,d.usd_target,d.sol_usd_at_request,d.created_at,d.expires_at FROM wallet_deposit_requests d WHERE d.amount_units=? AND d.status IN ('pending','expired') AND d.tx_hash IS NULL AND d.created_at<=? AND d.expires_at>=? AND NOT EXISTS (SELECT 1 FROM admin_test_accounts ta WHERE ta.user_id=d.user_id AND ta.enabled=1) ORDER BY d.created_at DESC LIMIT 2")
      .bind(String(received), new Date(txTime + 2000).toISOString(), new Date(txTime - 1000).toISOString()).all<{id:string;user_id:string;amount_units:string;usd_target:number|null;sol_usd_at_request:number|null;created_at:string;expires_at:string}>();
    const candidates = matches.results || [];
    // Shared-address deposits must map to exactly one unique amount/time quote.
    if (candidates.length !== 1) continue;
    const quote = candidates[0];
    const solUsd = quote.sol_usd_at_request && Number.isFinite(quote.sol_usd_at_request) && quote.sol_usd_at_request > 0 ? quote.sol_usd_at_request : (await getSolUsd(db, 10 * 60 * 1000))?.price ?? null;
    if (!solUsd || (received / 1e9) * solUsd + 1e-9 < Number(quote.usd_target || 5)) continue;

    const timestamp = new Date().toISOString();
    const txId = randomToken(16);
    try {
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO wallet_balances (user_id,asset,available_units,reserved_units,updated_at) VALUES (?,'SOL','0','0',?)").bind(quote.user_id, timestamp),
        db.prepare("UPDATE wallet_deposit_requests SET status='confirmed',tx_hash=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('pending','expired') AND tx_hash IS NULL")
          .bind(item.signature, timestamp, quote.id, quote.user_id),
        db.prepare("INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) SELECT ?,?,'SOL','deposit','confirmed',?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wallet_deposit_requests WHERE id=? AND user_id=? AND status='confirmed' AND tx_hash=?)")
          .bind(txId, quote.user_id, String(received), item.signature, destination, item.signature, timestamp, timestamp, JSON.stringify({slot:tx.slot??null,blockTime:tx.blockTime,solUsdAtCredit:solUsd,verification:"automatic-finalized-solana-rpc",depositRequestId:quote.id}), quote.id, quote.user_id, item.signature),
        db.prepare("UPDATE wallet_balances SET available_units=CAST(available_units AS INTEGER)+?,updated_at=? WHERE user_id=? AND asset='SOL' AND EXISTS (SELECT 1 FROM wallet_transactions WHERE id=? AND tx_hash=?)")
          .bind(received, timestamp, quote.user_id, txId, item.signature)
      ]);
      const inserted = await db.prepare("SELECT id FROM wallet_transactions WHERE id=? AND user_id=? AND tx_hash=?").bind(txId, quote.user_id, item.signature).first();
      if (inserted) {
        credited++;
        if (quote.user_id === currentUserId) currentUserCredited = true;
      }
    } catch (error) {
      const duplicate = await db.prepare("SELECT id FROM wallet_transactions WHERE asset='SOL' AND tx_hash=? LIMIT 1").bind(item.signature).first();
      if (!duplicate) console.error("[MAXWIN auto-deposit] Could not credit verified transaction:", error instanceof Error ? error.message : String(error));
    }
  }
  if (credited > 0) await refreshReferralEligibility(db);
  return {credited,currentUserCredited};
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

    if (body.action !== "autoScan" && await isAdminTestAccount(env.DB, user.id)) {
      return json({ error: "This account is in simulated real-play mode. Real deposits are disabled for test accounts." }, 403);
    }

    if (body.action === "autoScan") {
      const scan = await autoScanDeposits(env.DB, destination, env.SOLANA_RPC_URL?.trim() || "https://solana-rpc.publicnode.com", user.id);
      return json({ok:true,...scan,message:scan.currentUserCredited?"Deposit automatically verified and credited to your SOL wallet.": "Checking finalized Solana transactions for your deposit."});
    }

    if (body.action === "cancel") {
      const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
      if (!requestId || !/^[a-f0-9]{32}$/.test(requestId)) return json({ error: "Deposit request not found. Refresh the deposit panel." }, 400);
      const current = await env.DB.prepare(
        "SELECT id, status, tx_hash, expires_at FROM wallet_deposit_requests WHERE id=? AND user_id=? LIMIT 1"
      ).bind(requestId, user.id).first<{id:string;status:string;tx_hash:string|null;expires_at:string}>();
      if (!current || current.tx_hash || (current.status !== "pending" && current.status !== "expired")) {
        return json({ error: "This quote cannot be changed because it has already been used or confirmed." }, 409);
      }
      await env.DB.prepare(
        "UPDATE wallet_deposit_requests SET status='expired', cancelled_at=?, updated_at=? WHERE id=? AND user_id=? AND tx_hash IS NULL AND status='pending'"
      ).bind(new Date().toISOString(), new Date().toISOString(), requestId, user.id).run();
      return json({ok:true, message:"Deposit quote closed. A new amount can now be selected."});
    }

    if (body.action === "create") {
      const usd = Number(body.usd);
      if (!Number.isInteger(usd) || usd < 5 || usd > 30 || usd % 5 !== 0) {
        return json({ error: "Choose a deposit amount from $5 to $30 in $5 increments." }, 400);
      }
      const solUsd = (await getSolUsd(env.DB, 5 * 60 * 1000))?.price ?? null;
      if (!solUsd) return json({ error: "SOL/USD price sources are temporarily unavailable and no recent safe quote is cached. No deposit request was created." }, 503);
      const random = new Uint16Array(1);
      crypto.getRandomValues(random);
      const uniqueOffset = (random[0] % 900) + 100;
      const amountUnits = String(Math.ceil((usd / solUsd) * 1e9) + uniqueOffset);
      const now = new Date();
      const expires = new Date(now.getTime() + 3 * 60 * 1000);
      const id = randomToken(16);
      await env.DB.prepare("UPDATE wallet_deposit_requests SET status='expired', updated_at=? WHERE user_id=? AND status='pending'").bind(now.toISOString(), user.id).run();
      await env.DB.prepare("INSERT INTO wallet_deposit_requests (id,user_id,asset,amount_units,usd_target,sol_usd_at_request,status,tx_hash,expires_at,created_at,updated_at) VALUES (?,?,'SOL',?,?,?,'pending',NULL,?,?,?)")
        .bind(id, user.id, amountUnits, usd, solUsd, expires.toISOString(), now.toISOString(), now.toISOString()).run();
      return json({
        ok: true,
        request: { id, asset: "SOL", amountUnits, amountSol: (Number(amountUnits) / 1e9).toFixed(9), usdTarget: usd, solUsd, expiresAt: expires.toISOString() },
        message: "Deposit request created. Send the exact SOL amount shown before it expires."
      }, 201);
    }

    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (!requestId || !/^[a-f0-9]{32}$/.test(requestId)) return json({ error: "Create a deposit request first." }, 400);
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return json({ error: "Paste the transaction signature from Solflare." }, 400);

    const now = new Date();
    const depositRequest = await env.DB.prepare("SELECT id, amount_units, usd_target, sol_usd_at_request, status, tx_hash, expires_at, created_at FROM wallet_deposit_requests WHERE id=? AND user_id=? LIMIT 1")
      .bind(requestId, user.id).first<{ id: string; amount_units: string; usd_target: number | null; sol_usd_at_request: number | null; status: string; tx_hash: string | null; expires_at: string; created_at: string }>();
    if (!depositRequest) return json({ error: "Deposit request not found for this account. Create a new request." }, 404);
    if ((depositRequest.status !== "pending" && depositRequest.status !== "expired") || depositRequest.tx_hash) {
      return json({ error: "This deposit request has already been used. Create a new request if needed." }, 409);
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
    if (typeof tx.blockTime !== "number" || !Number.isFinite(tx.blockTime)) {
      return json({ error: "Solana did not provide a reliable transaction timestamp. No balance was changed." }, 400);
    }
    const transactionTime = tx.blockTime * 1000;
    const requestCreatedAt = Date.parse(depositRequest.created_at);
    const requestExpiresAt = Date.parse(depositRequest.expires_at);
    if (transactionTime < requestCreatedAt - 2000) {
      return json({ error: "This transaction predates the deposit request. No balance was changed." }, 400);
    }
    if (transactionTime > requestExpiresAt + 1000) {
      return json({ error: "The transaction was sent after the deposit quote expired. No balance was changed." }, 400);
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

    const quoteAtRequest = depositRequest.sol_usd_at_request;
    const solUsd = quoteAtRequest && Number.isFinite(quoteAtRequest) && quoteAtRequest > 0 ? quoteAtRequest : (await getSolUsd(env.DB, 10 * 60 * 1000))?.price ?? null;
    const minimumUsd = Number(depositRequest.usd_target || 5);
    if (!solUsd || (receivedLamports / 1e9) * solUsd + 1e-9 < minimumUsd) {
      return json({ error: "The received amount does not meet the USD value of this deposit request. No balance was changed." }, 400);
    }

    const timestamp = now.toISOString();
    const txId = randomToken(16);
    const amountUnits = String(receivedLamports);
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO wallet_balances (user_id, asset, available_units, reserved_units, updated_at) VALUES (?, 'SOL', '0', '0', ?)").bind(user.id, timestamp),
        env.DB.prepare("UPDATE wallet_deposit_requests SET status='confirmed', tx_hash=?, updated_at=? WHERE id=? AND user_id=? AND status IN ('pending','expired') AND tx_hash IS NULL")
          .bind(signature, timestamp, requestId, user.id),
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
    await refreshReferralEligibility(env.DB);
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


export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Wallet service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in to recover your deposit request." }, 401);
  try {
    await ensureWalletSchema(env.DB);
    await ensureDepositSchema(env.DB);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE wallet_deposit_requests SET status='expired', updated_at=? WHERE user_id=? AND status='pending' AND expires_at<=? AND tx_hash IS NULL")
      .bind(now, user.id, now).run();
    const row = await env.DB.prepare(
      "SELECT id, amount_units, usd_target, expires_at FROM wallet_deposit_requests WHERE user_id = ? AND tx_hash IS NULL AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 1"
    ).bind(user.id, now).first<{ id: string; amount_units: string; usd_target: number | null; expires_at: string }>();
    return json({
      ok: true,
      request: row ? {
        id: row.id,
        amountSol: (Number(row.amount_units) / 1e9).toFixed(9),
        usdTarget: Number(row.usd_target || 5),
        expiresAt: row.expires_at
      } : null
    });
  } catch (error) {
    console.error("[MAXWIN deposit] Request recovery failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not recover the latest deposit request." }, 500);
  }
};
