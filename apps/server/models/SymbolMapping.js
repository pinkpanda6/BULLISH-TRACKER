import mongoose from "mongoose";

/**
 * A confirmed Scrip Name -> live-data ticker match, cached so it is never
 * re-asked once settled (RULES.md INV-8). Looked up by `normalizedName`
 * (uppercase, punctuation and corporate suffixes stripped) so "ABB Ltd." and
 * "ABB LIMITED" resolve to the same row. See ADR-017 for why this exists
 * instead of a maintained NSE symbol master list.
 */
const SymbolMappingSchema = new mongoose.Schema(
  {
    scripName: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    longName: {
      type: String,
      trim: true,
    },
    matchedAutomatically: {
      type: Boolean,
      default: false,
      required: true,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminUser",
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

// normalizedName is the lookup key (INV-8) and must be unique per mapping.
SymbolMappingSchema.index({ normalizedName: 1 }, { unique: true });
SymbolMappingSchema.index({ symbol: 1 });
SymbolMappingSchema.index({ matchedAutomatically: 1, createdAt: -1 });
SymbolMappingSchema.index({ createdAt: -1 });

export default mongoose.model("SymbolMapping", SymbolMappingSchema);
