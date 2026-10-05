/**
 * Live price fetching for the price-fetch job (ADR-018). Batches symbols
 * through Yahoo Finance's unofficial `spark` endpoint — unauthenticated,
 * unlike `v7/finance/quote`, but capped at 20 symbols per request (confirmed
 * empirically: 21 symbols returns 400).
 */

const BATCH_SIZE = 20;

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** One batch. Never throws — a failed batch just yields no prices for its symbols. */
const fetchBatch = async (symbols) => {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}&range=1d&interval=1m`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BullishTracker/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return {};
    const body = await response.json();
    const results = Array.isArray(body?.spark?.result) ? body.spark.result : [];
    const prices = {};
    for (const entry of results) {
      const price = entry?.response?.[0]?.meta?.regularMarketPrice;
      if (typeof price === "number") prices[entry.symbol] = price;
    }
    return prices;
  } catch (error) {
    console.error("fetchBatch failed for", symbols.join(","), error.message);
    return {};
  }
};

/**
 * Fetches live prices for every symbol given. Sequential across batches —
 * gentler on an unofficial endpoint than parallel bursts (same rationale as
 * ADR-017's matching calls).
 * @param {string[]} symbols
 * @returns {Promise<Record<string, number>>} symbol -> regularMarketPrice, missing entries mean the fetch failed for that symbol
 */
export const fetchLivePrices = async (symbols) => {
  const prices = {};
  for (const batch of chunk(symbols, BATCH_SIZE)) {
    Object.assign(prices, await fetchBatch(batch));
  }
  return prices;
};
