import mongoose from "mongoose";
import TrackedStock from "../../models/TrackedStock.js";
import SymbolMapping from "../../models/SymbolMapping.js";
import StockAlert from "../../models/StockAlert.js";
import Watchlist from "../../models/Watchlist.js";
import { runListQuery } from "../../utils/listQuery.js";
import { matchSymbol, normalizeName, parseLikelyTradingRange, searchYahooEquities } from "../../utils/stockSymbols.js";
import { istDateKey } from "../../utils/marketHours.js";
import { getReferencingCounts, formatReferenceMessage } from "../../utils/referenceHelper.js";

/**
 * `runListQuery`'s `scopeFilter` (and any raw aggregation `$match`) is never
 * cast the way `.find()` casts a query — a string id there simply fails to
 * equal the real ObjectId in the documents. Every watchlist-scoped list
 * below goes through this instead of trusting the body's id as-is.
 */
const watchlistScope = (watchlistId) =>
  mongoose.Types.ObjectId.isValid(watchlistId) ? new mongoose.Types.ObjectId(String(watchlistId)) : null;

// ---- Watchlist containers (user request, 2026-09-29) ---------------------

/**
 * Every container, for the picker on the Watchlist page. Creates a default
 * one on a truly empty install rather than making the UI handle "no
 * containers exist yet" as a real state.
 */
