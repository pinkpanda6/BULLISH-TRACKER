/**
 * The global search registry (ADR-016) — the trust boundary of the header
 * search. Only a collection declared here is searched, and only through the
 * fields declared here; a new collection is unsearchable until a developer
 * adds an entry, the same philosophy as `widgetSources` and a controller's
 * `filterable` map. Secrets (passwords, `appPassword`, OTPs) are never listed.
 *
 * Per source:
 * - model     mongoose model *name* (resolved at run — avoids import cycles)
 * - label     the group heading in the results
 * - path      the admin screen: the seeded MenuMaster.menuUrl, and where a
 *             result links to
 * - access    who may search it — MUST match the source's own list route:
 *             `{ menuUrl }` for matrix-governed screens (checked as "read"),
 *             `{ adminOnly: true }` for ADMIN_ONLY routes
 * - fields    `{ field: label }` — the only fields ever matched, and the label
 *             shown beside a highlighted match. String fields only (the test
 *             enforces it); dotted paths reach subdocuments
 * - title     field shown as the result's heading
 * - subtitle  optional field shown under it
 * - link      "record" → `<path>/<id>` (CRUD view screen)
 *             "list"   → `<path>?q=<term>` (logs: no record screen, so the
 *                        list opens already filtered)
 * - scopeable ADR-002 scope dimensions, passed to buildScopeFilter — same as
 *             the source's list controller declares
 */
