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
