import mongoose from "mongoose";

/**
 * A named container of `TrackedStock` rows (user request, 2026-09-29) — "Watchlist 1",
 * "Watchlist 2", each with its own monthly imports, renameable. `SymbolMapping`
 * stays global/shared across every container by design (DOMAIN.md).
 */
const WatchlistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sequence: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

WatchlistSchema.index({ name: 1 }, { unique: true });
WatchlistSchema.index({ sequence: 1 });

export default mongoose.model("Watchlist", WatchlistSchema);
