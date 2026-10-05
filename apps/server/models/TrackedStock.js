import mongoose from "mongoose";

/**
 * One row per stock on a `Watchlist` container (DOMAIN.md; multiple
 * containers added 2026-09-29 — user request). `close`/`target` come from the
 * monthly import; `livePrice`/`lastFetchedAt`/`crossedAt`/`lastAlertedDate`
 * are written by the live-price job (module 2) and stay null until then.
 * `crossedAt` is one-way (RULES.md INV-9, FLOW-1) — only a **replace** import
 * clears it, by recreating the row.
 *
 * Full field set built now rather than added later: this starter has no
 * migration system, so a field added after the collection is populated needs
 * a backfill script instead of just being written from day one.
 */
const TrackedStockSchema = new mongoose.Schema(
  {
    watchlist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Watchlist",
      required: true,
    },
    scripName: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional: a source file may carry only a name and a trigger price, with
    // no separate "close" figure (e.g. a plain two-column sheet). Shown as
    // "-" in the UI when absent; never used in CALC-1.
    close: {
      type: Number,
      default: null,
    },
    target: {
      type: Number,
      required: true,
    },
    symbolMapping: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SymbolMapping",
      default: null,
    },
    livePrice: {
      type: Number,
      default: null,
    },
    lastFetchedAt: {
      type: Date,
      default: null,
    },
    crossedAt: {
      type: Date,
      default: null,
    },
    lastAlertedDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

// scripName is the natural key an import upserts against (replace/update
// mode) — scoped per watchlist, not globally, so the same real stock can be
// tracked in more than one container with its own target.
TrackedStockSchema.index({ watchlist: 1, scripName: 1 }, { unique: true });
TrackedStockSchema.index({ symbolMapping: 1 });
// crossedAt: null selects the Watchlist tab, set selects Crossed Above (sorted by date).
TrackedStockSchema.index({ crossedAt: 1 });
TrackedStockSchema.index({ createdAt: -1 });

export default mongoose.model("TrackedStock", TrackedStockSchema);
