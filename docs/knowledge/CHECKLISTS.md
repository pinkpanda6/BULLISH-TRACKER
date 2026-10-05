# Checklists

> **TEMPLATE — the standard checklist below is real and applies now.** The per-module section is
> filled in by `grill-me` and `system-design`.

## Standard module checklist

Every module that adds a collection, endpoints and a screen. The `verify` skill walks this.

**Data** — [docs/conventions/20-schema.md](../conventions/20-schema.md)

- [ ] Model in `apps/server/models/`, with `trim`, `isActive`, `{ timestamps: true }`
- [ ] Indexes on every `ref`, every filterable field, and every business-unique key
- [ ] Unique constraints are real indexes, not just a controller `findOne`
- [ ] Backfill script written if a required field was added to an existing collection
- [ ] Delete semantics decided: guarded by `getReferencingCounts`, or documented as unguarded
- [ ] Delete sets `isDeleted` — no `findByIdAndDelete`/`deleteOne` outside genuinely ephemeral data
- [ ] `npm run seed` run against any existing database, to backfill and rebuild the unique indexes

**API** — [docs/conventions/30-api.md](../conventions/30-api.md)

- [ ] All six endpoints, or a written reason for the ones omitted
- [ ] `/search` uses `runListQuery` with `searchFields` and a `filterable` allowlist
- [ ] `filterable` matches the entity config's `filterFields` exactly
- [ ] Every route has an `authMiddleware` guard, and the role choice was deliberate
- [ ] Request validation chain (`allowOnlyFields` + express-validator)
- [ ] Delete calls `getReferencingCounts` and returns the 409 shape
- [ ] Responses use `{ isOk, status, message, data }`, and `isOk` agrees with the HTTP status
- [ ] No password or internal error string in any response body
- [ ] Swagger JSDoc on every route
- [ ] `endpoints.jsx` entry + `*.api.jsx` wrapper in `apps/admin/src/api/`

**UI** — [docs/conventions/40-frontend.md](../conventions/40-frontend.md)

- [ ] Entity config, not a page file — or a stated reason why a page file was necessary
- [ ] Registered in `UNIFORM_ENTITIES` or `ADVANCED_ENTITIES`
- [ ] `columns`, `fields`, `sections`, `filterFields`, `recordTitle` all present
- [ ] Every `sortable` column has a `sortField` that appears in the server's `filterable`
- [ ] Permissions gate the add button and row actions
- [ ] Semantic Tailwind tokens only; dark mode checked
- [ ] **Menu row added to `apps/server/seed/index.js` and `npm run seed` re-run**

**Verify** — the `verify` skill

- [ ] A runnable check exists for every piece of non-trivial logic
- [ ] `npm test` passes
- [ ] Exercised by hand: create, list, search, filter, sort, view, edit, delete
- [ ] The delete reference-guard path was actually triggered and renders correctly
- [ ] Checked as a non-admin user, not just as admin

**Record** — the `update-docs` skill

- [ ] `DOMAIN.md` and `RULES.md` updated
- [ ] ADR in `DECISIONS.md` closed with what was actually built
- [ ] Anything unresolved moved to `OPEN-QUESTIONS.md`

## Per-module checklists

<!-- One section per module from the PRD, listing what "done" means for that module specifically:
     the acceptance criteria, the edge cases that must be handled, the rules from RULES.md it must
     satisfy. The standard checklist above still applies to each. -->

### Stock watchlist import & NSE/Yahoo symbol mapping

