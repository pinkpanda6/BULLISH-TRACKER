import mongoose from "mongoose";

/**
 * One row per crossing event (RULES.md FLOW-2) — a log, not a master record,
 * feeding the in-app alert list and the header badge count. Created by the
 * price-fetch job (ADR-018), at most once per TrackedStock per calendar day
 * (INV-10). Never edited by users.
 */
const StockAlertSchema = new mongoose.Schema(
  {
    trackedStock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrackedStock",
      required: true,
    },
    // Denormalized from trackedStock.watchlist at creation time (multiple
    // watchlists, 2026-09-29) — the per-watchlist alert list/badge (user
    // choice: independent, not combined) would otherwise need a $lookup join
    // for every count, not just every list.
    watchlist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Watchlist",
      required: true,
    },
    crossedAt: {
      type: Date,
      required: true,
    },
    priceAtCross: {
      type: Number,
      required: true,
    },
    target: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

StockAlertSchema.index({ trackedStock: 1 });
StockAlertSchema.index({ crossedAt: -1 });
StockAlertSchema.index({ watchlist: 1, crossedAt: -1 });

export default mongoose.model("StockAlert", StockAlertSchema);
