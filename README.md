# Brightloop One

> Placeholder — product overview coming soon.

Subscription billing for Indian businesses (INR, GST-ready). Built for the Odoo x Makeaton hackathon.

## Structure

```
apps/api          Express + TypeScript + Drizzle API
apps/web          React + Vite + Tailwind + shadcn/ui
packages/shared   Shared zod schemas and types
database/         Migrations and seed data
```

## Run with Docker (recommended)

Requirements: Docker Desktop.

```bash
docker compose up --build
```

| Service  | URL                              |
| -------- | -------------------------------- |
| Web      | http://localhost:3000            |
| API      | http://localhost:4000/api/health |
| Mailpit  | http://localhost:8025            |
| Postgres | localhost:5432 (brightloop / brightloop) |

The api container runs migrations and seeds before starting. Source folders are
mounted, so edits hot-reload. Stop with `docker compose down`; add `-v` to wipe the database.

## Seed accounts

`pnpm db:seed` (and every api container start) loads demo data from
`database/seed/data.ts`. It runs once: if `admin@brightloop.in` exists, it's skipped.
To reseed from scratch, run `docker compose down -v && docker compose up`.

**Dev and demo only. Change or remove these accounts before any real deployment.**

| Role     | Email                                              | Password       |
| -------- | -------------------------------------------------- | -------------- |
| Admin    | `admin@brightloop.in`                              | `Admin@12345`  |
| Staff    | `priya@brightloop.in`, `arjun@brightloop.in`       | `Staff@12345`  |
| Customer | `customer01@example.in` … `customer20@example.in`  | `Customer@123` |
| Demo customer (`db:seed:demo` only) | `demo.customer@example.in` | `Demo@12345` |

Each customer login is linked to its own customer record (Acme Traders, Bharat Foods, …).
The seed also creates:

- **Taxes:** GST 18% (exclusive) and GST 12% (inclusive)
- **Products:** Brightloop ERP, Cloud Hosting and Support Plan, two variants each.
  The Brand attribute's **Odoo** value adds ₹560.00 (56000 paise) to the ERP price.
- **Plans:** Monthly (pausable), Quarterly, Annual (can't close early, min 5 seats),
  Weekly Trial (auto-closes, not renewable, available during 2026)
- **Quotation templates:** Starter ERP (Monthly, 15 days) and Enterprise Odoo Bundle (Annual, 30 days)

## Demo dataset

`pnpm db:seed:demo` loads a large, realistic dataset on top of the base seed, created
entirely through the services (no invoice or payment is written with SQL):

- ~300 customers and 5,000 subscriptions over the Monthly, Quarterly, Annual and Weekly
  Trial plans, started over the last 6 months. About 3% are closed (including trials that
  auto-closed at the end of their term) and 2% are paused.
- Six months of invoice history. The script replays the calendar: the services get an
  injected clock and the real live billing run is called for every business day, the way
  the daily scheduler would have run, with subscriptions in concurrent batches. All invoices are confirmed.
- Payments through the payments service: ~70% of invoices fully paid, ~15% partly paid,
  ~15% unpaid, so that about 10% of invoices are overdue today.
- It ends with an integrity scan and prints counts, the overdue total, the runtime and the
  open findings: 0 without `--with-faults`, exactly 3 with it.

```bash
pnpm db:seed:demo --reset --with-faults   # about 6 minutes for 5,000 subscriptions
```

| Flag            | Effect                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| `--reset`       | Truncate every table except `settings` (document counters restart at 1), then run the base seed |
| `--with-faults` | Plant three faults for the integrity scan (see below)                       |
| `--subs=<n>`    | Number of subscriptions (default 5000)                                      |

Without `--reset` the script refuses to run when the demo customer already exists.

**Demo customer** (portal login): `demo.customer@example.in` / `Demo@12345` (Sunrise Demo
Pvt Ltd). It has 3 subscriptions (Monthly Starter ERP, Quarterly Growth ERP, Monthly
Hosting), one partly paid invoice that is not yet due, and one overdue invoice.

**Planted faults** (`--with-faults`), each detected by an existing integrity rule:

- `missing_invoice`: an active Starter ERP subscription that started 10 days ago and was never billed.
- `duplicate_invoice`: a second confirmed copy of a paid invoice for the same subscription
  period. The schema's `invoices_subscription_period_unique` constraint makes this
  impossible, so the script **drops that constraint in the demo database** to plant it.
  The next run of `db:seed:demo` (with `--reset`) restores the constraint.
- `unallocated_payment`: a ₹5,000 bank transfer with no allocation.

**Docker:** set `SEED_DEMO=true` (e.g. `SEED_DEMO=true docker compose up --build`) and the
api container runs `db:seed:demo --reset --with-faults` after the base seed. This happens on
**every** container start and wipes the data each time. Default `false`.

## Run locally

Requirements: Node 20+, pnpm, and Postgres (e.g. `docker compose up -d postgres mailpit`).

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Scripts

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | Run api and web in watch mode                  |
| `pnpm build`       | Build every package                            |
| `pnpm lint`        | Lint the whole repo with ESLint                |
| `pnpm test`        | Run Vitest in every package                    |
| `pnpm typecheck`   | Type-check every package                       |
| `pnpm db:generate` | Generate a migration from the Drizzle schema   |
| `pnpm db:migrate`  | Apply migrations in `database/migrations`      |
| `pnpm db:seed`     | Run the seed script                            |
| `pnpm db:seed:demo`| Load the demo dataset (see "Demo dataset")     |

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch and PR rules.
