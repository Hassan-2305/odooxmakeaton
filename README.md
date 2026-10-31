# Brightloop One

> Placeholder — product overview coming soon.

Subscription billing for Indian businesses (INR, GST-ready). Built for the Odoo x Makeaton hackathon.

## Structure

```
apps/api          Express + TypeScript API
apps/web          React + Vite + Tailwind + shadcn/ui
packages/shared   Shared zod schemas and types
database/         Migrations and seed data
```

## Getting started

Requirements: Node 20+, pnpm.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:4000/api/health

## Scripts

| Command          | What it does                       |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Run api and web in watch mode      |
| `pnpm build`     | Build every package                |
| `pnpm lint`      | Lint the whole repo with ESLint    |
| `pnpm test`      | Run Vitest in every package        |
| `pnpm typecheck` | Type-check every package           |

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch and PR rules.
