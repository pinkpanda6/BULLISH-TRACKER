# Domain model

The shared vocabulary for this project. If the client calls it a "consignment", the model, the
endpoint, the screen and the conversation all call it a consignment. Naming drift is how two people
end up building different systems.

## Vocabulary

<!-- Every domain term that is not plain English, with the definition the client uses. Include terms
     that mean something different here than they do elsewhere — those are the expensive ones. -->

| Term | Means |
|---|---|
| Trigger / trigger key | A stable, dot-namespaced machine name for "an event that should fire an email" (e.g. `password.forgot`, `contact-us.submitted`). Declared in a code registry (`apps/server/config/emailTriggers.js`, mirroring `widgetSources.js`) alongside its allowed merge fields; the admin picks one from a dropdown when creating an `EmailFor` row rather than typing it. One trigger key resolves to at most one active `EmailTemplate` — a form needing two emails fires two trigger keys. |
| Merge field | A `{{TOKEN}}` an `EmailTemplate`'s subject/body may use, declared per trigger key in the code registry. A template is validated against its trigger's declared list on save. |
| Scrip name | The stock label as it appears in the monthly "Lever Report" sheet (e.g. "ABB Ltd.", "3P LAND HOLDINGS LIMITED"). Not the exchange's own trading symbol — sometimes close, sometimes not — which is why it needs mapping. |
| Symbol / ticker | The live-data identifier a Scrip Name is mapped to: the NSE trading symbol with a `.NS` suffix (e.g. `ABB.NS`), the form Yahoo Finance expects. |
| Likely Trading High (target) | The upper bound of the "Likely Trading Low-High" range in the monthly sheet, for a given stock. The price a live quote is compared against. The low bound is not tracked (client decision, 2026-09-29). |
| Crossing | The event of a stock's live price moving from at-or-below to above its target. Detected on each per-minute fetch; drives the alert and the move to the "Crossed Above" tab. |
| Proximity % | `((target − live price) ÷ live price) × 100` — how far (in %) the live price still has to rise to reach the target. Goes to zero at the moment of crossing and negative once above it. |

## Entities

**Delete semantics, every entity (ADR-001): guarded soft delete.** Delete refuses while another
record still references the row (`getReferencingCounts`), and otherwise sets `isDeleted` rather than
removing the document. Deleted rows are excluded from every read, so they are invisible in the panel
and to the delete guard, but the data is still there. Nothing cascades. There is no restore screen —
undeleting is a manual database update. A per-entity **Deletable** line below records only whether
that entity can be deleted at all, not how.

Two exceptions. `Otp` and session documents really are removed — they are consumed tokens, not
history. And **Menu Group** and **Menu Master** are the odd ones out: their delete only sets
`isActive: false`, so the row stays visible in the list and can be switched back on. That predates
ADR-001 and was left as is; see the ADR for why the guard cannot simply be added.

<!-- One block per entity. Keep in sync with apps/server/models/ — update-docs is responsible. -->

### EmailSetup

- **Is a**: One SMTP sending account (host, port, SSL, login email, app password).
- **Owned by / scoped to**: global — shared across every `EmailTemplate` that references it.
- **Identified by**: `email` (the login/from address).
- **Lifecycle**: created by an admin in Setup; `isActive` toggled to retire an account without
  breaking templates that still reference it (the reference guard blocks delete while any does).
- **Deletable**: only when no `EmailTemplate` references it (`getReferencingCounts`).

| Field | Type | Notes |
|---|---|---|
| email | String | login/from address |
| appPassword | String, `select: false` | never rides along in an API response; the mailer asks for it explicitly with `.select("+appPassword")` |
| SSL, port, host | Boolean, Number, String | SMTP connection details |
| isActive | Boolean | |

### EmailFor

- **Is a**: A named "why" a trigger fires, now carrying the machine-readable trigger key that makes
  it resolvable from code as well as human-readable in the admin UI.
- **Owned by / scoped to**: global.
- **Identified by**: `triggerKey` (the stable machine name); `emailFor` remains the human label shown
  in the admin UI.
- **Lifecycle**: created by an admin, picking `triggerKey` from the code-registry dropdown (a
  developer must have declared the trigger in `emailTriggers.js` first). `isActive` toggled to
  retire it; a retired `EmailFor` makes its trigger key resolve to "no active template" rather than
  an error.
- **Deletable**: only when no `EmailTemplate` references it (`getReferencingCounts`, pre-existing).

| Field | Type | Notes |
|---|---|---|
| emailFor | String | human label, existing field |
| triggerKey | String | **new.** Required, unique, must match a key in the code registry — picked from a dropdown, not typed |
| isActive | Boolean | existing field |

### EmailTemplate

- **Is a**: The editable content (subject + HTML body, despite the `emailSignature` field name — see
  the naming gotcha in `docs/email-trigger-system.md`) sent for one `EmailFor`/trigger.
