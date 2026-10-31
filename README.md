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

Each customer login is linked to its own customer record (Acme Traders, Bharat Foods, …).
The seed also creates:

- **Taxes:** GST 18% (exclusive) and GST 12% (inclusive)
- **Products:** Brightloop ERP, Cloud Hosting and Support Plan, two variants each.
  The Brand attribute's **Odoo** value adds ₹560.00 (56000 paise) to the ERP price.
- **Plans:** Monthly (pausable), Quarterly, Annual (can't close early, min 5 seats),
  Weekly Trial (auto-closes, not renewable, available during 2026)
- **Quotation templates:** Starter ERP (Monthly, 15 days) and Enterprise Odoo Bundle (Annual, 30 days)

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch and PR rules.
