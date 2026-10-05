/**
 * NSE market-hours and IST calendar-day helpers (ADR-018).
 *
 * Uses `Intl`'s built-in `Asia/Kolkata` timezone support rather than a new
 * dependency — India has no daylight saving, so a fixed IANA zone is exact,
 * not an approximation.
 */

const IST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const partsInIst = (date) => {
  const map = {};
  for (const { type, value } of IST_PARTS.formatToParts(date)) map[type] = value;
  return map;
};

/** "YYYY-MM-DD" in IST — the dedup key for RULES.md INV-10 (once per stock per day). */
export const istDateKey = (date = new Date()) => {
  const { year, month, day } = partsInIst(date);
  return `${year}-${month}-${day}`;
};

const TRADING_WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
const MARKET_OPEN_MINUTES = 9 * 60 + 15; // 9:15 IST
const MARKET_CLOSE_MINUTES = 15 * 60 + 30; // 15:30 IST

/** NSE equity market hours: Mon-Fri, 9:15-15:30 IST. No holiday calendar. */
export const isMarketOpen = (date = new Date()) => {
  const { weekday, hour, minute } = partsInIst(date);
  if (!TRADING_WEEKDAYS.has(weekday)) return false;
  const minutesSinceMidnight = Number(hour) * 60 + Number(minute);
  return minutesSinceMidnight >= MARKET_OPEN_MINUTES && minutesSinceMidnight <= MARKET_CLOSE_MINUTES;
};
