import TrackedStock from "../models/TrackedStock.js";
import StockAlert from "../models/StockAlert.js";
// Registers the "SymbolMapping" model this file's own .populate() call needs.
// Not otherwise used here — this module must not depend on some other file
// (currently the controller) having imported it first.
import "../models/SymbolMapping.js";
import { isMarketOpen, istDateKey } from "../utils/marketHours.js";
import { fetchLivePrices } from "../utils/stockPrices.js";

/**
 * The Bullish Tracker's live-price job (ADR-018) — the first scheduled
 * background behaviour in this codebase. An in-process `setInterval`, not a
 * queue: a missed tick is corrected by the next one 60 seconds later, so
 * there is nothing to retry or recover after a restart.
 *
 * Every tick, all state is re-derived from `TrackedStock` and a fresh quote —
 * nothing is resumed from a prior run.
 */

const TICK_MS = 60 * 1000;

let ticking = false;

/**
 * Applies one fetched price to one stock, per RULES.md FLOW-1/FLOW-2/INV-9/INV-10.
 * Returns the fields to persist, or null if nothing changed.
 */
export const applyPrice = (trackedStock, livePrice, now = new Date()) => {
  const update = { livePrice, lastFetchedAt: now };

  if (livePrice > trackedStock.target) {
    const todayKey = istDateKey(now);
    const alreadyAlertedToday = trackedStock.lastAlertedDate && istDateKey(trackedStock.lastAlertedDate) === todayKey;
    if (!alreadyAlertedToday) {
      update.crossedAt = now;
      update.lastAlertedDate = now;
    }
  }
  // Below target: crossedAt/lastAlertedDate are left untouched (INV-9 — a
  // crossing is one-way, never undone by a later price drop).

  return update;
};

const runTick = async () => {
  if (ticking) return; // previous tick still running — never overlap
  if (!isMarketOpen()) return;

  ticking = true;
  try {
    // Every mapped stock across every Watchlist container, one shared cycle —
    // the same real stock tracked in two containers with two targets still
    // costs one fetch, not two (multiple watchlists, 2026-09-29).
    const stocks = await TrackedStock.find({ symbolMapping: { $ne: null } })
      .populate("symbolMapping", "symbol")
      .lean();
    if (!stocks.length) return;

    const symbols = stocks.map((s) => s.symbolMapping.symbol);
    const prices = await fetchLivePrices(symbols);

    const now = new Date();
    for (const stock of stocks) {
      const livePrice = prices[stock.symbolMapping.symbol];
      if (typeof livePrice !== "number") continue; // fetch failed for this symbol this tick

      const update = applyPrice(stock, livePrice, now);
      await TrackedStock.updateOne({ _id: stock._id }, { $set: update });

      if (update.crossedAt) {
        await StockAlert.create({
          trackedStock: stock._id,
          watchlist: stock.watchlist,
          crossedAt: update.crossedAt,
          priceAtCross: livePrice,
          target: stock.target,
        });
      }
    }
  } catch (error) {
    console.error("stockPriceFetch tick failed:", error);
  } finally {
    ticking = false;
  }
};

/** Starts the per-minute job. Call once, after the server is listening. */
export const startStockPriceFetchJob = () => {
  setInterval(runTick, TICK_MS);
  console.log("✅ Stock price fetch job started (every 60s, NSE market hours only)");
};