- **Owned by / scoped to**: one `EmailFor` (`emailFor` ref) and one `EmailSetup` (`emailFrom` ref).
- **Identified by**: `templateName`.
- **Lifecycle**: created by an admin; `isActive` toggled to take it out of rotation without deleting
  it. At most one active template per `EmailFor` — enforced, not just conventional (see RULES.md
  INV-5).
- **Deletable**: yes, guarded by the existing reference-guard pattern (no other record references an
  `EmailTemplate`).

| Field | Type | Notes |
|---|---|---|
| templateName, mailerName, emailSubject, emailSignature (= body), emailCC, emailBCC | String | existing, unchanged |
| emailFrom | ref EmailSetup | existing |
| emailFor | ref EmailFor | existing — now indirectly carries the trigger key via the ref |
| isActive | Boolean | existing — now also the fan-in point for INV-5 |

### SymbolMapping

- **Is a**: A cached, confirmed match from a raw Scrip Name to its live-data ticker. Persists across
  imports so a name is never re-confirmed once settled.
- **Owned by / scoped to**: global.
- **Identified by**: normalized Scrip Name (case/punctuation/suffix-insensitive, e.g. "ABB Ltd." ≡
  "ABB LIMITED").
- **Lifecycle**: created automatically on first import when the match is confident; created/edited by
  the owner on the confirm-mapping screen when it isn't. Every later import of the same (normalized)
  Scrip Name reuses it without asking again.
- **Deletable**: not exposed for deletion in this module; a wrong mapping is corrected by editing it,
  not removing it (an unmapped `TrackedStock` would otherwise have nothing to fall back to).

| Field | Type | Notes |
|---|---|---|
| scripName | String | raw label as first seen in a sheet |
| normalizedName | String, unique index | uppercase, punctuation/corporate-suffix stripped — the lookup key (INV-8) |
| symbol | String | resolved ticker, e.g. `ABB.NS` |
| longName | String | Yahoo Finance's own display name, for the confirm screen / audit trail |
| matchedAutomatically | Boolean | true = exact-normalized-match auto-apply (INV-11); false = manually confirmed |
| confirmedBy | ref AdminUser, nullable | who confirmed it manually; null on an auto-match |
| isActive | Boolean | standard field; not exposed for deactivation in this module |

### Watchlist

- **Is a**: A named container of `TrackedStock` rows — "Watchlist 1", "Watchlist 2", however many the
  owner creates (scope item 5, 2026-09-29). The unit an import targets and a tab-set (Watchlist /
  Crossed Above / Needs Review / Alerts) is scoped to.
- **Owned by / scoped to**: global — the one owner sees every container; there is no per-container
  access control, only an organisational grouping.
- **Identified by**: `name` (unique index).
- **Lifecycle**: created via "New watchlist" (a name, nothing else); renamed any time. A fresh
  install (or a database predating this feature) gets exactly one, named "Watchlist 1", created
  automatically the first time the list of containers is requested — the UI never has to handle
  "zero containers exist" as a real state.
- **Deletable**: no — removing a whole container (and deciding what happens to its stocks and alert
  history) was deliberately left out of this pass. `OPEN-QUESTIONS.md` A-6.

| Field | Type | Notes |
|---|---|---|
| name | String, unique | shown as the pill/tab label |
| sequence | Number | display order |
| isActive | Boolean | standard field; not exposed for deactivation |

### TrackedStock

- **Is a**: One row per stock tracked in one `Watchlist` container — that container's current import
  target plus the stock's live-tracking state.
- **Owned by / scoped to**: one `Watchlist` (`watchlist` ref, required). The same real stock can be
  tracked in more than one container at once, each with its own `target` — they are independent rows.
- **Identified by**: `scripName`, unique **within its `watchlist`** (compound index) — the natural key
  an import upserts against; also reachable via `symbol` once mapped, through its `SymbolMapping` ref.
