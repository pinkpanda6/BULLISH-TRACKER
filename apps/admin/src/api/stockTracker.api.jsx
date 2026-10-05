import api from "./index";
import { ENDPOINTS } from "./endpoints";

export const searchWatchlist = async (params) => api.post(ENDPOINTS.STOCK_TRACKER.WATCHLIST_SEARCH, params);
// A real ~440-row import calls Yahoo Finance sequentially for every unmapped
// name and can genuinely take several minutes — the shared client's default
// 30s timeout (api/index.jsx) would otherwise fail the request client-side
// while the server keeps working and finishes successfully anyway. Verified
// against the real nse 9.xlsx: ~4 minutes for 437 rows, 174 needing review.
export const importWatchlist = async (rows, mode, watchlistId) =>
    api.post(ENDPOINTS.STOCK_TRACKER.IMPORT, { rows, mode, watchlistId }, { timeout: 20 * 60 * 1000 });
export const searchSymbol = async (q) => api.get(`${ENDPOINTS.STOCK_TRACKER.SYMBOL_SEARCH}?q=${encodeURIComponent(q)}`);
export const confirmMapping = async (trackedStockId, symbol, longName) =>
    api.post(ENDPOINTS.STOCK_TRACKER.CONFIRM_MAPPING, { trackedStockId, symbol, longName });
export const searchAlerts = async (params) => api.post(ENDPOINTS.STOCK_TRACKER.ALERTS_SEARCH, params);
export const getTodayAlertCount = async (watchlistId) =>
    api.get(`${ENDPOINTS.STOCK_TRACKER.ALERTS_TODAY_COUNT}?watchlistId=${watchlistId}`);
export const updateTrackedStock = async (id, { scripName, close, target }) =>
    api.put(ENDPOINTS.STOCK_TRACKER.WATCHLIST_BY_ID(id), { scripName, close, target });
export const deleteTrackedStock = async (id) => api.delete(ENDPOINTS.STOCK_TRACKER.WATCHLIST_BY_ID(id));
export const manualAddStock = async ({ scripName, close, target, watchlistId }, onDuplicate) =>
    api.post(ENDPOINTS.STOCK_TRACKER.MANUAL_ADD, { scripName, close, target, watchlistId, ...(onDuplicate ? { onDuplicate } : {}) });

// Watchlist containers (multiple watchlists, 2026-09-29)
export const listWatchlists = async () => api.get(ENDPOINTS.STOCK_TRACKER.WATCHLISTS);
export const createWatchlist = async (name) => api.post(ENDPOINTS.STOCK_TRACKER.WATCHLISTS, { name });
export const renameWatchlist = async (id, name) => api.put(ENDPOINTS.STOCK_TRACKER.WATCHLIST_CONTAINER_BY_ID(id), { name });
export const deleteWatchlist = async (id) => api.delete(ENDPOINTS.STOCK_TRACKER.WATCHLIST_CONTAINER_BY_ID(id));
