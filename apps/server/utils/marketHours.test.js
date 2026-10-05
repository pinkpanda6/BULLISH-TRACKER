import assert from "node:assert/strict";
import { isMarketOpen, istDateKey } from "./marketHours.js";

// Monday 2026-09-28, boundaries around 9:15-15:30 IST (= 03:45-10:00 UTC).
assert.equal(isMarketOpen(new Date("2026-09-28T03:45:00Z")), true, "9:15 IST is open (inclusive)");
assert.equal(isMarketOpen(new Date("2026-09-28T03:44:00Z")), false, "9:14 IST is not yet open");
assert.equal(isMarketOpen(new Date("2026-09-28T10:00:00Z")), true, "15:30 IST is open (inclusive)");
assert.equal(isMarketOpen(new Date("2026-09-28T10:01:00Z")), false, "15:31 IST is closed");
assert.equal(isMarketOpen(new Date("2026-09-28T07:00:00Z")), true, "midday Monday is open");

// Weekend — 2026-10-03 is a Saturday, 2026-10-04 a Sunday, same time of day.
assert.equal(isMarketOpen(new Date("2026-10-03T07:00:00Z")), false, "Saturday is closed");
assert.equal(isMarketOpen(new Date("2026-10-04T07:00:00Z")), false, "Sunday is closed");

// istDateKey: UTC 2026-09-28T20:00:00Z is already 2026-09-29 in IST (+5:30).
assert.equal(istDateKey(new Date("2026-09-28T03:45:00Z")), "2026-09-28");
assert.equal(istDateKey(new Date("2026-09-28T20:00:00Z")), "2026-09-29");

console.log("marketHours: all checks passed");
