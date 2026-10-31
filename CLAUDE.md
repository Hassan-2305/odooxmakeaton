# Brightloop One — project rules for Claude

Monorepo: apps/api (Express+TS+Drizzle), apps/web (React+Vite+TS+Tailwind+shadcn),
packages/shared (zod schemas + types), database/{migrations,seed}, docker-compose.yml.

Stack is locked: Node 20, Express, Zod, Drizzle, PostgreSQL 16, React, Vite, TanStack Query,
React Hook Form, React Router, shadcn/ui, Recharts, PDFKit, node-cron, Nodemailer+Mailpit, Vitest.
Do NOT introduce: Supabase, NextAuth, Prisma, Redis, microservices, AI APIs, static JSON as data.

Rules:
- Money is integer paise (bigint-safe ints). Currency INR. Never floats for money.
- API layering: routes -> zod validation -> auth middleware -> services -> repositories -> DB.
  Business rules live in services only. Routes never compute money.
- Every list endpoint: ?page&pageSize&sort&filters, returns { data, total, tookMs }.
- Confirmed invoices are immutable; corrections via credit_notes.
- Snapshot prices on subscription_lines and tax rates on invoice_line_taxes.
- All status changes go through a transition map in a transition service; reject others.
- Customer-facing queries are always scoped by customer_id derived from the session, never from input.
- Validate with shared zod schemas from packages/shared on both API and web.
- Every write to invoices/payments/credit_notes/discount_rules/staff writes an audit_log row.
- Write Vitest tests for every service touching money.
- One feature per commit. Conventional commits (feat:, fix:, chore:, test:, docs:).
  Never commit .env. Never force-push. Do not commit until I say the commit message.
- Work on feature branches off main, named <type>/<short-description> (e.g. fix/invoice-rounding).
  Push the branch and merge it through a pull request. Never commit or push to main.
- No Claude attribution: no "Co-Authored-By: Claude" trailers in commits, no "Generated with Claude Code" in PRs.
- After finishing a task, print: files changed, how to test it manually, and the commit message.
