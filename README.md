# Bullish Tracker

An internal, single-user admin panel for tracking NSE-listed stocks against a monthly "Likely
Trading High" target price, built on a Node.js admin-panel starter. The starter layer includes a
cookie-session Express API, a React admin SPA, role-based permissions, generic CRUD screens, audit
history, dashboards, SEO management, configurable email triggers, and a permission-aware global
search; the Bullish Tracker itself is the project's headline feature, being built out module by
module (see [Current project progress](#current-project-progress) below). Projects built from this
starter are documented and delivered through the workflow in [AGENTS.md](AGENTS.md).

## Requirements

- Node.js 22 or later
- npm
- A MongoDB database

## Set up locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the committed environment templates:

   ```bash
   cp apps/server/.env.example apps/server/.env
   cp apps/admin/.env.example apps/admin/.env
   ```

3. In `apps/server/.env`, configure at least the database connection and a strong session secret.
   The optional CORS and public-URL settings are documented in the template. In
   `apps/admin/.env`, set the development API URL when the server is not using the default local
   address. Do not commit either `.env` file.

4. Seed the menu tree and first administrator, then start both applications:

   ```bash
   npm run seed
   npm run dev
   ```

The server defaults to port 7002 and the admin SPA defaults to Vite's development port. Production
serves the built SPA from the Express process; use `npm run serve` for that shape locally.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API and admin SPA together. |
| `npm run seed` | Idempotently seed menus and the first admin user. |
| `npm test` | Run the repository's plain Node assertion checks. |
| `npm run build` | Build the admin SPA into `apps/server/out/admin`. |
| `npm run docs` | Generate and capture the in-app client documentation. Seeds its own disposable fixture database, at `mongodb://127.0.0.1:27017/demo-panel-docs-fixtures` by default — without local MongoDB, set `DOCS_DATABASE` to a URI ending in `/demo-panel-docs-fixtures` on whatever server you do have (e.g. a second database on the same Atlas cluster as `DATABASE`). |
| `npm run serve` | Build the SPA, then start the production-shaped server. |

## Repository layout

| Path | Contents |
|---|---|
| `apps/server` | Express API, Mongoose models, session authentication, seed data, and production static hosting. |
| `apps/admin` | Vite and React administrative interface. CRUD screens are usually entity configuration, not standalone pages. |
| `packages/shared` | Shared constants and pure helpers used by more than one workspace. |
| `docs/conventions` | Frozen starter conventions, architecture, API, frontend, collaboration, and deployment guidance. |
| `docs/knowledge` | Project-specific requirements, decisions, module board, and open questions. |

Read the [architecture guide](docs/conventions/10-architecture.md) before changing a workspace.
The [working agreement](AGENTS.md) defines the required design, verification, documentation, and
shipping pipeline.

## Current project progress

This board is synchronized from [the project state](docs/knowledge/STATE.md) before a change is
shipped. `done` means that phase passed its relevant workflow; `-` is planned work and `n/a` does
not apply to that module.

| Module | Design | Schema | API | UI | Verified | Docs | Shipped |
|---|---|---|---|---|---|---|---|
| Soft delete | done | done | done | n/a | done | done | done |
| Role data scoping (server-side enforcement) | done | done | done | done | done | done | done |
| Dynamic dashboards (widget builder + per-role assembly) | done | done | done | done | done | done | done |
| SEO management (pages, redirects, 404 log, sitemap, public API) | done | done | done | done | done | done | done |
| Audit trail (who changed what, when) | done | done | done | done | done | done | done |
| Reports (saved filtered lists + export) | - | - | - | - | - | - | - |
| Analytics | - | - | - | - | - | - | - |
| Dashboard layout canvas (drag/resize on the assign screen) | done | n/a | n/a | done | done | done | done |
| Client documentation (generated pages + auto screenshots) | done | n/a | n/a | done | done | done | done |
| Email trigger system (dynamic form → template routing) | done | done | done | done | done | done | done |
| Global search (records, logs and screens, from the header) | done | n/a | done | done | done | done | wip |
| Stock watchlist import & NSE/Yahoo symbol mapping | done | done | done | done | done | done | - |
| Live price tracking & bullish-crossover alerts | done | done | done | done | done | done | - |

## Open project questions

The following records are open in [OPEN-QUESTIONS.md](docs/knowledge/OPEN-QUESTIONS.md). They are
known constraints for contributors, not completed features.

| ID | Current question | Affects |
|---|---|---|
| Q-1 | Duplicate active menu rows can cause the admin client to resolve permissions against an older menu record. The project needs a decision on deduplication, safer seeding, and updating existing role matrices. | Reliable non-admin controls on Email, Client, and Project screens. |
| Q-2 | A legacy `EmailFor` record with an `unassigned.*` trigger cannot be safely edited because its trigger is absent from the current registry. The project needs a decision on preserving that value or requiring reassignment. | Editing legacy/backfilled Email For rows without an accidental trigger change. |

## Contributor documentation

- [Architecture](docs/conventions/10-architecture.md)
- [Server and data conventions](docs/conventions/20-schema.md)
- [API conventions](docs/conventions/30-api.md)
- [Admin frontend conventions](docs/conventions/40-frontend.md)
- [Collaboration and branching](docs/conventions/50-collaboration.md)
- [Deployment](docs/conventions/70-deployment.md)
- [Project decisions](docs/knowledge/DECISIONS.md)
- [Project state and session log](docs/knowledge/STATE.md)
