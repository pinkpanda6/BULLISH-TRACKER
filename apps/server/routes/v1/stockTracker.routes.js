import express from "express";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { ADMIN_ONLY } from "@demo-panel/shared/roles";
import {
  allowOnlyFields,
  allowedStockImportFields,
  stockImportValidation,
  allowedConfirmMappingFields,
  confirmMappingValidation,
  allowedUpdateStockFields,
  updateStockValidation,
  allowedManualAddFields,
  manualAddValidation,
  allowedCreateWatchlistFields,
  createWatchlistValidation,
  allowedRenameWatchlistFields,
  renameWatchlistValidation,
  searchValidation,
  mongoIdValidator,
  handleValidationErrors,
} from "../../middlewares/inputValidator.js";
import {
  importWatchlist,
  searchSymbol,
  confirmMapping,
  listWatchlistByParams,
  listAlertsByParams,
  getTodayAlertCount,
  updateTrackedStock,
  deleteTrackedStock,
  manualAddStock,
  listWatchlists,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist,
} from "../../controllers/v1/stockTracker.controller.js";

const router = express.Router();

/**
 * Bullish Tracker (PRD scope items 3-4) — a single-user module, so every
 * route here is ADMIN_ONLY rather than matrix-governed, matching how
 * admin-users itself is guarded (see 30-api.md "ADMIN bypasses the matrix
 * anyway"). `confirmMapping`'s `confirmedBy` ref assumes the caller is always
 * an AdminUser id, which ADMIN_ONLY guarantees.
 */

/**
 * @swagger
 * /stock-tracker/watchlists:
 *   get:
 *     summary: Every Watchlist container, for the picker (creates a default one if none exist)
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of watchlists
 *   post:
 *     summary: Create a new Watchlist container
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Created
 *       409:
 *         description: A watchlist with that name already exists
 */
router.get(
  "/stock-tracker/watchlists",
  authMiddleware(ADMIN_ONLY),
  listWatchlists,
);

router.post(
  "/stock-tracker/watchlists",
  authMiddleware(ADMIN_ONLY),
  allowOnlyFields(allowedCreateWatchlistFields),
  createWatchlistValidation,
  createWatchlist,
);

/**
 * @swagger
 * /stock-tracker/watchlists/{watchlistId}:
 *   put:
 *     summary: Rename a Watchlist container
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Renamed
 *       404:
 *         description: Watchlist not found
 *   delete:
 *     summary: Delete a Watchlist container and everything in it (soft delete, cascades to its tracked stocks and alert history)
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Watchlist not found
 */
router.put(
  "/stock-tracker/watchlists/:watchlistId",
  authMiddleware(ADMIN_ONLY),
  mongoIdValidator("watchlistId", "param"),
  allowOnlyFields(allowedRenameWatchlistFields),
  renameWatchlistValidation,
  renameWatchlist,
);

router.delete(
  "/stock-tracker/watchlists/:watchlistId",
  authMiddleware(ADMIN_ONLY),
  mongoIdValidator("watchlistId", "param"),
  handleValidationErrors,
  deleteWatchlist,
);

/**
 * @swagger
 * /stock-tracker/watchlist/search:
 *   post:
 *     summary: Paginated, filtered list of tracked stocks
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SearchRequest'
 *     responses:
 *       200:
 *         description: Search results
 */
router.post(
  "/stock-tracker/watchlist/search",
  authMiddleware(ADMIN_ONLY),
  searchValidation,
  listWatchlistByParams,
);

/**
 * @swagger
 * /stock-tracker/import:
 *   post:
 *     summary: Import the monthly watchlist .xlsx (already parsed client-side)
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [replace, update]
 *               rows:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     scripName: { type: string }
 *                     close: { type: number }
 *                     likelyTradingRange: { type: string }
 *     responses:
 *       200:
 *         description: Import summary — created, updated, auto-matched, needing review
 */
router.post(
  "/stock-tracker/import",
  authMiddleware(ADMIN_ONLY),
  allowOnlyFields(allowedStockImportFields),
  stockImportValidation,
  importWatchlist,
);

/**
 * @swagger
 * /stock-tracker/symbol-search:
 *   get:
 *     summary: Search NSE equities on Yahoo Finance (ADR-017), for the confirm-mapping picker
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Candidate symbols
 */
router.get(
  "/stock-tracker/symbol-search",
  authMiddleware(ADMIN_ONLY),
  searchSymbol,
);

/**
 * @swagger
 * /stock-tracker/confirm-mapping:
 *   post:
 *     summary: Manually confirm or correct a Scrip Name's symbol mapping
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trackedStockId: { type: string }
 *               symbol: { type: string }
 *               longName: { type: string }
 *     responses:
 *       200:
 *         description: Mapping confirmed
 *       404:
 *         description: Tracked stock not found
 */
router.post(
  "/stock-tracker/confirm-mapping",
  authMiddleware(ADMIN_ONLY),
  allowOnlyFields(allowedConfirmMappingFields),
  confirmMappingValidation,
  confirmMapping,
);

/**
 * @swagger
 * /stock-tracker/alerts/search:
 *   post:
 *     summary: Paginated list of bullish-crossover alerts, newest first
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SearchRequest'
 *     responses:
 *       200:
 *         description: Search results
 */
router.post(
  "/stock-tracker/alerts/search",
  authMiddleware(ADMIN_ONLY),
  searchValidation,
  listAlertsByParams,
);

/**
 * @swagger
 * /stock-tracker/alerts/today-count:
 *   get:
 *     summary: How many alerts fired today (IST) — drives the header badge
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's alert count
 */
router.get(
  "/stock-tracker/alerts/today-count",
  authMiddleware(ADMIN_ONLY),
  getTodayAlertCount,
);

/**
 * @swagger
 * /stock-tracker/watchlist/{trackedStockId}:
 *   put:
 *     summary: Edit a tracked stock's Scrip Name, Close or Target
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Tracked stock not found
 *   delete:
 *     summary: Remove a tracked stock (soft delete, reference-guarded)
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Removed
 *       409:
 *         description: Blocked — the stock has alert history
 */
router.put(
  "/stock-tracker/watchlist/:trackedStockId",
  authMiddleware(ADMIN_ONLY),
  mongoIdValidator("trackedStockId", "param"),
  allowOnlyFields(allowedUpdateStockFields),
  updateStockValidation,
  updateTrackedStock,
);

router.delete(
  "/stock-tracker/watchlist/:trackedStockId",
  authMiddleware(ADMIN_ONLY),
  mongoIdValidator("trackedStockId", "param"),
  handleValidationErrors,
  deleteTrackedStock,
);

/**
 * @swagger
 * /stock-tracker/manual-add:
 *   post:
 *     summary: Add a stock by hand (not from the monthly sheet)
 *     tags: [Stock Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scripName: { type: string }
 *               close: { type: number }
 *               target: { type: number }
 *               onDuplicate: { type: string, enum: [duplicate, replace] }
 *     responses:
 *       201:
 *         description: Created
 *       200:
 *         description: Replaced the existing entry
 *       409:
 *         description: Scrip Name already tracked — caller must choose duplicate or replace
 */
router.post(
  "/stock-tracker/manual-add",
  authMiddleware(ADMIN_ONLY),
  allowOnlyFields(allowedManualAddFields),
  manualAddValidation,
  manualAddStock,
);

export default router;
