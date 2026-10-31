# Recurra

Subscription billing for Indian businesses, in INR with GST.

Recurra covers the whole recurring-revenue loop: product catalog, plans, quotations,
subscriptions, a daily billing run, invoices with PDFs, payments, credit notes, finance
reports and a self-service portal for customers. It was built for the Odoo x Makeaton
hackathon.

The part we spent the most time on is billing correctness. You can run billing twice, run it
after a crash, or run it after the scheduler missed a week, and each period still gets
exactly one invoice. After every run a scanner checks for money that slipped through anyway
(periods nobody billed, invoices that bill the same days twice, payments nobody allocated)
and lets an admin fix each one from the UI.

> The project started as **Brightloop One** and was renamed to Recurra late in the
> hackathon. The UI, emails and docs say Recurra. The code still uses the old codename in a
> few places: the `@brightloop/*` package names, the database name and user (`brightloop`)
> and the seeded login emails (`@brightloop.in`). They work as they are, so we left them.

---

## Contents

- [Running it](#running-it)
- [Logins](#logins)
- [What's in it](#whats-in-it)
- [Bugs we hit and how we fixed them](#bugs-we-hit-and-how-we-fixed-them)
- [Five-minute demo](#five-minute-demo)
- [How billing avoids double invoices](#how-billing-avoids-double-invoices)
- [Revenue integrity scanner](#revenue-integrity-scanner)
- [Demo dataset](#demo-dataset)
- [Architecture](#architecture)
- [API](#api)
- [Performance](#performance)
- [Tests and CI](#tests-and-ci)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)

---

## Running it

### Option 1: Docker (easiest)

You need Docker Desktop and nothing else.

```bash
git clone https://github.com/Hassan-2305/odooxmakeaton.git
cd odooxmakeaton
docker compose up --build
```

The first build takes a few minutes. When the api container logs that it's listening, open:

| What     | Where                                      |
| -------- | ------------------------------------------ |
| Web app  | http://localhost:3000                      |
| API      | http://localhost:4000/api/health           |
| Mailpit  | http://localhost:8025 (every email the app sends lands here) |
| Postgres | `localhost:5432`, user/password `brightloop` / `brightloop` |

On every start the api container applies migrations and runs the base seed. The seed skips
itself if the admin already exists, so restarts don't duplicate data. Source folders are
mounted into the containers, so code changes reload on their own.

To load the big demo dataset (5,000 subscriptions, six months of history and three planted
problems for the scanner to find):

```bash
SEED_DEMO=true docker compose up --build
```

On Windows PowerShell, use `$env:SEED_DEMO="true"; docker compose up --build`.

It takes about six minutes, and it **wipes and reloads the data on every container start**
while the variable is set. Start once with it, then go back to plain `docker compose up`.

To stop: `docker compose down`. To also delete the database: `docker compose down -v`.

### Option 2: Run on your machine

You need Node 20+, pnpm and a Postgres 16. The easiest way to get Postgres and Mailpit is to
start only those two from compose:

```bash
docker compose up -d postgres mailpit

pnpm install
cp .env.example .env        # defaults already point at the compose Postgres and Mailpit
pnpm db:migrate
pnpm db:seed
pnpm dev                    # api on :4000, web on :3000
```

Optional, for the full demo data:

```bash
pnpm db:seed:demo --reset --with-faults
```

### Environment variables

All of them have working defaults for local development (`.env.example`):

| Variable         | Default                                                   | Notes |
| ---------------- | --------------------------------------------------------- | ----- |
| `DATABASE_URL`   | `postgres://brightloop:brightloop@localhost:5432/brightloop` | |
| `SESSION_SECRET` | `change-me-to-a-long-random-string`                       | Change it anywhere real |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025`                             | Mailpit |
| `MAIL_FROM`      | `Recurra <no-reply@recurra.local>`                        | |
| `APP_URL`        | `http://localhost:3000`                                   | Used in password-reset links |
| `BUSINESS_TZ`    | `Asia/Kolkata`                                            | Decides what "today" means for billing |
| `SEED_DEMO`      | `false`                                                   | Docker only, see above |

---

## Logins

These are seeded for development and demos. Change or remove them before deploying anywhere.

| Role     | Email                                             | Password       |
| -------- | ------------------------------------------------- | -------------- |
| Admin    | `admin@brightloop.in`                             | `Admin@12345`  |
| Staff    | `priya@brightloop.in`, `arjun@brightloop.in`      | `Staff@12345`  |
| Customer | `customer01@example.in` to `customer20@example.in` | `Customer@123` |
| Demo customer (demo dataset only) | `demo.customer@example.in` | `Demo@12345` |

- **Admin** can do everything: staff accounts, catalog, discounts, credit notes and
  resolving integrity findings.
- **Staff** handle day-to-day work: customers, subscriptions, billing runs, invoices,
  payments and reports. They can read the catalog and templates but not change them, and
  they can review and dismiss findings but not resolve them.
- **Customers** only get the portal, and only ever see their own records.

---

## What's in it

**Accounts and access**
- Registration, login, logout, cookie sessions and CSRF protection on every write.
- Password reset by email with a single-use, expiring token.
- Three roles (admin, staff, customer), checked in middleware on every route.
- Only admins can create staff accounts.

**Catalog**
- Products with attributes and variants. For example, the Brand attribute's "Odoo" value
  adds ₹560 to the ERP price.
- GST taxes, both exclusive (added on top) and inclusive (already inside the price).
- Recurring plans: weekly, monthly, quarterly and annual. Each plan sets whether it can be
  paused, whether it can be closed early, a minimum quantity, whether it renews, whether it
  auto-closes, and a validity window.

**Discounts**
- Percent or fixed amount, for the whole order or one product, with optional coupon codes,
  minimum quantity, minimum amount, validity dates and usage limits.
- Usage limits hold under concurrency. Two invoices racing for the last use of a coupon
  can't both get it.

**Quotations and subscriptions**
- Quotation templates (plan, lines, validity) that turn into a subscription in one click.
- Subscription lifecycle: draft → quotation → confirmed → active → paused / closed. Every
  status change goes through one transition map, and anything not in the map is rejected.
- Prices are copied onto the subscription lines when you add them, so a later catalog price
  change doesn't silently change what an existing customer pays.

**Billing**
- A daily billing run at 01:00 IST, plus manual runs from the UI.
- Dry run mode shows exactly what a live run would invoice, without writing anything.
- Catch-up: if days were missed, one run bills every overdue period in order.
- Period maths handles month ends (a subscription anchored on the 31st bills on 28/29 Feb
  and 30 April).
- Every run is recorded with a line per subscription: `created`, `already_billed`,
  `skipped` or `failed`.

**Invoices, payments and credit notes**
- Sequential invoice numbers like `INV-000123`.
- Tax rates are copied onto each invoice line, so old invoices never change when a tax rate
  changes.
- Confirmed invoices can't be edited. Corrections go through credit notes (admin only).
- PDF invoices, which can also be emailed to the customer.
- Payments with allocations: one payment can cover several invoices, or several payments
  one invoice. Partial payments are supported.
- All money is stored as whole paise (integers). Nothing is ever a float. Rounding is half
  up, per line, and the line amounts always add up to the invoice total.

**Reports and dashboard**
- MRR, revenue, overdue total, aging buckets (0–30, 31–60, 61–90, 90+ days), collections
  and upcoming renewals. All of it is computed in SQL over the full dataset, not in the
  browser.
- The dashboard updates live over server-sent events when invoices or payments change.

**Revenue integrity**
- A scanner with three rules (missing invoice, duplicate invoice, unallocated payment),
  each showing how much money is involved.
- A review workflow (open → confirmed → dismissed / resolved) with notes and history.
- Two fixes run from the finding itself: **Generate invoice** and **Allocate payment**.
  Both go through the normal billing and payment code, not a shortcut.

**Customer portal**
- Customers see their profile, subscriptions, invoices (with PDFs) and payments, and can
  raise requests.
- The customer ID always comes from the session, never from the request, so you can't see
  someone else's invoice by changing an ID in the URL.

**Audit log**
- Every write to invoices, payments, credit notes, discounts and staff leaves a row saying
  who changed what, with before and after values. Admins can browse it.

---

## Bugs we hit and how we fixed them

Problems we found while building and testing, and what we did about each.

### 1. Billing the same period more than once

This was the problem we designed against from day one. A naive billing job ("find
subscriptions due today, create invoices") double-bills in all of these cases:

- someone clicks "Run billing" twice,
- the cron job and a manual run start at the same moment,
- the server crashes halfway, and the rerun bills the first half again,
- the scheduler was down for three days, and the catch-up overlaps with today's run.

We fixed it at three levels, so it doesn't depend on any one of them being right:

1. **The database refuses it.** There is a unique constraint on
   `invoices (subscription_id, period_start)`. Even if the code had a bug, Postgres won't
   store a second invoice for the same period.
2. **Runs take turns per subscription.** Each period locks its subscription row
   (`SELECT … FOR UPDATE`). Two runs racing on the same subscription simply wait for each
   other.
3. **Each period is its own transaction.** The invoice is created and `next_invoice_date`
   moves forward in the same transaction. A crash leaves every finished period committed
   and the rest untouched, so the rerun continues where it stopped.

When a run finds an invoice already exists, it records the period as `already_billed`
with the existing invoice number and moves on. The test suite runs billing, runs it again
and even rewinds `next_invoice_date` by hand, and checks that zero extra invoices appear.

### 2. Duplicate invoices the constraint couldn't see

The unique constraint only catches two invoices that start on the *same day*. An invoice
for 2–31 March next to one for 1–31 March bills almost the same month twice, and the
constraint lets it through. Our first `duplicate_invoice` rule had the same blind spot,
because it also grouped by `period_start`.

**Fix:** the rule now checks whether billing periods *overlap*, treating them as half-open
ranges `[start, end)` so back-to-back months don't count. The earliest invoice is treated
as the original, and every later one that overlaps it becomes a finding, with the exact
overlapping days and "void the duplicate" as the suggested action.

### 3. The demo seed was quietly removing the double-billing protection

To plant a fake duplicate invoice for the demo, the seed script used to *drop* the unique
constraint, insert a copy and rely on the next run to put the constraint back. If that next
run never happened, the database was left with no double-billing protection at all.

**Fix:** the seed never touches the constraint now. The planted duplicate is a real invoice
whose period starts one day later, created through the normal invoice code, which is
exactly the overlap case from bug 2. The script also refuses to run if the constraint is
missing, and tells you how to rebuild the database.

### 4. The live event stream had no login check

`GET /api/events` (server-sent events) went out before sessions were finished. Anyone who
could reach the API could open it and watch every invoice and payment event go by.

**Fix:** the stream now requires a session. Admin and staff get every event. Customers only
get events that carry their own customer ID, and events with no customer (such as "billing
run finished") are never sent to them.

### 5. Slow lists at 5,000 subscriptions

Once the demo data reached 5,000 subscriptions and 13,000 invoices, the default
"newest first" lists and the date filters started doing full table scans. The invoice list
was also loading a large JSON customer snapshot for every row, though the list never shows
it.

**Fix:** indexes on the columns the lists sort and filter by (`created_at`, `issue_date`,
`expiry_date`, `paid_on`, `started_at`), and the invoice list no longer selects the
snapshot column. Every endpoint now answers in well under 100 ms (see
[Performance](#performance)).

### 6. Coupon usage limits could be exceeded

Checking "uses left > 0" and then incrementing the count are two separate steps. Two
invoices at the same moment could both pass the check and push a 10-use coupon to 11.

**Fix:** the discount row is locked with `SELECT … FOR UPDATE` while it is consumed, so
concurrent uses queue up and the limit holds. There's a test that fires uses in parallel.

### 7. Tests that failed only sometimes

The API tests share one Postgres database. Vitest ran test files in parallel, so rows from
one file showed up in another file's counts and integrity scans, and tests failed at
random.

**Fix:** API test files run one after another (`fileParallelism: false`).

### Smaller things worth knowing

- **Timezones.** "Today" for billing is the business date in `Asia/Kolkata`, not the
  server's UTC date. Otherwise a run at 01:00 IST would bill for yesterday.
- **Month ends.** Anchor days are clamped, so a subscription that started on 31 January
  bills on the last day of February instead of skipping a month or erroring.
- **One bad subscription doesn't stop the run.** It is recorded as `failed` and the run
  moves on to the next one.
- **Scans can't overlap.** The integrity scanner takes a Postgres advisory lock, so a scan
  started by a billing run and one started by hand never run at the same time.

---

## Five-minute demo

Load the demo dataset first (`SEED_DEMO=true docker compose up --build`, or
`pnpm db:seed:demo --reset --with-faults`), then sign in as the admin.

1. **Dashboard.** MRR, overdue amount, aging buckets and upcoming renewals across all
   5,000 subscriptions.
2. **New subscription from a template.** Pick *Starter ERP*, confirm it and move it through
   its states: quotation → confirmed → active → paused → closed.
3. **Billing runs.** Do a **dry run** to preview today's invoices. Then do a **live run**,
   and then **run it again**. The second run reports everything as `already_billed` and
   creates nothing.
4. **Revenue integrity.** Three planted problems are waiting, each with its rupee amount.
   Use *Generate invoice* on the missing invoice and *Allocate payment* on the unallocated
   ₹5,000 transfer. Look at the duplicate to see the overlapping days.
5. **Invoices and payments.** Open an overdue invoice, download the PDF, record a partial
   payment and issue a credit note. Keep the dashboard open in another tab and watch it
   update.
6. **Customer portal.** Sign out and sign in as `demo.customer@example.in` / `Demo@12345`.
   You'll see only Sunrise Demo Pvt Ltd's subscriptions, invoices and payments.
7. **Email.** Open Mailpit at http://localhost:8025 to see sent invoices and
   password-reset emails.

---

## How billing avoids double invoices

A billing run picks up every active subscription whose `next_invoice_date` is on or before
the business date. For each due period:

1. Lock the subscription row.
2. In a savepoint, build the invoice: copy prices from the subscription lines, apply the
   eligible discounts (and use them up), copy the tax rates and work out the totals in
   paise.
3. Insert it. If the unique `(subscription_id, period_start)` constraint fires, roll back
   the savepoint and record `already_billed`.
4. Move `next_invoice_date` forward by one period, in the same transaction.
5. Repeat while the next period is still due (catch-up), up to a safety limit of 400
   periods per subscription.

Plans that auto-close are closed when their term ends instead of being billed again. A dry
run executes this exact code inside a transaction that is always rolled back, so the
preview can't drift from what a live run does. A live run finishes with an integrity scan.

---

## Revenue integrity scanner

The scanner runs after every live billing run, and on demand from the UI or
`POST /api/integrity/scan`. All rules run as SQL in one transaction.

| Rule | Severity | What it finds | Amount shown |
| ---- | -------- | ------------- | ------------ |
| `missing_invoice` | high | An active subscription more than a day past its next invoice date, with no invoice for that period | that period's amount |
| `duplicate_invoice` | high | An invoice whose period overlaps an earlier, non-cancelled invoice for the same subscription | the duplicate's total |
| `unallocated_payment` | medium | A payment whose allocations add up to less than the amount received | the unallocated part |

Each finding is keyed by rule and record, so rescanning updates it instead of making a new
copy. If the problem goes away, the next scan closes the finding on its own. If the problem
comes back, the finding reopens. Every status change, with its note, is kept on the finding
and in the audit log.

A full scan over the demo dataset takes about 260 ms.

---

## Demo dataset

`pnpm db:seed:demo` builds a realistic dataset on top of the base seed. Everything goes
through the real services. No invoice or payment is inserted with raw SQL.

- About 300 customers and **5,000 subscriptions** across the four plans, started over the
  last six months. Around 3% are closed and 2% are paused.
- **About 13,000 invoices.** The script replays the last six months day by day with a fake
  clock and calls the real billing run for each day, just as the scheduler would have.
- Payments: about 70% of invoices are paid in full, 15% partly paid and 15% unpaid, which
  leaves roughly 10% overdue today.
- It finishes with a scan and prints the totals and the open findings: 0 normally, exactly
  3 with `--with-faults`.

| Flag            | What it does |
| --------------- | ------------ |
| `--reset`       | Empties every table except `settings` (invoice numbers restart at 1), then reruns the base seed |
| `--with-faults` | Plants one missing invoice, one overlapping duplicate invoice and one unallocated ₹5,000 payment |
| `--subs=<n>`    | Number of subscriptions (default 5000) |

Without `--reset`, the script refuses to run if the demo customer already exists.

The base seed (`pnpm db:seed`) adds the staff and customer logins above, GST 18% exclusive
and GST 12% inclusive taxes, three products (ERP, Cloud Hosting, Support Plan) with two
variants each, four plans (Monthly, Quarterly, Annual, Weekly Trial) and two quotation
templates (Starter ERP, Enterprise Odoo Bundle).

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    Web["Web app<br/>React + Vite + Tailwind + shadcn/ui"]
  end

  subgraph API["API (Express + TypeScript)"]
    direction TB
    MW["Middleware<br/>session · CSRF · roles · zod validation"]
    Routes["Routes<br/>/api/*"]
    Services["Services<br/>business rules"]
    Repos["Repositories<br/>Drizzle queries"]
    Bus["Event bus"]
    Cron["Scheduler<br/>daily billing 01:00 IST"]
    MW --> Routes --> Services --> Repos
    Services --> Bus
    Cron --> Services
  end

  Shared["packages/shared<br/>zod schemas + types"]
  PG[("PostgreSQL 16")]
  Mail["Mailpit (SMTP)"]

  Web -- "REST + cookie session" --> MW
  Bus -- "SSE /api/events" --> Web
  Repos --> PG
  Services -- "invoices, password reset" --> Mail
  Shared -.-> Web
  Shared -.-> API
```

```
apps/api          Express API: routes, services, repositories, Drizzle schema, seeds, scheduler
apps/web          React app: staff back office and customer portal
packages/shared   Zod schemas and types used by both api and web
database/         SQL migrations
.github/          CI workflow
```

**Stack:** Node 20, Express, Zod, Drizzle ORM, PostgreSQL 16, React, Vite, TanStack Query,
React Hook Form, React Router, Tailwind, shadcn/ui, Recharts, PDFKit, node-cron, Nodemailer
with Mailpit, Vitest.

House rules the code follows:

- Money is whole paise. INR only. No floats anywhere near money.
- Requests go routes → zod validation → auth → services → repositories → database.
  Business rules live only in services, and routes never do money maths.
- The same zod schemas validate input in the browser and in the API.
- Status changes only happen through the transition map.
- Customer queries are scoped by the customer ID from the session.

---

## API

Everything is under `/api`. It uses a cookie session, and writes need a CSRF header (get
the token from `GET /api/auth/csrf`). List endpoints take `page`, `pageSize`, `sort` and
filters, and return `{ data, total, tookMs }`.

| Area | Endpoints | Who |
| ---- | --------- | --- |
| Auth | `POST /auth/register` `/login` `/logout` `/forgot-password` `/reset-password`, `GET /auth/me` `/auth/csrf` | anyone |
| Staff and customers | `POST /staff` (admin), `GET/POST/PATCH/DELETE /customers` | admin, staff |
| Catalog | `/products` (with attributes and values), `/variants`, `/taxes`, `/plans` | read: staff, write: admin |
| Discounts | `/discounts` | admin |
| Quotations | `/quotation-templates` | read: staff, write: admin |
| Subscriptions | `GET/POST /subscriptions`, `POST /subscriptions/from-template/:id`, `POST /subscriptions/:id/transition` | admin, staff |
| Billing | `POST /billing/runs?mode=dry\|live`, `GET /billing/runs`, `GET /billing/runs/:id` | admin, staff |
| Invoices | `GET/PATCH /invoices`, `POST /invoices/:id/confirm` `/cancel` `/send` `/credit-notes`, `GET /invoices/:id/pdf` | admin, staff (credit notes: admin) |
| Payments | `GET/POST /payments`, `POST /payments/:id/allocations` | admin, staff |
| Reports | `GET /reports/summary` `/aging` `/collections` `/renewals` | admin, staff |
| Integrity | `POST /integrity/scan`, `GET /integrity/findings`, `POST /integrity/findings/:id/dismiss` `/resolve` | admin, staff (resolve: admin) |
| Audit | `GET /audit` | admin |
| Portal | `GET /portal/profile` `/subscriptions` `/invoices` `/invoices/:id` `/invoices/:id/pdf` `/payments`, `POST /portal/requests` | customer, own data only |
| Live updates | `GET /events` (server-sent events) | signed in |
| Health | `GET /health` | anyone |

---

## Performance

With the API running on the demo dataset, `pnpm perf:check` signs in as the admin and as
the demo customer, calls every list, report and portal endpoint five times and prints the
median and worst time. It fails if any endpoint's median goes over 500 ms or its worst
time over 2 s. Options: `--base=http://localhost:4000`, `--runs=5`,
`--save=before.json`, `--compare=before.json`.

Measured locally in Docker on 5,056 subscriptions, 13,279 invoices, 11,255 payments and
326 customers (ms):

| Endpoint | Median | Max |
| -------- | -----: | --: |
| subscriptions (all 5,056) | 13.3 | 13.8 |
| subscriptions, page 100 | 18.5 | 21.3 |
| invoices (all 13,279) | 9.5 | 12.0 |
| invoices, overdue | 11.6 | 12.0 |
| invoices, page 300 | 21.2 | 22.1 |
| payments | 7.2 | 8.9 |
| payments, unallocated | 34.9 | 36.6 |
| customers, search | 7.1 | 8.0 |
| reports/summary | 47.4 | 51.1 |
| reports/aging | 20.2 | 21.8 |
| reports/collections | 16.9 | 19.4 |
| integrity/findings | 6.8 | 8.5 |
| audit (51,203 rows) | 10.5 | 13.0 |
| portal/invoices | 5.7 | 6.3 |

The slowest endpoint is the finance summary, at about 50 ms. `pnpm perf:check` prints the
full list (34 endpoints).

---

## Tests and CI

```bash
pnpm test        # needs the Postgres from DATABASE_URL running
```

Vitest covers every service that touches money, plus the routes that enforce access. Some
of the things the tests check:

- rerunning billing, even after rewinding `next_invoice_date`, creates no duplicates
- three missed months become three invoices, with month-end dates handled
- one failing subscription doesn't stop a billing run
- a dry run writes nothing
- discounts round half up, split amounts that always add up to the total, and hold their
  usage limit under parallel use
- the overlap rule catches shifted duplicates but ignores back-to-back periods
- customers can't see each other's invoices or events
- every write to money tables leaves an audit row

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck and the full test suite
against a fresh Postgres 16 on every pull request.

---

## Scripts

| Command             | What it does |
| ------------------- | ------------ |
| `pnpm dev`          | Run api and web in watch mode |
| `pnpm build`        | Build every package |
| `pnpm lint`         | ESLint over the whole repo |
| `pnpm typecheck`    | Type-check every package |
| `pnpm test`         | Vitest in every package |
| `pnpm db:generate`  | Generate a migration from the Drizzle schema |
| `pnpm db:migrate`   | Apply migrations from `database/migrations` |
| `pnpm db:seed`      | Base seed (logins, catalog, plans, templates) |
| `pnpm db:seed:demo` | Demo dataset, see [Demo dataset](#demo-dataset) |
| `pnpm perf:check`   | Time every list, report and portal endpoint of a running API |

---

## Troubleshooting

**Port 5432, 3000, 4000 or 8025 is already in use.** Something else is using the port,
usually a local Postgres. Stop it, or change the left-hand side of the port mapping in
`docker-compose.yml`.

**My data disappears every time I restart Docker.** `SEED_DEMO=true` is still set in your
shell. Unset it, or start with `SEED_DEMO=false docker compose up`.

**`invoices_subscription_period_unique is missing` when seeding.** The database was seeded
by an old version of the demo script that dropped this constraint (see bug 3). Rebuild it:
`docker compose down -v`, then start again, or drop the database and run `pnpm db:migrate`.

**`db:seed:demo` says the demo customer already exists.** Add `--reset`.

**Tests fail with connection errors.** Start Postgres first (`docker compose up -d
postgres`) and check that `DATABASE_URL` in `.env` points at it.

**No emails arrive.** Nothing is sent to real inboxes. Every email goes to Mailpit at
http://localhost:8025.

---

## Team and workflow

Built by Mohammed Hassan for the Odoo x Makeaton hackathon. Every change went through a
feature branch, a pull request and CI, the same way a team would work. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the branch and commit rules.
