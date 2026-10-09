import { Env, getUser, json, readJson } from "../auth/_shared";

type Asset = "SOL" | "TON";

function parseUnits(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const input = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,9})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  try { return BigInt(whole) * 1_000_000_000n + BigInt((fraction + "000000000").slice(0, 9)); }
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
  if (amount === null || amount <= 0n) return json({ error: "Enter a valid amount greater than zero (up to 9 decimal places)." }, 400);
  if (!validAddress(asset, address)) return json({ error: "The destination address format is not valid for the selected network." }, 400);

  // Fail closed until secure key management, signing, broadcasting, and
  // reconciliation are implemented and tested. Never reserve user funds here.
  return json({
    error: "Withdrawals are not enabled yet. No funds have been reserved or sent; secure signing and transaction broadcasting are still being implemented."
  }, 503);
};
