# Product requirements

## What this is

An internal, single-user panel for tracking NSE-listed stocks against a monthly "likely trading
high" target price, and alerting the owner in-app the moment a stock's live price crosses above its
target. Built on a generic admin-panel starter (users, roles, dashboards, SEO, email) which also
carries the internal-tooling modules already shipped on it (audit trail, dynamic email triggers,
client documentation, global search) — but the stock tracker is the project's headline feature.

## Who uses it

<!-- One row per actor. "Role" maps to a RoleMaster record; ADMIN and USER are the only coarse
     roles the server knows about — see docs/conventions/30-api.md. -->

| Actor | What they do | Role |
|---|---|---|
| Site owner (single user) | Uploads the monthly NSE watchlist, confirms uncertain stock-name matches, watches live prices vs. targets, reviews the "Crossed Above" alert list | ADMIN |

## Scope

### In scope

<!-- Numbered list of capabilities. Each one should be traceable to a module in CHECKLISTS.md. -->

1. **Client-facing documentation** — an in-app documentation section the client's end users open
   from the sidebar, explaining what each screen is for and how to use it. Pages are generated per
   module as part of the build pipeline (phase 7.5, the `client-docs` skill) from the screen's own
   configuration, with written explanation added in the same pass, and illustrated with screenshots
   captured automatically from the running app. Screenshots regenerate only for screens whose inputs
   changed. See [ADR-010](DECISIONS.md). Agreed 2026-08-28.
2. **Dynamic email triggers** — "which email template fires for which form/event" becomes data
   instead of hardcoded per-controller lookup-and-replace code. Every trigger site (starting with the
   one that exists today, forgot-password OTP) gets a stable `triggerKey` on `EmailFor`, picked from
   a code registry rather than typed freehand, and calls one shared `sendTriggeredEmail(triggerKey,
   {...})` function instead of duplicating the lookup/fill/send steps. One template per trigger (no
   fan-out) — a form needing two emails fires two trigger keys. Missing/inactive template never
   blocks the caller; it logs and returns a result the caller can inspect. See
   [docs/email-trigger-system.md](../email-trigger-system.md) and the ADR this module produces.
   Agreed 2026-09-07.

### Explicitly out of scope

<!-- The most valuable section in this file. What was considered and deliberately excluded, and
     why. Prevents rebuilding the same argument in three months. -->

- **MkDocs Material as a separate documentation site.** Considered as the original proposal for the
  client documentation and declined: it is Python, and this is a Node-only repo with a Node-only
  deploy, so it would add an interpreter and a second build toolchain to every machine and every
  server. Its output is also a standalone static site, which cannot be an ordinary menu row behind
  the ordinary session cookie. Reconsider only if the documentation must also be published publicly
  at its own domain. See [ADR-010](DECISIONS.md). Decided 2026-08-28.
- **A new public-facing form (Contact Us, Job application) as part of the email trigger module.**
  These were illustrative examples in `docs/email-trigger-system.md`, not a real requirement — this
  repo has no public website to submit such a form from. The module builds the generic mechanism and
  migrates the one real trigger site (forgot-password OTP) onto it; a real second trigger is future
  work once an actual form needs one. Decided 2026-09-07.
- **A trigger resolving to more than one template.** Considered and declined for now: the one
  fan-out case anyone named (a visitor thank-you plus an internal notification from one submission)
  is met by firing two trigger keys from the same form event, not by teaching one trigger to resolve
  to many templates. Reconsider if a real case needs one submission to *atomically* fire a set of
  templates the caller shouldn't have to enumerate. Decided 2026-09-07.
3. **Stock watchlist import & NSE/Yahoo symbol mapping** — upload the monthly "Lever Report" .xlsx
   (Scrip Name, Close, Likely Trading Low-High). Each Scrip Name is matched to its live-data ticker
   (NSE symbol + `.NS`, as used by Yahoo Finance); confident matches apply automatically, uncertain
   or failed ones go to a manual confirm screen. A confirmed mapping is cached and reused
   automatically on every later import of the same name — never re-asked. At import time the owner
   picks, via a button, whether the new sheet **replaces** the whole watchlist (this month's list is
   the list — targets, crossed state and all, start fresh) or **updates** it in place (existing
   stocks' Close/target refreshed, new stocks added, stocks absent from the new sheet left as they
   are). Agreed 2026-09-29.