- **Lifecycle**: created/updated by a monthly import into one container (**replace**: that
  container's previous rows cleared and recreated wholesale, crossed state included, other
  containers untouched; **update**: existing rows' `close`/`target` refreshed, new stocks added,
  stocks missing from the new sheet left untouched — owner's choice at import time) — or created one
  at a time by hand (user request, 2026-09-29: "Add stock", same matching as an import row). While
  unmapped, sits on that container's confirm-mapping screen and is not live-tracked. Once mapped, its
  live price is refreshed every minute during market hours **regardless of which container it's
  in** — the price-fetch job runs across every container's mapped stocks in one shared cycle — and
  its `crossedAt` is set the first time live price exceeds `target`. `crossedAt` is one-way: once
  set, the row shows in that container's "Crossed Above" tab for the rest of the month regardless of
  later price moves, but keeps being live-tracked so a later re-cross updates `crossedAt` and fires a
  fresh alert (RULES.md FLOW-1). `scripName`/`close`/`target` are directly editable from the
  watchlist (never `symbolMapping` — that goes through the same confirm-mapping flow as an unmapped
  row, reused as "change the match"; never `watchlist` — moving a stock between containers isn't
  supported, only re-add/re-import into the one you want it in).
- **Deletable**: yes, per row, from the watchlist (user request, 2026-09-29) — soft-deleted (INV-1)
  and reference-guarded like every other entity (INV-2): blocked while a `StockAlert` still
  references it. Also still clearable in bulk via a **replace** import, scoped to one container.
- **Uniqueness on manual add**: adding a Scrip Name that already exists **in the same container**
  never silently overwrites or silently duplicates — the owner is asked to **Replace** (updates the
  existing row's `close`/`target`) or **Add as a separate entry** (a second row, name suffixed
  `" (Manual)"`, then `" (Manual 2)"` etc. if that is *also* taken, scoped to the same container).
  Matching still runs against the real company name, not the suffixed label. The same name in a
  *different* container is unrelated — no clash, no prompt.

| Field | Type | Notes |
|---|---|---|
| watchlist | ref Watchlist | which container this row belongs to |
| scripName | String | raw label from the source file |
| symbolMapping | ref SymbolMapping, nullable | null while unmapped |
| close | Number, nullable | the source file's Close price at import time — absent on a two-column (name + trigger price only) source file |
| target | Number | the trigger price to watch for a crossing |
| livePrice | Number, nullable | latest fetched price; null until the first successful fetch |
| lastFetchedAt | Date, nullable | |
| crossedAt | Date, nullable | null = still on the Watchlist tab; set = Crossed Above tab |
| lastAlertedDate | Date (calendar day), nullable | dedup key for FLOW-2 (once per stock per day) |
| isActive | Boolean | standard field; not exposed for deactivation in this module |

### StockAlert

- **Is a**: One row per crossing event — what feeds the in-app alert list and the header badge count.
- **Owned by / scoped to**: one `Watchlist` (`watchlist` ref, denormalized from its `TrackedStock` at
  creation time — see RULES.md INV-14). Independent per container (owner's explicit choice,
  2026-09-29) — the badge and Alerts tab for one watchlist never include another's crossings.
- **Identified by**: nothing client-facing; a log, not a master record.
- **Lifecycle**: created by the live-tracking job when it detects a crossing (subject to FLOW-2's
  once-per-day dedup). Not edited by users.
- **Deletable**: no.

| Field | Type | Notes |
|---|---|---|
| trackedStock | ref TrackedStock | |
| watchlist | ref Watchlist | denormalized — see INV-14 |
| crossedAt | Date | when this particular alert fired |
| priceAtCross | Number | live price at the moment of crossing |
| target | Number | the target it crossed, at that moment |
| isActive | Boolean | standard field; not exposed for deactivation |

## Relationships

<!-- Cardinality and, more importantly, what happens on delete. The delete answer determines the
     reference-guard behaviour in every controller. -->

| From | To | Cardinality | On delete of the parent |
|---|---|---|---|
| EmailTemplate | EmailFor | many : 1, but at most one **active** EmailTemplate per EmailFor (INV-5) | EmailFor delete blocked while any EmailTemplate references it |
| EmailTemplate | EmailSetup | many : 1 | EmailSetup delete blocked while any EmailTemplate references it |
| TrackedStock | SymbolMapping | many : 1, nullable while unmapped | not deletable in this module, so n/a |
| TrackedStock | Watchlist | many : 1 | Watchlist has no delete in this module (A-6), so n/a |
| StockAlert | TrackedStock | many : 1 | TrackedStock delete is reference-guarded by this (INV-2) |
| StockAlert | Watchlist | many : 1, denormalized | Watchlist has no delete in this module, so n/a |

## Not modelled

<!-- Things the client talks about that deliberately have no collection, and why. -->

- **Likely Trading Low.** Present in the source sheet; dropped on import. No downside alert in this
  module. Client decision, 2026-09-29 — revisit if a downside alert is ever wanted.
- **Live price history / time series.** Only the latest fetched price is kept (overwritten each
  minute); no chart was requested. Client decision, 2026-09-29 — revisit if trend charts are wanted.
- **`StockAlert` in the header search.** Every one of its own fields is a ref, a Number or a Date —
  nothing String — and the global search mechanism matches with a plain `.find()`, not a `$lookup`
  aggregation, so it cannot reach through the `trackedStock` ref to search by scrip name the way it
  reads AuditLog's *embedded* `actor.name`. Its stock is already searchable via `TrackedStock`
  itself. Engineering limitation, not a scope decision — revisit if the search mechanism ever grows
  a joined-field mode.