export const SEARCH_SOURCES = Object.freeze({
  users: {
    label: "Users",
    model: "User",
    path: "/user",
    access: { menuUrl: "/user" },
    fields: { userName: "Name", email: "Email", mobileNumber: "Mobile number", address: "Address" },
    title: "userName",
    subtitle: "email",
    link: "record",
    scopeable: { department: "departmentId", owner: "_id" },
  },

  "admin-users": {
    label: "Admin Users",
    model: "AdminUser",
    path: "/admin-user",
    access: { adminOnly: true },
    fields: { adminName: "Name", email: "Email", mobileNumber: "Mobile number" },
    title: "adminName",
    subtitle: "email",
    link: "record",
  },

  departments: {
    label: "Departments",
    model: "Department",
    path: "/department",
    access: { menuUrl: "/department" },
    fields: { departmentName: "Name", departmentCode: "Code" },
    title: "departmentName",
    subtitle: "departmentCode",
    link: "record",
  },

  roles: {
    label: "Roles",
    model: "RoleMaster",
    path: "/role-master",
    access: { menuUrl: "/role-master" },
    fields: { roleName: "Name" },
    title: "roleName",
    link: "record",
  },

  countries: {
    label: "Countries",
    model: "Country",
    path: "/country",
    access: { menuUrl: "/country" },
    fields: { countryName: "Name", countryCode: "Code" },
    title: "countryName",
    subtitle: "countryCode",
    link: "record",
  },

  states: {
    label: "States",
    model: "State",
    path: "/state",
    access: { menuUrl: "/state" },
    fields: { stateName: "Name", stateCode: "Code" },
    title: "stateName",
    subtitle: "stateCode",
    link: "record",
  },

  cities: {
    label: "Cities",
    model: "City",
    path: "/city",
    access: { menuUrl: "/city" },
    fields: { cityName: "Name", cityCode: "Code" },
    title: "cityName",
    subtitle: "cityCode",
    link: "record",
  },

  currencies: {
    label: "Currencies",
    model: "CurrencyMaster",
    path: "/currency-master",
    access: { menuUrl: "/currency-master" },
    fields: { currencyName: "Name", currencyCode: "Code", currencySymbol: "Symbol" },
    title: "currencyName",
    subtitle: "currencyCode",
    link: "record",
  },

  "menu-groups": {
    label: "Menu Groups",
    model: "MenuGroupMaster",
    path: "/menu-group",
    access: { menuUrl: "/menu-group" },
    fields: { menuGroupName: "Name", menuUrl: "URL" },
    title: "menuGroupName",
    subtitle: "menuUrl",
    link: "record",
  },

  menus: {
    label: "Menus",
    model: "MenuMaster",
    path: "/menu-master",
    access: { menuUrl: "/menu-master" },
    fields: { menuName: "Name", menuUrl: "URL" },
    title: "menuName",
    subtitle: "menuUrl",
    link: "record",
  },

  "email-setups": {
    label: "Email Setup",
    model: "EmailSetup",
    path: "/email-setup",
    access: { menuUrl: "/email-setup" },
    // appPassword deliberately absent.
    fields: { email: "Email", host: "Host" },
    title: "email",
    subtitle: "host",
    link: "record",
  },

  "email-for": {
    label: "Email For",
    model: "EmailFor",
    path: "/email-for",
    access: { menuUrl: "/email-for" },
    fields: { emailFor: "Name", triggerKey: "Trigger" },
    title: "emailFor",
    subtitle: "triggerKey",
    link: "record",
  },

  "email-templates": {
    label: "Email Templates",
    model: "EmailTemplate",
    path: "/email-template",
    access: { menuUrl: "/email-template" },
    // emailFrom is a reference to an EmailSetup, not text — not searchable.
    fields: { templateName: "Name", emailSubject: "Subject", mailerName: "Mailer name" },
    title: "templateName",
    subtitle: "emailSubject",
    link: "record",
  },

  "seo-pages": {
    label: "SEO Pages",
    model: "SeoPage",
    path: "/seo-pages",
    access: { menuUrl: "/seo-pages" },
    fields: {
      pageName: "Page name",
      path: "Path",
      title: "Meta title",
      description: "Meta description",
      focusKeyword: "Focus keyword",
    },
    title: "pageName",
    subtitle: "path",
    link: "record",
  },

  "seo-redirects": {
    label: "Redirects",
    model: "SeoRedirect",
    path: "/seo-redirects",
    access: { menuUrl: "/seo-redirects" },
    fields: { fromPath: "From", toPath: "To", notes: "Notes" },
    title: "fromPath",
    subtitle: "toPath",
    link: "record",
  },

  "audit-log": {
    label: "Audit Log",
    model: "AuditLog",
    path: "/audit-log",
    access: { menuUrl: "/audit-log" },
    fields: {
      recordLabel: "Record",
      model: "Type",
      "actor.name": "Changed by",
      "actor.email": "Changed by (email)",
    },
    title: "recordLabel",
    subtitle: "model",
    link: "list",
  },

  "login-attempts": {
    label: "Login Attempts",
    model: "LoginAttempt",
    path: "/login-attempt-logs",
    access: { adminOnly: true },
    fields: { userEmail: "Email", ipAddress: "IP address" },
    title: "userEmail",
    subtitle: "ipAddress",
    link: "list",
  },

  "seo-404": {
    label: "404 Log",
    model: "SeoNotFound",
    path: "/seo-404",
    access: { menuUrl: "/seo-404" },
    fields: { path: "Path", lastReferrer: "Referrer" },
    title: "path",
    subtitle: "lastReferrer",
    link: "list",
  },

  // ADMIN_ONLY, not matrix-governed — this is a single-user module (see
  // routes/v1/stockTracker.routes.js), so `access` mirrors that, not a
  // `menuUrl`.
  "tracked-stocks": {
    label: "Watchlist",
    model: "TrackedStock",
    path: "/watchlist",
    access: { adminOnly: true },
    fields: { scripName: "Scrip name" },
    title: "scripName",
    link: "list",
  },

  "symbol-mappings": {
    label: "Stock Symbol Mappings",
    model: "SymbolMapping",
    path: "/watchlist",
    access: { adminOnly: true },
    fields: { scripName: "Scrip name", symbol: "Symbol", longName: "Yahoo Finance name" },
    title: "scripName",
    subtitle: "symbol",
    link: "list",
  },

  // No entry for StockAlert (module 2): every one of its own fields is a
  // ref/Number/Date, nothing String — `searchSource` runs a plain `.find()`,
  // not a `$lookup` aggregation, so there is no reachable text field to match
  // against (unlike AuditLog's embedded `actor.name`, a ref like `trackedStock`
  // cannot be dotted into). Its stock and crossing are already searchable via
  // "tracked-stocks" above. See DOMAIN.md's "Not modelled" note.

  watchlists: {
    label: "Watchlists",
    model: "Watchlist",
    path: "/watchlist",
    access: { adminOnly: true },
    fields: { name: "Name" },
    title: "name",
    link: "list",
  },
});