export const listWatchlists = async (req, res) => {
  try {
    let watchlists = await Watchlist.find({}).sort({ sequence: 1, createdAt: 1 });
    if (!watchlists.length) {
      const created = await Watchlist.create({ name: "Watchlist 1", sequence: 1 });
      watchlists = [created];
    }
    return res.status(200).json({ isOk: true, status: 200, data: watchlists });
  } catch (error) {
    console.error("Error in listWatchlists:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

export const createWatchlist = async (req, res) => {
  try {
    const { name } = req.body;
    const count = await Watchlist.countDocuments({});
    const created = await Watchlist.create({ name, sequence: count + 1 });
    return res.status(201).json({ isOk: true, status: 201, message: "Watchlist created", data: created });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ isOk: false, status: 409, message: "A watchlist with that name already exists" });
    }
    console.error("Error in createWatchlist:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

export const renameWatchlist = async (req, res) => {
  try {
    const { watchlistId } = req.params;
    const { name } = req.body;

    const watchlist = await Watchlist.findById(watchlistId);
    if (!watchlist) {
      return res.status(404).json({ isOk: false, status: 404, message: "Watchlist not found" });
    }
    watchlist.name = name;
    await watchlist.save();

    return res.status(200).json({ isOk: true, status: 200, message: "Renamed", data: watchlist });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ isOk: false, status: 409, message: "A watchlist with that name already exists" });
    }
    console.error("Error in renameWatchlist:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/**
 * Deletes a whole container, cascading to everything inside it (owner's
 * explicit choice, 2026-09-30 — a plain reference guard would just block
 * every delete, since every real watchlist has stocks in it). Still a soft
 * delete throughout (INV-1) — nothing is destroyed, so it is recoverable at
 * the database level even though the UI has no "undo" for it. `SymbolMapping`
 * is never touched: it is shared across every container by design
 * (DOMAIN.md) and deleting one watchlist must never affect another's
 * matching.
 */
export const deleteWatchlist = async (req, res) => {
  try {
    const { watchlistId } = req.params;

    const watchlist = await Watchlist.findById(watchlistId);
    if (!watchlist) {
      return res.status(404).json({ isOk: false, status: 404, message: "Watchlist not found" });
    }

    const trackedStockIds = await TrackedStock.find({ watchlist: watchlistId }).distinct("_id");
    await StockAlert.updateMany({ watchlist: watchlistId }, { isDeleted: true });
    await TrackedStock.updateMany({ watchlist: watchlistId }, { isDeleted: true });
    await Watchlist.findByIdAndUpdate(watchlistId, { isDeleted: true });

    return res.status(200).json({
      isOk: true,
      status: 200,
      message: `"${watchlist.name}" and its ${trackedStockIds.length} stock(s) deleted`,
    });
  } catch (error) {
    console.error("Error in deleteWatchlist:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

// ---- Import ----------------------------------------------------------

/**
 * Monthly watchlist import (PRD scope item 3), scoped to one Watchlist
 * container (`watchlistId`). Rows are already parsed by the browser from the
 * source file (ADR-017) — this endpoint never sees the raw file.
 *
 * A row carries **either** `likelyTradingRange` (the original monthly-sheet
 * shape — this endpoint parses the high bound out of it) **or** `target`
 * directly as a number (a simpler two-column name+price sheet, 2026-09-29)
 * — whichever the client's parser recognised. `close` is optional: a
 * two-column sheet has no separate close price at all.
 *
 * A bad row is skipped, not fatal to the whole import — same philosophy as
 * `importSeoRedirects`: a partial import someone can re-run beats an
 * all-or-nothing one that rejects 400 good rows because of two bad ones.
 */
export const importWatchlist = async (req, res) => {
  try {
    const { rows, mode, watchlistId } = req.body;
    const results = { created: 0, updated: 0, autoMatched: 0, needsReview: [], errors: [] };

    if (mode === "replace") {
      // Soft delete (INV-1) — a replace import never destroys history, it
      // frees the {watchlist, scripName} unique index (partialFilterExpression,
      // isDeleted scoped) so the fresh rows below can reuse the same names —
      // scoped to this container only, other watchlists are untouched.
      await TrackedStock.updateMany({ watchlist: watchlistId }, { isDeleted: true });
    }

    for (const [index, row] of rows.entries()) {
      const scripName = String(row.scripName || "").trim();
      const close = row.close === undefined || row.close === null || row.close === "" ? null : Number(row.close);

      let target = null;
      if (row.target !== undefined && row.target !== null && row.target !== "") {
        const n = Number(row.target);
        if (Number.isFinite(n)) target = n;
      } else if (row.likelyTradingRange) {
        const range = parseLikelyTradingRange(row.likelyTradingRange);
        if (range) target = range.high;
      }

      if (!scripName || target === null || (close !== null && !Number.isFinite(close))) {
        results.errors.push(`Row ${index + 1}: could not read a Scrip Name and a trigger price`);
        continue;
      }

      const existing = mode === "update" ? await TrackedStock.findOne({ watchlist: watchlistId, scripName }) : null;

      if (existing) {
        existing.close = close;
        existing.target = target;
        if (!existing.symbolMapping) {
          const mapping = await matchSymbol(scripName);
          if (mapping) {
            existing.symbolMapping = mapping._id;
            if (mapping.matchedAutomatically) results.autoMatched += 1;
          } else {
            results.needsReview.push({ trackedStockId: String(existing._id), scripName, close, target });
          }
        }
        await existing.save();
        results.updated += 1;
        continue;
      }

      const mapping = await matchSymbol(scripName);
      const created = await TrackedStock.create({
        watchlist: watchlistId,
        scripName,
        close,
        target,
        symbolMapping: mapping ? mapping._id : null,
      });
      results.created += 1;
      if (mapping) {
        if (mapping.matchedAutomatically) results.autoMatched += 1;
      } else {
        results.needsReview.push({ trackedStockId: String(created._id), scripName, close, target });
      }
    }

    return res.status(200).json({
      isOk: true,
      status: 200,
      message: `Imported: ${results.created} new, ${results.updated} updated, ${results.autoMatched} auto-matched, ${results.needsReview.length} need review`,
      data: results,
    });
  } catch (error) {
    console.error("Error in importWatchlist:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/**
 * Server-side proxy to Yahoo Finance's search endpoint (ADR-017), used by the
 * confirm-mapping screen's live picker. Never called directly from the
 * browser — keeps the unofficial third-party call in one place.
 */
export const searchSymbol = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(200).json({ isOk: true, status: 200, data: [] });
    }
    const candidates = await searchYahooEquities(q);
    return res.status(200).json({ isOk: true, status: 200, data: candidates });
  } catch (error) {
    console.error("Error in searchSymbol:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/**
 * Manual confirm/correct of a Scrip Name's mapping. Upserts the SymbolMapping
 * cache by normalized name (INV-8) so this same name is never asked about
 * again — shared across every Watchlist container by design (DOMAIN.md) —
 * then points the TrackedStock row at it.
 */
export const confirmMapping = async (req, res) => {
  try {
    const { trackedStockId, symbol, longName } = req.body;

    const trackedStock = await TrackedStock.findById(trackedStockId);
    if (!trackedStock) {
      return res.status(404).json({ isOk: false, status: 404, message: "Tracked stock not found" });
    }

    const normalizedName = normalizeName(trackedStock.scripName);
    const mapping = await SymbolMapping.findOneAndUpdate(
      { normalizedName },
      {
        scripName: trackedStock.scripName,
        normalizedName,
        symbol: symbol.trim().toUpperCase(),
        longName: longName || null,
        matchedAutomatically: false,
        confirmedBy: req.user.id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    trackedStock.symbolMapping = mapping._id;
    await trackedStock.save();

    return res.status(200).json({
      isOk: true,
      status: 200,
      message: "Mapping confirmed",
      data: trackedStock,
    });
  } catch (error) {
    console.error("Error in confirmMapping:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

export const listWatchlistByParams = async (req, res) => {
  try {
    const scope = watchlistScope(req.body.watchlistId);
    if (!scope) {
      return res.status(400).json({ isOk: false, status: 400, message: "A valid watchlistId is required" });
    }

    const list = await runListQuery(TrackedStock, req.body, {
      searchFields: ["scripName"],
      filterable: {
        scripName: "string",
        close: "number",
        target: "number",
        livePrice: "number",
        symbolMapping: "objectId",
        crossedAt: "date",
        lastFetchedAt: "date",
        createdAt: "date",
        // CALC-1, computed here rather than stored (DOMAIN.md) — declared
        // filterable/sortable only so runListQuery's allowlist honours it,
        // same pattern as countryName on the state list (30-api.md).
        proximityPercent: "number",
      },
      // Server-set, not client-injectable — merged in like buildScopeFilter's
      // result would be, ahead of anything the generic filters[] payload asks for.
      scopeFilter: { watchlist: scope },
      stages: [
        {
          $lookup: {
            from: "symbolmappings",
            localField: "symbolMapping",
            foreignField: "_id",
            as: "symbolMappingDoc",
          },
        },
        { $unwind: { path: "$symbolMappingDoc", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            proximityPercent: {
              $cond: [
                { $and: [{ $ne: ["$livePrice", null] }, { $ne: ["$livePrice", 0] }] },
                { $multiply: [{ $divide: [{ $subtract: ["$target", "$livePrice"] }, "$livePrice"] }, 100] },
                null,
              ],
            },
          },
        },
      ],
    });

    return res.status(200).json({ isOk: true, status: 200, data: list });
  } catch (error) {
    console.error("Error in listWatchlistByParams:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/**
 * The in-app alert list (PRD scope item 4) — every crossing event for one
 * Watchlist container, newest first, with the stock it belongs to. Alerts
 * are independent per container (user choice, 2026-09-29), not combined.
 */
export const listAlertsByParams = async (req, res) => {
  try {
    const scope = watchlistScope(req.body.watchlistId);
    if (!scope) {
      return res.status(400).json({ isOk: false, status: 400, message: "A valid watchlistId is required" });
    }

    const list = await runListQuery(StockAlert, req.body, {
      searchFields: [],
      filterable: {
        trackedStock: "objectId",
        crossedAt: "date",
        priceAtCross: "number",
        target: "number",
        createdAt: "date",
      },
      scopeFilter: { watchlist: scope },
      stages: [
        {
          $lookup: {
            from: "trackedstocks",
            localField: "trackedStock",
            foreignField: "_id",
            as: "trackedStockDoc",
          },
        },
        { $unwind: { path: "$trackedStockDoc", preserveNullAndEmptyArrays: true } },
      ],
    });

    return res.status(200).json({ isOk: true, status: 200, data: list });
  } catch (error) {
    console.error("Error in listAlertsByParams:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/**
 * The header badge count (PRD scope item 4) — alerts fired today (IST
 * calendar day) in one Watchlist container, which is also naturally how the
 * badge "clears" overnight without needing a seen/unseen flag on every row.
 */
export const getTodayAlertCount = async (req, res) => {
  try {
    const scope = watchlistScope(req.query.watchlistId);
    if (!scope) {
      return res.status(400).json({ isOk: false, status: 400, message: "A valid watchlistId is required" });
    }

    const todayKey = istDateKey();
    // Cheaper than parsing every row's own IST day: today's IST midnight, in
    // UTC, is a fixed 5:30 offset from "today" — build the UTC range once.
    const start = new Date(`${todayKey}T00:00:00.000+05:30`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const count = await StockAlert.countDocuments({ watchlist: scope, crossedAt: { $gte: start, $lt: end } });

    return res.status(200).json({ isOk: true, status: 200, data: { count } });
  } catch (error) {
    console.error("Error in getTodayAlertCount:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/**
 * Direct edits to a tracked stock's own fields (user request, 2026-09-29) —
 * a typo fix or a manual price correction. Never touches `symbolMapping`;
 * that goes through `confirmMapping`, reused as-is for "change the match".
 * Never touches `watchlist` — moving a stock between containers isn't
 * supported, only add/import into the one you want it in.
 */
export const updateTrackedStock = async (req, res) => {
  try {
    const { trackedStockId } = req.params;
    const { scripName, close, target } = req.body;

    const trackedStock = await TrackedStock.findById(trackedStockId);
    if (!trackedStock) {
      return res.status(404).json({ isOk: false, status: 404, message: "Tracked stock not found" });
    }

    trackedStock.scripName = scripName;
    trackedStock.close = close === undefined || close === null || close === "" ? null : Number(close);
    trackedStock.target = target;
    await trackedStock.save();

    return res.status(200).json({ isOk: true, status: 200, message: "Updated", data: trackedStock });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ isOk: false, status: 409, message: "Another tracked stock in this watchlist already uses that Scrip Name" });
    }
    console.error("Error in updateTrackedStock:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/**
 * Soft delete (INV-1), reference-guarded like every other entity (INV-2) —
 * a stock that has ever fired a `StockAlert` cannot be removed until that
 * history is gone too, same rule the rest of the app already follows.
 */
export const deleteTrackedStock = async (req, res) => {
  try {
    const { trackedStockId } = req.params;

    const trackedStock = await TrackedStock.findById(trackedStockId);
    if (!trackedStock) {
      return res.status(404).json({ isOk: false, status: 404, message: "Tracked stock not found" });
    }

    const referenceInfo = await getReferencingCounts("TrackedStock", trackedStockId);
    if (referenceInfo.totalReferences > 0) {
      return res.status(409).json({
        isOk: false,
        status: 409,
        message: "Cannot delete — it has alert history.",
        totalReferences: referenceInfo.totalReferences,
        references: referenceInfo.details,
        formattedMessage: formatReferenceMessage(referenceInfo.details),
      });
    }

    await TrackedStock.findByIdAndUpdate(trackedStockId, { isDeleted: true });
    return res.status(200).json({ isOk: true, status: 200, message: "Removed from the watchlist" });
  } catch (error) {
    console.error("Error in deleteTrackedStock:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};

/** "(Manual)", then "(Manual 2)", "(Manual 3)"... first free one wins, scoped to one container. */
const nextDuplicateName = async (watchlistId, baseName) => {
  let candidate = `${baseName} (Manual)`;
  let n = 2;
  while (await TrackedStock.exists({ watchlist: watchlistId, scripName: candidate })) {
    candidate = `${baseName} (Manual ${n})`;
    n += 1;
  }
  return candidate;
};

/**
 * A stock typed in by hand rather than arriving via the monthly import
 * (user request, 2026-09-29), into one Watchlist container. Goes through the
 * same matching as an import row (`matchSymbol`) so it behaves identically
 * afterward — auto-mapped or left for the confirm-mapping screen.
 *
 * A Scrip Name that already exists **in this container** is not silently
 * overwritten or silently duplicated: the first call (no `onDuplicate`)
 * returns 409 with the existing row so the client can ask; the retry
 * carries the caller's choice. The same name in a *different* container is
 * unrelated — no clash.
 */
export const manualAddStock = async (req, res) => {
  try {
    const { scripName, close, target, onDuplicate, watchlistId } = req.body;
    const closeValue = close === undefined || close === null || close === "" ? null : Number(close);

    const existing = await TrackedStock.findOne({ watchlist: watchlistId, scripName });

    if (existing && !onDuplicate) {
      return res.status(409).json({
        isOk: false,
        status: 409,
        message: "A stock with that Scrip Name is already tracked in this watchlist",
        data: { existing: { _id: existing._id, scripName: existing.scripName, close: existing.close, target: existing.target } },
      });
    }

    if (existing && onDuplicate === "replace") {
      existing.close = closeValue;
      existing.target = target;
      if (!existing.symbolMapping) {
        const mapping = await matchSymbol(scripName);
        if (mapping) existing.symbolMapping = mapping._id;
      }
      await existing.save();
      return res.status(200).json({ isOk: true, status: 200, message: `${scripName} updated`, data: existing });
    }

    // Either no existing row, or the caller explicitly chose "duplicate".
    // Matching runs on the real company name, never the "(Manual)" suffix.
    const finalName = existing ? await nextDuplicateName(watchlistId, scripName) : scripName;
    const mapping = await matchSymbol(scripName);
    const created = await TrackedStock.create({
      watchlist: watchlistId,
      scripName: finalName,
      close: closeValue,
      target,
      symbolMapping: mapping ? mapping._id : null,
    });

    return res.status(201).json({
      isOk: true,
      status: 201,
      message: `${finalName} added${mapping ? "" : " — needs a manual match"}`,
      data: created,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ isOk: false, status: 409, message: "That Scrip Name is already tracked in this watchlist" });
    }
    console.error("Error in manualAddStock:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};
