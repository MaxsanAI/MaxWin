import { Env, ensureWalletSchema, getUser, json, randomToken, readJson } from "../auth/_shared";

type Asset = "SOL" | "TON";
const decimals = 9;

function parseUnits(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const input = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,9})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  try { return BigInt(whole) * 1_000_000_000n + BigInt((fraction + "000000000").slice(0, decimals)); }
  catch { return null; }
}

function validAddress(asset: Asset, address: string): boolean {
  if (asset === "SOL") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return /^(?:EQ|UQ)[A-Za-z0-9_-]{46}$/.test(address);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Wallet service is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Please log in before requesting a withdrawal." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Submit a valid withdrawal request." }, 400);

  const asset = body.asset;
  const amount = parseUnits(body.amount);
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (asset !== "SOL" && asset !== "TON") return json({ error: "Choose SOL or TON." }, 400);
  if (!amount || amount <= 0n) return json({ error: "Enter a valid amount greater than zero (up to 9 decimal places)." }, 400);
  if (!validAddress(asset, address)) return json({ error: "The destination address format is not valid for the selected network." }, 400);
  if (env.WITHDRAWALS_ENABLED !== "true") {
    return json({ error: "Withdrawals are not enabled yet. No funds have been sent. The secure signing service must be configured first." }, 503);
  }

  try {
    await ensureWalletSchema(env.DB);
    const amountText = amount.toString();
    const now = new Date().toISOString();
    const id = randomToken(16);
    const reserve = await env.DB.prepare(
      "UPDATE wallet_balances SET available_units = CAST(available_units AS INTEGER) - ?, reserved_units = CAST(reserved_units AS INTEGER) + ?, updated_at = ? WHERE user_id = ? AND asset = ? AND CAST(available_units AS INTEGER) >= ?"
    ).bind(amountText, amountText, now, user.id, asset, amountText).run();
    if (!reserve.meta || reserve.meta.changes !== 1) {
      return json({ error: "Insufficient available balance. Only confirmed deposits and settled winnings can be withdrawn." }, 409);
    }
    await env.DB.prepare(
      "INSERT INTO withdrawal_requests (id, user_id, asset, amount_units, destination_address, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)"
    ).bind(id, user.id, asset, amountText, address, now, now).run();
    return json({
      accepted: true,
      request: { id, asset, amountUnits: amountText, destinationAddress: address, status: "pending", createdAt: now },
      message: "Withdrawal request recorded. It is not a blockchain transfer; it remains pending until the configured secure signer processes it."
    }, 201);
  } catch (error) {
    console.error("[MAXWIN wallet] Withdrawal request failed:", error);
    return json({ error: "Could not create the withdrawal request." }, 500);
  }
};
