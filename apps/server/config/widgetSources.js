/**
 * The widget source registry (ADR-003) — the trust boundary of the dashboard
 * grammar. The builder UI can only offer, and a stored widget can only
 * reference, what is declared here. A new collection is invisible to the
 * builder until a developer adds an entry; that is the security model, the
 * same philosophy as a controller's `filterable` map.
 *
 * Per source:
 * - model        mongoose model *name* (resolved at run — avoids import cycles)
 * - label        what the builder shows
 * - aggregatable numeric fields usable by sum/avg, `{ field: label }`
 * - groupable    fields usable as group-by; optional `lookup` joins a display
 *                label (`from` collection, `labelField`) for ObjectId refs.
 *                The FIRST entry is also the default breakdown a stat tile
 *                shows behind its info icon, so put the most meaningful cut
 *                of the collection first.
 * - dateFields   date fields a preset range may apply to, `{ field: label }`
 * - filterable   `{ field: type }` allowlist for widget filters — exactly the
 *                runListQuery grammar (see 30-api.md)
 * - scopeable    ADR-002 scope dimensions, passed to buildScopeFilter at run
 */
export const WIDGET_SOURCES = Object.freeze({
  users: {
    label: "Users",
    model: "User",
    aggregatable: {},
    groupable: {
      departmentId: {
        label: "Department",
        lookup: { from: "departments", labelField: "departmentName" },
      },
      roleId: {
        label: "Role",
        lookup: { from: "rolemasters", labelField: "roleName" },
      },
      isActive: { label: "Active status" },
    },
    dateFields: { createdAt: "Created" },
    filterable: {
      userName: "string",
      email: "string",
      isActive: "boolean",
      departmentId: "objectId",
      roleId: "objectId",
      createdAt: "date",
    },
    scopeable: { department: "departmentId", owner: "_id" },
  },

  "login-attempts": {
    label: "Login Attempts",
    model: "LoginAttempt",
    aggregatable: { attemptCount: "Failed attempt count" },
    groupable: {
      isLocked: { label: "Locked status" },
    },
    dateFields: { lastLoggedIn: "Last logged in", createdAt: "Created" },
    filterable: {
      userEmail: "string",
      isLocked: "boolean",
      attemptCount: "number",
      createdAt: "date",
      lastLoggedIn: "date",
    },
    scopeable: { owner: "userId" },
  },

  "tracked-stocks": {
    label: "Tracked Stocks",
    model: "TrackedStock",
    aggregatable: {
      close: "Close price at import",
      target: "Likely Trading High (target)",
      livePrice: "Live price",
    },
    groupable: {
      watchlist: {
        label: "Watchlist",
        lookup: { from: "watchlists", labelField: "name" },
      },
      symbolMapping: {
        label: "Stock",
        lookup: { from: "symbolmappings", labelField: "symbol" },
      },
    },
    dateFields: { crossedAt: "Crossed above target", lastFetchedAt: "Last fetched", createdAt: "Imported" },
    filterable: {
      scripName: "string",
      close: "number",
      target: "number",
      livePrice: "number",
      watchlist: "objectId",
      symbolMapping: "objectId",
      crossedAt: "date",
      lastFetchedAt: "date",
      createdAt: "date",
    },
  },

  watchlists: {
    label: "Watchlists",
    model: "Watchlist",
    aggregatable: {},
    groupable: {},
    dateFields: { createdAt: "Created" },
    filterable: {
      name: "string",
      createdAt: "date",
    },
  },

  "symbol-mappings": {
    label: "Stock Symbol Mappings",
    model: "SymbolMapping",
    aggregatable: {},
    groupable: {
      matchedAutomatically: { label: "Auto-matched vs. manually confirmed" },
    },
    dateFields: { createdAt: "Confirmed" },
    filterable: {
      scripName: "string",
      symbol: "string",
      matchedAutomatically: "boolean",
      confirmedBy: "objectId",
      createdAt: "date",
    },
  },

  "stock-alerts": {
    label: "Stock Alerts",
    model: "StockAlert",
    aggregatable: {
      priceAtCross: "Live price at crossing",
      target: "Target crossed",
    },
    groupable: {
      watchlist: {
        label: "Watchlist",
        lookup: { from: "watchlists", labelField: "name" },
      },
      trackedStock: {
        label: "Stock",
        lookup: { from: "trackedstocks", labelField: "scripName" },
      },
    },
    dateFields: { crossedAt: "Crossed", createdAt: "Recorded" },
    filterable: {
      trackedStock: "objectId",
      watchlist: "objectId",
      crossedAt: "date",
      priceAtCross: "number",
      target: "number",
      createdAt: "date",
    },
  },
});
