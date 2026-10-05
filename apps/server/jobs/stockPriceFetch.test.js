import assert from "node:assert/strict";
import { applyPrice } from "./stockPriceFetch.js";

const NOW = new Date("2026-09-28T07:00:00Z"); // Monday, market hours IST
const YESTERDAY = new Date("2026-09-27T07:00:00Z");
const EARLIER_TODAY = new Date("2026-09-28T04:00:00Z");

// Below target: livePrice/lastFetchedAt update, nothing else (FLOW-1: stays on Watchlist).
{
  const update = applyPrice({ target: 100, lastAlertedDate: null }, 95, NOW);
  assert.deepEqual(update, { livePrice: 95, lastFetchedAt: NOW });
}

// First-ever crossing: crossedAt and lastAlertedDate both set (FLOW-2).
{
  const update = applyPrice({ target: 100, lastAlertedDate: null }, 105, NOW);
  assert.equal(update.livePrice, 105);
  assert.equal(update.crossedAt, NOW);
  assert.equal(update.lastAlertedDate, NOW);
}

// Already crossed earlier the same IST day: no second alert (INV-10).
{
  const update = applyPrice({ target: 100, lastAlertedDate: EARLIER_TODAY }, 110, NOW);
  assert.equal(update.crossedAt, undefined, "no new crossedAt — already alerted today");
  assert.equal(update.lastAlertedDate, undefined);
  assert.equal(update.livePrice, 110, "price still updates every tick regardless");
}

// Crossed again on a later day: fires again, crossedAt moves forward (FLOW-2, INV-9 — one-way, but re-crossable on a new day).
{
  const update = applyPrice({ target: 100, lastAlertedDate: YESTERDAY }, 108, NOW);
  assert.equal(update.crossedAt, NOW);
  assert.equal(update.lastAlertedDate, NOW);
}

console.log("stockPriceFetch: all checks passed");