4. **Live price tracking & bullish-crossover alerts** — every mapped stock's live price is fetched
   from Yahoo Finance once a minute during NSE market hours (Mon-Fri, 9:15-15:30 IST). Each stock
   shows a proximity column, `((likely trading high − live price) ÷ live price) × 100`, so the
   closest-to-target stocks are easy to spot. The first time a stock's live price crosses above its
   "Likely Trading High", it is flagged (an in-app alert list plus a header badge count) and moved to
   a separate "Crossed Above" tab showing the date it crossed; it stays there for the rest of the
   month even if the price later dips back below target (a one-way move). It keeps being tracked
   there, so if it crosses again on a later day the date updates and a fresh alert fires — at most
   once per stock per calendar day. Agreed 2026-09-29.
5. **Multiple watchlist containers, and a second import file shape** — the owner can create,
   rename and switch between any number of named watchlists ("Watchlist 1", "Watchlist 2", ...),
   each with its own imports, its own targets, its own Watchlist/Crossed Above/Needs Review/Alerts
   tabs, laid out identically to the original single-watchlist screen. Alerts and the header badge
   are independent per container, not combined (owner's explicit choice — a crossing in one
   watchlist should not be lost in another's count). `SymbolMapping` stays global: a name confirmed
   in one watchlist is never re-asked in another. The import screen also now recognises a second
   source-file shape — just a Scrip Name and a trigger price in the first two columns, no Close, no
   range, not even a header row required — auto-detected alongside the original "Lever Report"
   shape, never a format the owner has to pick manually. Agreed 2026-09-29.

## Success criteria

<!-- How the client will judge whether this works. Concrete and checkable, not "it should be fast". -->

- Every stock in a monthly import is either auto-matched to its live-data ticker or surfaced on the
  confirm-mapping screen — nothing is silently tracked against the wrong stock.
- A previously confirmed Scrip Name is never asked about again on a later import.
- A stock's live price is refreshed at least once a minute during market hours, and a crossing shows
  up as an in-app alert (list + header badge) without the owner needing to refresh manually.
- The "Crossed Above" tab always shows the correct, most recent crossing date per stock.
- The % proximity column lets the owner sort/scan to see, at a glance, which watched stocks are
  nearest their target.

## Constraints

<!-- Deadlines, integrations that must be used, data that must be migrated, compliance
     requirements, expected scale. Anything that removes an option. -->

- **Live price source**: Yahoo Finance's free, unofficial quote endpoint (NSE symbol + `.NS`), not a
  paid/keyed vendor. No SLA — if it starts blocking or changes shape, the fetch job needs to move to
  a keyed broker/vendor API. Decided 2026-09-29.
- **~440 stocks, one user, any number of named watchlist containers** (scope item 5, 2026-09-29) —
  still not multi-tenancy: every container is visible to the one owner, there is no per-user
  ownership or access split between containers, they are purely an organisational grouping the
  owner creates for themselves.
- **Import cadence is monthly**, matching the source report; not a live/continuous feed replacement.
- **Single Node process.** The per-minute price fetch runs as an in-process timer inside the existing
  `apps/server` process — no queue, no separate worker — per the "No background jobs" limit in
  [60-limits.md](../conventions/60-limits.md). `system-design` decides the exact mechanism.

### Platform decisions (docs/conventions/60-limits.md — "Decide before you build")

| # | Question | Answer |
|---|---|---|
| 1 | Multi-tenant? | No. One shared dataset, one user. |
| 2 | Audit trail retention? | Default (kept indefinitely, same as every other collection) — not compliance data, no special retention needed. |
| 3 | One language or several? | One (English). |
| 4 | Per-screen data scope? | N/A — single user, single role. |
| 5 | Public website consuming this API? | No — fully internal. |

## Deferred

<!-- Agreed, but not now. With the trigger that would bring it forward. -->

- **Client documentation for the six modules already shipped** (Soft delete, Role data scoping,
  Dynamic dashboards, SEO management, Audit trail, Dashboard layout canvas). They predate the
  documentation pipeline and have no user-facing pages. Trigger: the `client-docs` machinery is
  built and working, after which they can be generated in one pass. Agreed 2026-08-28.
