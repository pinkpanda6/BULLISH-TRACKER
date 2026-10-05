# Business rules

Rules the code must uphold. Each one is written so you can tell whether an implementation satisfies
it, and says **where it is enforced** — because a rule enforced only in the browser is not enforced.

Format: one rule per row, stable id, so a commit or a test can cite it.

## Invariants

<!-- Always true, at every moment. Usually a unique index, a required field or a guard. -->

| ID | Rule | Enforced in |
|---|---|---|
| INV-1 | A record is never destroyed. Deleting sets `isDeleted`, and deleted records are excluded from every read — lists, searches, dropdowns, login and the delete guard. Exception: OTPs and sessions, which are consumed tokens. | `apps/server/models/softDelete.js` (global Mongoose plugin — server-side, cannot be bypassed by a client) |
| INV-2 | A record cannot be deleted while a live record still references it. | `getReferencingCounts` in each delete controller — 409 with the reference list |
| INV-3 | A business-unique value becomes free again once its record is deleted (delete "India", re-add "India"). | Partial unique indexes, `partialFilterExpression: { isDeleted: false }`, applied by the same plugin |
| INV-4 | Every `EmailFor.triggerKey` is unique and must match an entry in the code trigger registry — picked from a dropdown, never typed freehand, so a trigger key can never point at nothing. | `EmailFor` schema (partial unique index, live + `isDeleted:false`) + `emailFor.controller.js` validates against `apps/server/config/emailTriggers.js` on create/update |
| INV-5 | At most one **active** `EmailTemplate` may reference a given `EmailFor` at a time — closes the ambiguity where `otp.controller.js`'s unsorted lookup picked whichever Mongo returned first. | `emailTemplate.controller.js` duplicate check on create/update when `isActive: true` (mirrors the existing name-uniqueness check in `emailFor.controller.js`) |
| INV-6 | `EmailTemplate`'s subject and body may only use `{{TOKENS}}` declared for their trigger's key in the code registry; an undeclared token blocks the save. | `emailTemplate.controller.js` validation against `apps/server/config/emailTriggers.js` |
| INV-7 | A missing or inactive template for a trigger key never blocks the caller of `sendTriggeredEmail`. The function logs and returns `{ sent: false, reason }`; each call site decides what that means for its own request (forgot-password OTP may still choose to fail its request on this result). | `apps/server/utils/sendTriggeredEmail.js` (never throws on a missing-template lookup) |
| INV-8 | A `SymbolMapping` is looked up by normalized Scrip Name; once confirmed for a name, it is reused automatically on every later import of that same (normalized) name — never re-asked. | import controller, `schema-design`/`api-endpoint` phase |
| INV-11 | A `TrackedStock` is auto-mapped on an **exact match after normalization** (uppercase, punctuation stripped, corporate suffixes — LIMITED/LTD/PVT/CO/COMPANY/INDIA — stripped from both the Scrip Name and the Yahoo Finance search candidate). See [ADR-017](DECISIONS.md). | `matchSymbol` in `apps/server/utils/stockSymbols.js` |
| INV-11a | Failing an exact match, a `TrackedStock` may still auto-map on a **fuzzy match**: Dice's-coefficient bigram similarity between the normalized Scrip Name and a search candidate, scoring ≥ 0.75 (`FUZZY_MATCH_THRESHOLD`, lowered from 0.84 on 2026-09-29 — owner feedback). If two candidates both clear the threshold within 0.03 of each other, neither is applied — an ambiguous pair is left for the confirm-mapping screen rather than guessed. See [ADR-017](DECISIONS.md). | `matchSymbol` in `apps/server/utils/stockSymbols.js` |
| INV-9 | `TrackedStock.crossedAt`, once set, is never cleared by the live-tracking job — a stock never moves back from "Crossed Above" to "Watchlist" on price alone. Only a **replace** import (not an **update** one) clears it, by recreating the row — scoped to the container being replaced; other `Watchlist` containers are untouched. | live-price fetch job, import controller |
| INV-12 | A `TrackedStock` cannot be deleted while a `StockAlert` still references it (same reference-guard convention as every other entity, INV-2). | `deleteTrackedStock` → `getReferencingCounts("TrackedStock", ...)` |
| INV-13 | Adding a stock manually with a Scrip Name that already exists **in the same `Watchlist` container** never silently overwrites or silently creates a duplicate. The caller must choose **Replace** (updates the existing row) or **Duplicate** (a new row, name suffixed `" (Manual)"`, incrementing if that is also taken); the first request with neither choice gets a 409 naming the existing row. The same name in a different container never triggers this — `scripName` is only unique per `watchlist` (DOMAIN.md). | `manualAddStock` |
| INV-14 | `StockAlert.watchlist` is denormalized from its `TrackedStock.watchlist` at creation time — set once, by the job, never recomputed. Keeps the per-container alert list/badge (INV-15) a plain filter instead of a `$lookup` join on every read. | `stockPriceFetch.js`'s `runTick` |
| INV-15 | The header badge count and the Alerts tab are independent per `Watchlist` container (owner's explicit choice, 2026-09-29) — never combined across containers. | `getTodayAlertCount`, `listAlertsByParams` (both require `watchlistId`) |
| INV-16 | Deleting a `Watchlist` container cascades: it soft-deletes (INV-1) every `TrackedStock` and `StockAlert` inside it in the same action, not just the container itself — owner's explicit choice over a "must be empty first" guard, since every real watchlist has stocks in it. `SymbolMapping` is never touched — it is shared across every container (DOMAIN.md), so deleting one watchlist must never affect another's matching or force stocks to be re-matched. | `deleteWatchlist` in `apps/server/controllers/v1/stockTracker.controller.js` |
| INV-10 | A `StockAlert` fires for a given `TrackedStock` at most once per calendar day (Asia/Kolkata) — see FLOW-2. | live-price fetch job, keyed off `TrackedStock.lastAlertedDate` |

## Permissions

<!-- Who may do what. Note that the read/write/delete/edit/print/mail matrix is NOT checked on the
     server — see docs/conventions/30-api.md. If a rule here is a real security boundary, it needs
     an ADMIN_ONLY guard or a server-side check, not a hidden button. -->

| ID | Rule | Enforced in |
|---|---|---|
| PERM-1 | Every Bullish Tracker endpoint is ADMIN-only — no permission-matrix row, since PRD explicitly scopes this to a single user. `confirmMapping`'s `confirmedBy` therefore always refers to an `AdminUser`, never a `User`. | `authMiddleware(ADMIN_ONLY)` on every `stockTracker.routes.js` route; mirrored in `searchSources.js`'s `{ adminOnly: true }` for the two new sources |

## Workflow and state

<!-- Legal transitions, and who may trigger each. If an entity has states, its illegal transitions
     belong here explicitly — the ones nobody wrote down are the ones that ship. -->

| ID | Rule | Enforced in |
|---|---|---|
| FLOW-1 | A `TrackedStock` moves through: **Unmapped** (no `SymbolMapping` yet — sits on the confirm-mapping screen, not live-tracked) → **Watchlist** (mapped, `crossedAt` null, live-tracked, shown with its % proximity) → **Crossed Above** (`crossedAt` set — one-way per INV-9, stays live-tracked). A **replace** import discards all state and starts every row at Watchlist (or Unmapped, if its mapping needs reconfirming) again; an **update** import never moves a row backward. | import controller + live-price fetch job |
| FLOW-2 | An alert (`StockAlert` created, badge count incremented) fires the first time a `TrackedStock` crosses above `target`, and again on any later day it crosses again — but never twice on the same calendar day. | live-price fetch job, `TrackedStock.lastAlertedDate` |
| FLOW-3 | An imported source file's shape is detected, never chosen by the owner. Find the row with `"Scrip Name"` in column A. If it has **3 or more** labelled columns, it's the "Lever Report" shape (Scrip Name / Close / Likely Trading Low-High). If it has **exactly 2** (Scrip Name plus one other, whatever that column is called — seen as both `"Close"`-less and, for real, `"r1"`), the second column is the trigger price directly, no Close, no range. If no `"Scrip Name"` row exists at all, every row where column A is text and column B is a number is read the same way, no header required. Column-count checked, not the header label's text — a differently-named single price column must still work without a code change. | `Watchlist.jsx`'s `parseWorkbookFile` |

## Calculations

<!-- Anything with a formula: totals, tax, pro-rating, rounding. State the rounding rule and the
     currency handling explicitly; "obvious" is where these go wrong. -->

| ID | Rule | Enforced in |
|---|---|---|
| CALC-1 | Proximity % = `((target − livePrice) ÷ livePrice) × 100`. Positive while below target, zero at the moment of crossing, negative once above it. Recomputed on every fetch, not stored separately. | admin UI column / API response, from `TrackedStock.target` and `.livePrice` |

## Deviations from convention

<!-- Rules that required breaking something in docs/conventions/. Each must have an approved ADR in
     DECISIONS.md. Empty is the healthy state. -->

| ID | Deviation | ADR |
|---|---|---|
| | | |