Module 1 of the Bullish Tracker (see STATE.md). Builds `TrackedStock`, `SymbolMapping`, the monthly
upload screen (with the replace/update button, INV-8, FLOW-1's Unmapped state) and the
confirm-mapping review screen. No live price fetch yet — that is module 2.

- [x] `.xlsx` parser for the "Lever Report" shape (Scrip Name, Close, "Likely Trading Low-High"
      range string) — parses the High bound out of the range, drops the Low (per "Not modelled").
      Client-side (`Watchlist.jsx`, the `xlsx` package): finds the "Scrip Name" header row rather
      than assuming a fixed row number, server-side (`parseLikelyTradingRange`) extracts the High
      bound and validates the shape.
- [x] Name-matching algorithm against NSE's symbol list — no maintained master list (ADR-017):
      `SymbolMapping` cache first, then Yahoo Finance's own search endpoint filtered to NSE equities;
      auto-applies only an exact match after normalization (INV-11), no fuzzy score.
- [x] `SymbolMapping` cache: auto-created on confident match, looked up by normalized name on every
      import before matching runs again (INV-8) — verified: a manually-confirmed name is not
      re-searched or re-asked on a later `update` import.
- [x] Confirm-mapping screen: every unmapped row shows a "Match" button opening a live Yahoo Finance
      search picker, saves to `SymbolMapping` and points the `TrackedStock` at it.
- [x] Import screen has the replace/update button (PRD scope item 3); replace soft-deletes and
      recreates `TrackedStock` wholesale (INV-1: never a hard delete), update upserts by `scripName`
      without touching `crossedAt`, `livePrice` or rows absent from the new sheet.
- [x] Acceptance check: imported real rows from `nse 9.xlsx` end to end (HTTP, then the real browser
      UI with the real file). "3P LAND HOLDINGS LIMITED" and "Wipro Ltd." auto-matched correctly.
      "ABB Ltd." correctly did *not* auto-match — Yahoo Finance's search ranks the Swiss parent
      company (also legitimately "ABB Ltd") above the NSE-listed Indian subsidiary for that exact
      query, a real limitation of the approach for globally-ambiguous names, not a bug — confirmed
      the manual screen resolves it in one search ("ABB India" surfaces `ABB.NS`). Re-imported the
      same name afterward: no longer needs review (INV-8 holds).
- [x] **Follow-up (user request, 2026-09-29)**: per-row edit (Scrip Name/Close/Target, plus
      "change matched symbol" reusing the confirm-mapping picker) and delete (soft, reference-guarded
      — INV-12) on every Watchlist/Crossed Above/Needs Review row; a "Add stock" button for entering
      a stock by hand outside the monthly import, going through the same matching as an import row;
      adding a Scrip Name that already exists prompts Replace vs. Duplicate rather than guessing
      (INV-13). Verified against the real, live 437-stock watchlist (not fixtures) via both the HTTP
      API and the real browser UI: add → 409 on a real duplicate ("Wipro Ltd.") → both "Replace" and
      "Add as a separate entry" (confirmed the `" (Manual)"` suffix) → edit → delete, all correct;
      confirmed the real, pre-existing 437 rows were never touched by any of this (checked the active
      count before and after). Cleaned up every row this check added.
- [x] **Follow-up (user request, 2026-09-29)**: multiple named `Watchlist` containers, each with its
      own imports/targets/tabs (create + rename; delete deliberately deferred, `OPEN-QUESTIONS.md`
      A-6), and a second import file shape — just a Scrip Name and a trigger price, no header row
      required, auto-detected alongside the original shape (FLOW-3). `SymbolMapping` stays global
      across every container by design; the price-fetch job runs across every container's mapped
      stocks in one shared cycle; alerts/the header badge are independent per container (not
      combined). Real, careful migration of the existing 436 live stocks and 47 live alerts into a
      default "Watchlist 1" — verified counts before and after via the raw collections, not assumed.
      Verified end to end against the real database: created a second container, imported a genuine
      two-column `.xlsx` (no header row at all) into it, confirmed auto-matching and Needs Review
      both worked, renamed the container, switched back to Watchlist 1 and confirmed all 436 real
      rows were completely unaffected the whole time. Cleaned up every row/container this check
      added, confirmed by exact count afterward.

### Live price tracking & bullish-crossover alerts

Module 2 of the Bullish Tracker (see STATE.md). Depends on module 1's mapped `TrackedStock` rows.
Builds the per-minute fetch job, the % proximity column, `StockAlert`, the header badge, the
Watchlist/Crossed Above tabs.

- [x] Live-price fetch: Yahoo Finance's `spark` endpoint (unauthenticated, unlike `quote` — ADR-018),
      `symbol` from `SymbolMapping`, batched 20 at a time over all mapped `TrackedStock` rows, once a
      minute, Mon-Fri 9:15-15:30 IST only (addresses the "No background jobs" limit in
      60-limits.md — in-process `setInterval`, no queue).
- [x] % proximity column (CALC-1). Every column, including this one, is a real clickable
      ascending/descending sort (user request, 2026-09-29) — `proximityPercent` is computed via
      `$addFields` in the aggregation and sorted server-side across the whole watchlist, not just
      the loaded page; CALC-1 itself is still never stored (`OPEN-QUESTIONS.md` A-5, resolved).
- [x] Crossing detection sets `crossedAt` (first time or on any later re-cross) and creates a
      `StockAlert`, respecting the once-per-calendar-day dedup (FLOW-2, INV-10) — `applyPrice` unit
      tested directly against all four cases, and confirmed again with real DB writes in `verify`.
- [x] Watchlist tab (crossedAt null) and Crossed Above tab (crossedAt set, showing the date),
      one-way move enforced (INV-9, FLOW-1).
- [x] Header badge shows today's alert count (`AlertBadge.jsx`, polls `today-count`); the Alerts tab
      lists `StockAlert` rows, populated with the stock's name.
- [x] Acceptance check: real Yahoo Finance data end to end, not fixtures. Imported Wipro with a
      deliberately low target and TCS with a real target above its price, manually ran the job's own
      tick logic (real market was closed at test time) to fetch real prices, confirmed one crossing
      and one still-watching stock, then drove the actual browser UI: badge showed "1" and linked to
      `/watchlist?tab=alerts` with that tab pre-selected, the % column matched CALC-1 by hand on both
      rows, Crossed Above showed Wipro with its date, Alerts showed the populated row. Ran the tick
      a second time immediately after the first crossing: no second alert, confirming INV-10 holds
      against a real database, not just the unit test. Same-day-vs-next-day re-crossing (FLOW-2's
      other half) is covered by the `applyPrice` unit test, not re-proven against a live market
      (would need to wait for an actual multi-day cycle).

### Email trigger system (dynamic form → template routing)

Scope for this module: the generic mechanism plus the one real trigger site, `otp.controller.js`.
No new consumer form is built (see PRD out-of-scope). See `docs/email-trigger-system.md` for the
background and `docs/knowledge/DECISIONS.md` for the ADR this module produces.

- [x] `apps/server/config/emailTriggers.js`: code registry, trigger key → declared merge fields +
      description, at least one entry (`password.forgot`)
- [x] `EmailFor` gains `triggerKey` (INV-4); backfill the existing "Forget Password" row
- [x] `GET /email-for/triggers` endpoint lists the registry, each entry flagged with the `EmailFor`
      that already claims it (if any), for the create/edit dropdown
- [x] Duplicate-active-template guard on `EmailTemplate` (INV-5) — partial unique index + friendly
      409 pre-check
- [x] Merge-field validation on `EmailTemplate` save against the trigger's declared tokens (INV-6)
- [x] `apps/server/utils/sendTriggeredEmail.js`: the shared function — resolve trigger key → active
      `EmailFor` → active `EmailTemplate`, fill merge fields, send via nodemailer, never throw on a
      missing-template lookup (INV-7); pure helpers (`fillMergeFields`, `validateMergeTokens`,
      `extractTokens`) unit-tested in `sendTriggeredEmail.test.js`
- [x] `otp.controller.js`'s `createOtp` refactored to call `sendTriggeredEmail("password.forgot",
      ...)` instead of its inline lookup/replace/send block; kept its current caller-side behaviour
      on a failed lookup (404, per its existing UX) by mapping the returned `reason`
- [x] `EmailFor`/`EmailTemplate` admin screens updated: `triggerKey` dropdown (not free text) on the
      `EmailFor` form, filtered to unclaimed triggers (+ the record's own current one when editing);
      declared merge fields shown read-only on the `EmailTemplate` form via a new `renderExtra` panel
- [x] `60-limits.md`'s "Email has exactly one wired sender" limit closed/updated to reflect the new
      shared function
- [x] Acceptance check (browser + HTTP, against the real dev database — see STATE.md log): trigger
      dropdown offered exactly the one registered trigger, then emptied once claimed; the claimed
      EmailFor's trigger column showed correctly on the list; the merge-field hint on Email Template
      showed `{{USERNAME}}`/`{{OTP_CODE}}` for the selected Email For, in both light and dark mode —
      confirmed a second time as a non-admin role. A real OTP send delivered end to end through the
      trigger path; the 400 undeclared-token rejection and the 409 duplicate-active-template
      rejection were both triggered directly and returned their exact messages (`verify`,
      2026-09-08).
- [x] Client-facing docs updated: `email-for`/`email-template` gotchas cover the trigger dropdown,
      the merge-field tokens, the one-active-template guard, and the `unassigned.*` edit trap;
      screenshots recaptured; confirmed readable as a non-admin role in both themes (`client-docs`,
      2026-09-09).
