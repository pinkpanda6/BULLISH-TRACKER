import SymbolMapping from "../models/SymbolMapping.js";

/**
 * Scrip Name -> Yahoo Finance ticker matching (ADR-017, revised 2026-09-29).
 *
 * No maintained NSE symbol master list: matching calls Yahoo Finance's own
 * unofficial search endpoint (the same data source module 2 uses for live
 * prices). An exact match after normalization auto-applies first (INV-11);
 * failing that, a fuzzy score against the remaining candidates can still
 * auto-apply above FUZZY_MATCH_THRESHOLD (INV-11a) — anything less, or an
 * ambiguous pair of near-tied candidates, is left for the confirm-mapping
 * screen rather than guessed.
 */

const CORPORATE_SUFFIXES = [
  "LIMITED",
  "LTD",
  "PRIVATE",
  "PVT",
  "COMPANY",
  "CO",
  "INDIA",
  "&",
];

/**
 * Uppercase, strip punctuation, drop common corporate suffix words, collapse
 * whitespace. "ABB Ltd." and "ABB LIMITED" both normalize to "ABB".
 */
export const normalizeName = (name) => {
  if (!name) return "";
  const stripped = String(name)
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !CORPORATE_SUFFIXES.includes(word))
    .join(" ")
    .trim();
  return stripped;
};

/**
 * Parses the sheet's "Likely Trading Low-High" range string, e.g.
 * "       30.60 -        32.20" or "    7,440.80 -     8,092.20", into
 * { low, high }. Returns null if the shape does not match — the caller skips
 * that row rather than guessing at a target price.
 */
export const parseLikelyTradingRange = (rangeStr) => {
  if (!rangeStr) return null;
  const match = String(rangeStr)
    .trim()
    .match(/^([\d,]+(?:\.\d+)?)\s*-\s*([\d,]+(?:\.\d+)?)$/);
  if (!match) return null;
  const low = Number(match[1].replace(/,/g, ""));
  const high = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { low, high };
};

/**
 * Dice's coefficient over character bigrams: 2x shared bigrams / total
 * bigrams, 0..1. Robust to the kind of small differences normalization
 * doesn't catch — a missing/extra word, a typo, a transposed pair — while
 * still scoring two different companies low. Chosen over edit distance
 * because it doesn't over-penalize names of different lengths (e.g. a
 * legitimate abbreviation).
 */
const toBigrams = (str) => {
  const packed = str.replace(/\s+/g, "");
  const grams = [];
  for (let i = 0; i < packed.length - 1; i += 1) grams.push(packed.slice(i, i + 2));
  return grams;
};

export const diceSimilarity = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigramsA = toBigrams(a);
  const bigramsB = toBigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const remaining = new Map();
  for (const gram of bigramsA) remaining.set(gram, (remaining.get(gram) || 0) + 1);

  let shared = 0;
  for (const gram of bigramsB) {
    const count = remaining.get(gram) || 0;
    if (count > 0) {
      shared += 1;
      remaining.set(gram, count - 1);
    }
  }
  return (2 * shared) / (bigramsA.length + bigramsB.length);
};

/**
 * Above this, a fuzzy candidate auto-applies the same as an exact match
 * (INV-11a). Lowered from 0.84 to 0.75 on 2026-09-29 (owner feedback: too
 * much review volume, the suggestions it was already leaving on the review
 * screen were "usually pretty good"). 0.75 is not an arbitrary step down —
 * there's a real danger band, ~0.63-0.67, where same-family-but-different
 * companies collide with genuine near-duplicates (e.g. "ADANI PORTS" vs
 * "ADANI POWER" scores the same ~0.67 as "SUN PHARMA" vs the real "SUN
 * PHARMACEUTICAL"), and no bigram threshold can separate that band safely —
 * going low enough to auto-catch one auto-catches the other. 0.75 stays a
 * clear margin above that band. Below it, still manual review, not a guess.
 */
export const FUZZY_MATCH_THRESHOLD = 0.75;

/**
 * Calls Yahoo Finance's unofficial search/autocomplete endpoint, filtered to
 * NSE equities. Never throws on a network/shape failure — a row that cannot
 * be searched is simply left for manual confirmation, matching the
 * "partial import beats all-or-nothing" philosophy already used for the SEO
 * redirect importer.
 */
export const searchYahooEquities = async (query) => {
  if (!query) return [];
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BullishTracker/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const body = await response.json();
    const quotes = Array.isArray(body?.quotes) ? body.quotes : [];
    return quotes
      .filter((q) => q.exchange === "NSI" && q.quoteType === "EQUITY" && q.symbol)
      .map((q) => ({ symbol: q.symbol, longName: q.longname || q.shortname || q.symbol }));
  } catch (error) {
    console.error("searchYahooEquities failed:", error.message);
    return [];
  }
};

/**
 * Resolves one Scrip Name to a SymbolMapping. Checks the cache first
 * (INV-8); on a miss, searches Yahoo Finance, auto-applying an exact match
 * after normalization (INV-11) or, failing that, the best fuzzy match above
 * FUZZY_MATCH_THRESHOLD (INV-11a) — unless two candidates score too close to
 * call confidently, in which case neither is guessed. Returns null when
 * nothing confident was found — the caller leaves that TrackedStock unmapped
 * for manual review.
 */
export const matchSymbol = async (scripName) => {
  const normalizedName = normalizeName(scripName);
  if (!normalizedName) return null;

  const cached = await SymbolMapping.findOne({ normalizedName });
  if (cached) return cached;

  const candidates = await searchYahooEquities(scripName);
  if (candidates.length === 0) return null;

  let best = candidates.find((c) => normalizeName(c.longName) === normalizedName);

  if (!best) {
    const scored = candidates
      .map((c) => ({ candidate: c, score: diceSimilarity(normalizedName, normalizeName(c.longName)) }))
      .filter((s) => s.score >= FUZZY_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    // Two near-tied candidates means the score can't confidently pick one
    // company over another — leave both for the confirm-mapping screen
    // rather than guess which the owner meant.
    const isAmbiguous = scored.length >= 2 && scored[0].score - scored[1].score < 0.03;
    if (scored.length > 0 && !isAmbiguous) {
      best = scored[0].candidate;
    }
  }

  if (!best) return null;

  return SymbolMapping.create({
    scripName,
    normalizedName,
    symbol: best.symbol,
    longName: best.longName,
    matchedAutomatically: true,
    confirmedBy: null,
  });
};
