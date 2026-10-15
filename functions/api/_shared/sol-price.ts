export type SolUsdQuote = { price: number; source: string; updatedAt: string; stale: boolean };

type PriceProvider = {
  source: string;
  url: string;
  extract: (data: any) => unknown;
};

const PROVIDERS: PriceProvider[] = [
  {
    source: "CoinGecko",
    url: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    extract: data => data?.solana?.usd
  },
  {
    source: "Binance",
    url: "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
    extract: data => data?.price
  },
  {
    source: "Kraken",
    url: "https://api.kraken.com/0/public/Ticker?pair=SOLUSD",
    extract: data => {
      const result = data?.result;
      if (!result || typeof result !== "object") return null;
      const pair = Object.values(result)[0] as { c?: unknown[] } | undefined;
      return pair?.c?.[0];
    }
  },
  {
    source: "Coinbase",
    url: "https://api.exchange.coinbase.com/products/SOL-USD/ticker",
    extract: data => data?.price
  }
];

async function ensureQuoteSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS sol_usd_price_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    price REAL NOT NULL,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

async function fetchProvider(provider: PriceProvider): Promise<{ price: number; source: string } | null> {
  try {
    const response = await fetch(provider.url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(1800),
      cf: { cacheTtl: 15, cacheEverything: true }
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const value = provider.extract(data);
    const price = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(price) || price <= 0 || price > 10000) return null;
    return { price, source: provider.source };
  } catch {
    return null;
  }
}

/**
 * Shared, persistent SOL/USD quote for all wallet/game endpoints.
 * A recently cached quote keeps balance display alive during provider outages;
 * money-moving actions pass a much shorter maxStaleMs to avoid using old prices.
 */
export async function getSolUsd(db: D1Database, maxStaleMs = 120_000): Promise<SolUsdQuote | null> {
  await ensureQuoteSchema(db);
  const now = Date.now();
  const cached = await db.prepare("SELECT price, source, updated_at AS updatedAt FROM sol_usd_price_cache WHERE id=1 LIMIT 1")
    .first<{ price: number; source: string; updatedAt: string }>();

  const cachedTime = cached ? Date.parse(cached.updatedAt) : NaN;
  const cachedAge = Number.isFinite(cachedTime) ? Math.max(0, now - cachedTime) : Number.POSITIVE_INFINITY;
  if (cached && cachedAge <= 15_000 && Number.isFinite(cached.price) && cached.price > 0) {
    return { price: cached.price, source: cached.source, updatedAt: cached.updatedAt, stale: false };
  }

  const fresh = await Promise.any(PROVIDERS.map(async provider => {
    const quote = await fetchProvider(provider);
    if (!quote) throw new Error("Provider unavailable");
    return quote;
  })).catch(() => null);

  if (fresh) {
    const updatedAt = new Date().toISOString();
    await db.prepare("INSERT INTO sol_usd_price_cache (id,price,source,updated_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET price=excluded.price,source=excluded.source,updated_at=excluded.updated_at")
      .bind(fresh.price, fresh.source, updatedAt).run();
    return { ...fresh, updatedAt, stale: false };
  }

  if (cached && Number.isFinite(cached.price) && cached.price > 0 && cachedAge <= maxStaleMs) {
    return { price: cached.price, source: cached.source, updatedAt: cached.updatedAt, stale: true };
  }
  return null;
}
