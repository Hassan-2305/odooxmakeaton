// Demo dataset: ~300 customers, <n> subscriptions with six months of billing history,
// payments, one known demo customer and (optionally) three planted integrity faults.
//
//   pnpm db:seed:demo [--reset] [--with-faults] [--subs=5000]
//
// Everything goes through the services, so the data obeys the same rules as the app.
// History is built by replaying the calendar: the services get an injected clock
// (the same seam the tests use) and, for every business day of the last six months,
// subscriptions are quoted/confirmed/activated, paused or closed, and the real live
// billing run is called for that day, as the daily scheduler would have. Invoices
// therefore carry real issue and due dates, and some of them are overdue today.

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  type AuthUser,
  createCustomerSchema,
  createPaymentSchema,
  type PaymentMethod,
  passwordSchema,
  subscriptionFromTemplateSchema,
} from "@brightloop/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { env } from "../config.js";
import { addDays, addMonthsAnchored, startOfDayIn, todayIn } from "../lib/dates.js";
import { createEventBus } from "../lib/events.js";
import { createPasswordHasher } from "../lib/password.js";
import { createAuditRepository, writeAudit } from "../repositories/audit.repository.js";
import { createBillingRunsRepository } from "../repositories/billing-runs.repository.js";
import { createCustomersRepository } from "../repositories/customers.repository.js";
import { createSettingsRepository } from "../repositories/settings.repository.js";
import { createUsersRepository } from "../repositories/users.repository.js";
import { createAuditService } from "../services/audit.service.js";
import { createCustomersService } from "../services/customers.service.js";
import { createDomainServices } from "../services/domain.js";
import { DEMO_CUSTOMER } from "../../../../database/seed/demo.js";
import * as schema from "./schema/index.js";

const startedAt = performance.now();

// ---------------------------------------------------------------------------- args

const { values: flags } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    reset: { type: "boolean", default: false },
    "with-faults": { type: "boolean", default: false },
    subs: { type: "string", default: "5000" },
    concurrency: { type: "string", default: "20" },
  },
});
const SUBS = Number(flags.subs);
const CONCURRENCY = Number(flags.concurrency);
if (!Number.isInteger(SUBS) || SUBS < 10) throw new Error("--subs must be an integer >= 10");
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1) throw new Error("--concurrency must be >= 1");

const CUSTOMER_TARGET = 300;
const HISTORY_DAYS = 183;
const ADMIN_EMAIL = "admin@brightloop.in";


// ---------------------------------------------------------------------------- setup

const tz = env.BUSINESS_TZ;
// A bigger pool than the app's: batches run CONCURRENCY transactions at once.
const pool = new Pool({ connectionString: env.DATABASE_URL, max: CONCURRENCY + 4, connectionTimeoutMillis: 60_000 });
pool.on("error", (err) => console.error("postgres pool error:", err.message));
const db = drizzle(pool, { schema });

/** The services' clock. Moved forward day by day while the history is replayed. */
let clock = new Date();
const now = () => clock;
const realToday = todayIn(tz);
/** 10:00 business time on `date`; the real time for today. */
const setClock = (date: string) => {
  clock = date === realToday ? new Date() : new Date(startOfDayIn(date, tz).getTime() + 10 * 3_600_000);
};

const auditService = createAuditService({ repo: createAuditRepository(db), timezone: tz });
const domain = createDomainServices({
  db,
  auditService,
  eventBus: createEventBus(),
  mailer: { send: async () => {} },
  timezone: tz,
  now,
});
const customersService = createCustomersService({ customers: createCustomersRepository(db) });
const users = createUsersRepository(db);
const runsRepo = createBillingRunsRepository(db);
const settingsRepo = createSettingsRepository(db);

// Deterministic randomness (mulberry32) so two runs on the same day give the same data.
let seed = 0x5eed2026;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;

/** Runs `fn` over `items`, at most `limit` at a time. Rejects on the first failure. */
async function pMap<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const rows = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];
const log = (msg: string) => console.log(`[${((performance.now() - startedAt) / 1000).toFixed(1)}s] ${msg}`);

// ---------------------------------------------------------------------------- reset

const UNIQUE_PERIOD = "invoices_subscription_period_unique";

async function periodConstraintExists() {
  const [row] = await rows<{ n: number }>(sql`select count(*)::int as n from pg_constraint where conname = ${UNIQUE_PERIOD}`);
  return row!.n > 0;
}

if (flags.reset) {
  // Everything except the settings row (business config). Document counters restart at 1.
  const tables = await rows<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename <> 'settings' order by tablename`,
  );
  await db.execute(sql.raw(`truncate table ${tables.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`));
  await db.execute(sql`update settings set next_invoice_seq = 1, next_subscription_seq = 1, next_credit_note_seq = 1`);
  log(`reset: truncated ${tables.length} tables, document counters restarted`);
}

// A previous --with-faults run drops this constraint to plant a duplicate invoice.
if (!(await periodConstraintExists())) {
  const [dup] = await rows<{ n: number }>(sql`
    select count(*)::int as n from (
      select 1 from invoices where subscription_id is not null
      group by subscription_id, period_start having count(*) > 1) d`);
  if (dup!.n > 0) throw new Error(`Duplicate invoices exist and ${UNIQUE_PERIOD} is missing: rerun with --reset`);
  await db.execute(sql.raw(`alter table invoices add constraint ${UNIQUE_PERIOD} unique (subscription_id, period_start)`));
  log(`restored constraint ${UNIQUE_PERIOD}`);
}

// Base seed (admin, staff, 20 customers, catalog, plans, templates). It skips itself
// when the admin already exists.
{
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error("base seed failed");
}

const adminUser = await users.findByEmail(ADMIN_EMAIL);
if (!adminUser) throw new Error(`${ADMIN_EMAIL} not found after the base seed`);
const actor: AuthUser = {
  id: adminUser.id,
  email: adminUser.email,
  name: adminUser.name,
  role: adminUser.role,
  customerId: null,
};

if (await users.findByEmail(DEMO_CUSTOMER.email)) {
  console.error(`demo data already present (${DEMO_CUSTOMER.email} exists). Rerun with --reset.`);
  await pool.end();
  process.exit(1);
}

// ---------------------------------------------------------------------------- catalog

const planRows = await rows<{ id: string; name: string }>(sql`select id, name from recurring_plans`);
const planId = (name: string) => {
  const p = planRows.find((r) => r.name === name);
  if (!p) throw new Error(`plan ${name} missing`);
  return p.id;
};
const variantRows = await rows<{ id: string; product_id: string; sku: string }>(
  sql`select id, product_id, sku from product_variants`,
);
const line = (sku: string, quantity: number) => {
  const v = variantRows.find((r) => r.sku === sku);
  if (!v) throw new Error(`variant ${sku} missing`);
  return { productId: v.product_id, variantId: v.id, quantity };
};

// Extra quotation templates for variety in amounts, created through the template service.
const extraTemplates = [
  { name: "Hosting Mumbai", plan: "Monthly", lines: [line("HOST-BOM", 1)] },
  { name: "Hosting Singapore + Priority Support", plan: "Quarterly", lines: [line("HOST-SIN", 2), line("SUP-PRI", 1)] },
  { name: "Growth ERP", plan: "Quarterly", lines: [line("ERP-ODOO", 8), line("HOST-BOM", 1), line("SUP-STD", 1)] },
  { name: "Team ERP Annual", plan: "Annual", lines: [line("ERP-GEN", 15), line("HOST-SIN", 1)] },
  { name: "ERP Trial", plan: "Weekly Trial", lines: [line("ERP-GEN", 2)] },
];
for (const t of extraTemplates) {
  const [existing] = await rows<{ id: string }>(sql`select id from quotation_templates where name = ${t.name}`);
  if (existing) continue;
  await domain.templateService.create({
    name: t.name,
    validityDays: 30,
    recurringPlanId: planId(t.plan),
    notes: "Demo template",
    isActive: true,
    lines: t.lines,
  });
}
const templateRows = await rows<{ id: string; name: string }>(sql`select id, name from quotation_templates`);
const templateId = (name: string) => {
  const t = templateRows.find((r) => r.name === name);
  if (!t) throw new Error(`template ${name} missing`);
  return t.id;
};

/** Templates offered per plan; a template's own plan is overridden where they differ. */
const TEMPLATES_BY_PLAN: Record<string, string[]> = {
  Monthly: ["Starter ERP", "Starter ERP", "Hosting Mumbai", "Growth ERP"],
  Quarterly: ["Growth ERP", "Hosting Singapore + Priority Support", "Starter ERP"],
  Annual: ["Enterprise Odoo Bundle", "Team ERP Annual"],
  "Weekly Trial": ["ERP Trial"],
};

// ---------------------------------------------------------------------------- customers

const PREFIXES = [
  "Aarav", "Bodhi", "Chandra", "Devika", "Ekam", "Falgun", "Gulmohar", "Hari", "Ishan", "Jyoti",
  "Kiran", "Lakshmi", "Madhav", "Nandi", "Om", "Prakash", "Rangoli", "Surya", "Tulsi", "Uday",
  "Varun", "Yamuna", "Zenith", "Neel", "Sahyadri", "Konkan", "Vindhya", "Aravalli",
];
const SUFFIXES = [
  "Traders", "Foods", "Logistics", "Textiles", "Pharma", "Steel", "Interiors", "Electricals",
  "Agro", "Infotech", "Motors", "Ceramics", "Exports", "Hospitality", "Retail", "Packaging",
];
const PLACES: [string, string, string][] = [
  ["Bengaluru", "Karnataka", "29"], ["Mumbai", "Maharashtra", "27"], ["Pune", "Maharashtra", "27"],
  ["Hyderabad", "Telangana", "36"], ["Chennai", "Tamil Nadu", "33"], ["Kolkata", "West Bengal", "19"],
  ["New Delhi", "Delhi", "07"], ["Ahmedabad", "Gujarat", "24"], ["Jaipur", "Rajasthan", "08"],
  ["Kochi", "Kerala", "32"], ["Lucknow", "Uttar Pradesh", "09"], ["Indore", "Madhya Pradesh", "23"],
];
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function demoCustomer(i: number) {
  const [city, state, code] = PLACES[i % PLACES.length]!;
  const name = `${PREFIXES[i % PREFIXES.length]} ${SUFFIXES[Math.floor(i / PREFIXES.length) % SUFFIXES.length]}`;
  const pan = `AAC${LETTERS[i % 24]}${LETTERS[(i * 5) % 24]}${String(1000 + ((i * 53) % 9000)).slice(-4)}${LETTERS[(i * 3) % 24]}`;
  return createCustomerSchema.parse({
    name: i >= PREFIXES.length * SUFFIXES.length ? `${name} ${i}` : name,
    email: `accounts${String(i + 1).padStart(3, "0")}@demo.example.in`,
    phone: `+91 97${String(10000000 + i * 7919).slice(-8)}`,
    gstin: i % 5 === 4 ? null : `${code}${pan}1Z${(i % 9) + 1}`,
    addressLine1: `${20 + (i % 180)}, ${["Industrial Area", "Main Road", "Tech Park", "Bazaar Street"][i % 4]}`,
    city,
    state,
    postalCode: String(110001 + ((i * 7919) % 800000)).slice(0, 6),
    country: "IN",
  });
}

const [{ n: existingCustomers }] = (await rows<{ n: number }>(sql`select count(*)::int as n from customers`)) as [
  { n: number },
];
const toCreate = Math.max(0, CUSTOMER_TARGET - 1 - existingCustomers);
await pMap(
  Array.from({ length: toCreate }, (_, i) => i),
  CONCURRENCY,
  (i) => customersService.create(demoCustomer(i)),
);

// The known demo customer, with a portal login.
const hasher = createPasswordHasher(10);
passwordSchema.parse(DEMO_CUSTOMER.password);
const demoUser = await users.createCustomerUser({
  name: DEMO_CUSTOMER.name,
  email: DEMO_CUSTOMER.email,
  passwordHash: await hasher.hash(DEMO_CUSTOMER.password),
});
const demoCustomerId = demoUser.customerId!;
await customersService.update(demoCustomerId, {
  phone: "+91 98765 43210",
  gstin: "29AACDS1234K1Z5",
  addressLine1: "42, Residency Road",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560025",
});

const customerRows = await rows<{ id: string }>(sql`select id from customers where id <> ${demoCustomerId} order by created_at, id`);
/** Payment terms per customer; longer terms leave more invoices not yet due. */
const termsByCustomer = new Map(customerRows.map((c) => [c.id, pick([15, 15, 30, 30, 45])]));
termsByCustomer.set(demoCustomerId, 15);
log(`customers: ${customerRows.length + 1} (demo customer ${DEMO_CUSTOMER.email})`);

// ---------------------------------------------------------------------------- plan the history

interface PlannedSub {
  key: number;
  customerId: string;
  plan: string;
  template: string;
  startDate: string;
  expiryDate: string | null;
  /** Lifecycle event after activation, on `eventDate`. */
  event?: { to: "paused" | "closed"; date: string; note: string };
  id?: string;
}

const firstDay = addDays(realToday, -HISTORY_DAYS);
const planned: PlannedSub[] = [];

// Demo customer: three subscriptions with known shapes.
planned.push(
  { key: 0, customerId: demoCustomerId, plan: "Monthly", template: "Starter ERP", startDate: addDays(realToday, -150), expiryDate: null },
  { key: 1, customerId: demoCustomerId, plan: "Quarterly", template: "Growth ERP", startDate: addDays(realToday, -120), expiryDate: null },
  { key: 2, customerId: demoCustomerId, plan: "Monthly", template: "Hosting Mumbai", startDate: addDays(realToday, -40), expiryDate: null },
);

for (let k = planned.length; k < SUBS; k++) {
  // Skewed: a few customers hold many subscriptions.
  const customerId = customerRows[Math.floor(customerRows.length * rand() ** 1.6)]!.id;
  const r = rand();
  const plan = r < 0.015 ? "Weekly Trial" : r < 0.16 ? "Annual" : r < 0.38 ? "Quarterly" : "Monthly";
  const startDate = addDays(realToday, -randInt(1, HISTORY_DAYS));
  let expiryDate: string | null = null;
  if (plan === "Weekly Trial") expiryDate = addDays(startDate, 28);
  // Fixed terms ending in the next months, so renewals have something to show.
  else if ((plan === "Monthly" || plan === "Quarterly") && rand() < 0.25) {
    expiryDate = addMonthsAnchored(startDate, pick([7, 9, 12]), Number(startDate.slice(8)));
  }
  planned.push({ key: k, customerId, plan, template: pick(TEMPLATES_BY_PLAN[plan]!), startDate, expiryDate });
}

// ~3% closed (trials that auto-close at the end of their term count) and ~2% paused.
const autoClosing = planned.filter((s) => s.plan === "Weekly Trial" && s.expiryDate! <= realToday).length;
const closeTarget = Math.max(0, Math.round(SUBS * 0.03) - autoClosing);
const pauseTarget = Math.round(SUBS * 0.02);
const candidates = planned.filter((s) => s.customerId !== demoCustomerId && s.plan !== "Weekly Trial");
for (const s of candidates.filter((c) => c.plan === "Monthly" && c.startDate <= addDays(realToday, -30)).sort(() => rand() - 0.5).slice(0, pauseTarget)) {
  s.event = { to: "paused", date: addDays(s.startDate, randInt(15, Math.max(15, daysUntilToday(s.startDate) - 1))), note: "Customer asked to pause" };
}
// Monthly and Quarterly plans can be closed early; Annual cannot.
for (const s of candidates.filter((c) => !c.event && c.plan !== "Annual" && c.startDate <= addDays(realToday, -40)).sort(() => rand() - 0.5).slice(0, closeTarget)) {
  s.event = { to: "closed", date: addDays(s.startDate, randInt(20, Math.max(20, daysUntilToday(s.startDate) - 1))), note: "Customer churned" };
}

function daysUntilToday(date: string) {
  return Math.round((Date.parse(`${realToday}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
const startsOn = groupBy(planned, (s) => s.startDate);
const eventsOn = groupBy(planned.filter((s) => s.event), (s) => s.event!.date);

// ---------------------------------------------------------------------------- replay

let invoicesCreated = 0;
let billingRunsCount = 0;
let billingSeconds = 0;

for (let day = firstDay; day <= realToday; day = addDays(day, 1)) {
  setClock(day);

  // 1. New subscriptions: quotation from a template, confirmed, activated.
  await pMap(startsOn.get(day) ?? [], CONCURRENCY, async (s) => {
    const input = subscriptionFromTemplateSchema.parse({
      customerId: s.customerId,
      startDate: s.startDate,
      recurringPlanId: planId(s.plan),
      expiryDate: s.expiryDate,
      paymentTermsDays: termsByCustomer.get(s.customerId),
    });
    const quotation = await domain.subscriptionService.fromTemplate(actor, templateId(s.template), input);
    await domain.subscriptionService.transition(actor, quotation.id, { to: "confirmed" });
    await domain.subscriptionService.transition(actor, quotation.id, { to: "active" });
    s.id = quotation.id;
  });

  // 2. Pauses and closures scheduled for today.
  await pMap(eventsOn.get(day) ?? [], CONCURRENCY, async (s) => {
    if (!s.id) return;
    await domain.subscriptionService.transition(actor, s.id, { to: s.event!.to, note: s.event!.note });
  });

  // 3. The live billing run for this business day, in concurrent batches of subscriptions.
  const t0 = performance.now();
  const due = await runsRepo.dueSubscriptionIds(db, day);
  const batchSize = Math.max(25, Math.ceil(due.length / CONCURRENCY));
  const batches: string[][] = [];
  for (let i = 0; i < due.length; i += batchSize) batches.push(due.slice(i, i + batchSize));
  const results = await Promise.all(
    batches.map((subscriptionIds) =>
      domain.billingService.run({
        mode: "live",
        trigger: "scheduled",
        actor: null,
        businessDate: day,
        subscriptionIds,
        skipIntegrityScan: true,
      }),
    ),
  );
  billingSeconds += (performance.now() - t0) / 1000;
  billingRunsCount += results.length;
  const created = results.flatMap((r) => r.items.filter((i) => i.outcome === "created").map((i) => i.invoiceId!));
  const failed = results.flatMap((r) => r.items.filter((i) => i.outcome === "failed"));
  if (failed.length) throw new Error(`billing failed on ${day}: ${failed[0]!.reason}`);
  invoicesCreated += created.length;

  // 4. Invoices are confirmed the day they are issued.
  await pMap(created, CONCURRENCY, (id) => domain.invoiceActionsService.confirm(actor, id));

  if (day.endsWith("-01") || day === realToday) {
    log(`replayed to ${day}: ${planned.filter((s) => s.id).length} subscriptions, ${invoicesCreated} invoices`);
  }
}
setClock(realToday);
log(`billing: ${billingRunsCount} live runs, ${invoicesCreated} invoices, ${billingSeconds.toFixed(1)}s in billing`);

// ---------------------------------------------------------------------------- payments

interface OpenInvoice {
  id: string;
  customer_id: string;
  total_paise: number;
  issue_date: string;
  due_date: string;
  subscription_id: string;
}

const allInvoices = await rows<OpenInvoice>(sql`
  select id, customer_id, total_paise::int as total_paise, issue_date::text, due_date::text, subscription_id
  from invoices where status = 'confirmed' and total_paise > 0
  order by due_date, id`);

type Plan = "paid" | "partial" | "unpaid";
const decisions = new Map<string, Plan>();

// Demo customer: one partially paid invoice (not yet due if possible), one overdue, the rest paid.
{
  const mine = allInvoices.filter((i) => i.customer_id === demoCustomerId);
  const partial = [...mine].reverse().find((i) => i.due_date >= realToday) ?? mine.at(-1)!;
  const overdue = [...mine].reverse().find((i) => i.due_date < realToday && i.id !== partial.id)!;
  for (const i of mine) decisions.set(i.id, i.id === partial.id ? "partial" : i.id === overdue.id ? "unpaid" : "paid");
}

// Everyone else: ~30% outstanding (half partial, half unpaid), placed so that ~10% of
// invoices are past due. The past-due picks lean towards recent invoices.
{
  const rest = allInvoices.filter((i) => i.customer_id !== demoCustomerId);
  const total = rest.length;
  const pastDue = rest.filter((i) => i.due_date < realToday);
  const notDue = rest.filter((i) => i.due_date >= realToday);
  const outstanding = Math.round(total * 0.3);
  let fromPast = Math.min(Math.round(total * 0.1), pastDue.length);
  const fromNotDue = Math.min(outstanding - fromPast, notDue.length);
  fromPast = Math.min(pastDue.length, outstanding - fromNotDue);

  const age = (i: OpenInvoice) => daysUntilToday(i.due_date);
  const weighted = pastDue
    .map((i) => ({ i, key: rand() ** (1 + age(i) / 30) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, fromPast)
    .map((x) => x.i);
  const shuffledNotDue = [...notDue].sort(() => rand() - 0.5).slice(0, fromNotDue);
  for (const i of [...weighted, ...shuffledNotDue]) decisions.set(i.id, rand() < 0.5 ? "partial" : "unpaid");
  for (const i of rest) if (!decisions.has(i.id)) decisions.set(i.id, "paid");
}

const METHODS: PaymentMethod[] = ["bank_transfer", "bank_transfer", "upi", "upi", "card", "cheque", "cash"];
const payable = allInvoices.filter((i) => decisions.get(i.id) !== "unpaid");
await pMap(payable, CONCURRENCY, async (inv, n) => {
  const full = decisions.get(inv.id) === "paid";
  const amountPaise = full ? inv.total_paise : Math.max(100, Math.round((inv.total_paise * randInt(25, 75)) / 100));
  const terms = termsByCustomer.get(inv.customer_id) ?? 15;
  let paidOn = addDays(inv.issue_date, randInt(0, terms + 10));
  if (paidOn > realToday) paidOn = realToday;
  const method = pick(METHODS);
  const input = createPaymentSchema.parse({
    customerId: inv.customer_id,
    method,
    amountPaise,
    paidOn,
    reference: method === "cash" ? undefined : `${method === "cheque" ? "CHQ" : "UTR"}${String(700000 + n)}`,
    allocations: [{ invoiceId: inv.id, amountPaise }],
  });
  await domain.paymentService.create(actor, input);
});
log(`payments: ${payable.length} recorded`);

// ---------------------------------------------------------------------------- faults

if (flags["with-faults"]) {
  const victim = customerRows[7]!.id;

  // 1. missing_invoice: an active subscription that started 10 days ago and was never billed
  //    (activated after the last billing run).
  const tenDaysAgo = addDays(realToday, -10);
  setClock(tenDaysAgo);
  const unbilled = await domain.subscriptionService.fromTemplate(
    actor,
    templateId("Starter ERP"),
    subscriptionFromTemplateSchema.parse({ customerId: victim, startDate: tenDaysAgo, notes: "Planted fault: never billed" }),
  );
  await domain.subscriptionService.transition(actor, unbilled.id, { to: "confirmed" });
  await domain.subscriptionService.transition(actor, unbilled.id, { to: "active" });
  setClock(realToday);

  // 2. duplicate_invoice: the schema's unique (subscription_id, period_start) constraint
  //    makes this impossible, so it is dropped here (demo database only; the next run of
  //    this script restores it) and an invoice is copied as a second confirmed invoice.
  console.warn(`WARNING: dropping ${UNIQUE_PERIOD} to plant a duplicate invoice; rerun with --reset to restore it`);
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`alter table invoices drop constraint ${UNIQUE_PERIOD}`));
    const [original] = (
      await tx.execute(sql`
        select i.id from invoices i where i.status = 'paid' and i.customer_id <> ${demoCustomerId}
        order by i.issue_date desc, i.id limit 1`)
    ).rows as { id: string }[];
    const number = await settingsRepo.nextNumber(tx, "invoice");
    const [copy] = (
      await tx.execute(sql`
        insert into invoices (number, subscription_id, customer_id, billing_run_id, status, currency,
          period_start, period_end, issue_date, due_date, customer_snapshot, subtotal_paise,
          discount_total_paise, tax_total_paise, total_paise, amount_paid_paise, confirmed_at)
        select ${number}, subscription_id, customer_id, billing_run_id, 'confirmed', currency,
          period_start, period_end, issue_date, due_date, customer_snapshot, subtotal_paise,
          discount_total_paise, tax_total_paise, total_paise, 0, now()
        from invoices where id = ${original!.id}
        returning id`)
    ).rows as { id: string }[];
    await tx.execute(sql`
      with src as (select * from invoice_lines where invoice_id = ${original!.id}),
      copied as (
        insert into invoice_lines (invoice_id, kind, subscription_line_id, product_id, variant_id,
          description, quantity, unit_price_paise, amount_paise, sort_order)
        select ${copy!.id}, kind, subscription_line_id, product_id, variant_id,
          description, quantity, unit_price_paise, amount_paise, sort_order from src
        returning id, sort_order)
      insert into invoice_line_taxes (invoice_line_id, tax_id, name, rate_bps, inclusive,
        taxable_amount_paise, tax_amount_paise)
      select c.id, t.tax_id, t.name, t.rate_bps, t.inclusive, t.taxable_amount_paise, t.tax_amount_paise
      from invoice_line_taxes t join src s on s.id = t.invoice_line_id join copied c on c.sort_order = s.sort_order`);
    await writeAudit(tx, {
      actorUserId: null,
      action: "invoice.created",
      entityType: "invoice",
      entityId: copy!.id,
      before: null,
      after: { number, duplicateOf: original!.id, source: "seed:demo planted fault" },
    });
  });

  // 3. unallocated_payment: money received with no invoice matched to it.
  await domain.paymentService.create(
    actor,
    createPaymentSchema.parse({
      customerId: victim,
      method: "bank_transfer",
      amountPaise: 500_000,
      paidOn: realToday,
      reference: "UTR-UNMATCHED-001",
      notes: "Planted fault: not allocated",
      allocations: [],
    }),
  );
  log("faults planted: missing_invoice, duplicate_invoice, unallocated_payment");
}

// ---------------------------------------------------------------------------- report

const scan = await domain.integrityService.scan(actor);

const count = async (q: ReturnType<typeof sql>) => (await rows<{ n: number }>(q))[0]!.n;
const grouped = async (q: ReturnType<typeof sql>) =>
  Object.fromEntries((await rows<{ k: string; n: number }>(q)).map((r) => [r.k, r.n]));
const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const summary = {
  customers: await count(sql`select count(*)::int as n from customers`),
  subscriptions: await grouped(sql`select status::text as k, count(*)::int as n from subscriptions group by 1 order by 1`),
  invoices: await grouped(sql`select status::text as k, count(*)::int as n from invoices group by 1 order by 1`),
  payments: (await rows<{ n: number; amount: number }>(
    sql`select count(*)::int as n, coalesce(sum(amount_paise), 0)::bigint as amount from payments`,
  ))[0]!,
  overdue: (await rows<{ n: number; amount: number }>(sql`
    select count(*)::int as n, coalesce(sum(i.total_paise - i.amount_paid_paise - coalesce(c.credited, 0)), 0)::bigint as amount
    from invoices i
    left join lateral (select sum(total_paise) as credited from credit_notes cn
                       where cn.invoice_id = i.id and cn.status = 'confirmed') c on true
    where i.status = 'confirmed' and i.due_date < ${realToday}::date
      and i.total_paise - i.amount_paid_paise - coalesce(c.credited, 0) > 0`))[0]!,
  openFindings: await grouped(
    sql`select rule::text as k, count(*)::int as n from integrity_findings where status = 'open' group by 1 order by 1`,
  ),
};
const totalInvoices = Object.values(summary.invoices).reduce((a, b) => a + b, 0);
const openFindings = Object.values(summary.openFindings).reduce((a, b) => a + b, 0);
const expectedFindings = flags["with-faults"] ? 3 : 0;

console.log("\n=== demo dataset ===");
console.log(`customers       ${summary.customers}`);
console.log(`subscriptions   ${Object.entries(summary.subscriptions).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`invoices        ${totalInvoices}: ${Object.entries(summary.invoices).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`payments        ${summary.payments.n} (${inr(Number(summary.payments.amount))})`);
console.log(
  `overdue         ${summary.overdue.n} invoices (${((summary.overdue.n / totalInvoices) * 100).toFixed(1)}%), ${inr(Number(summary.overdue.amount))}`,
);
console.log(`integrity scan  detected ${scan.detected} in ${scan.tookMs} ms`);
console.log(
  `open findings   ${openFindings}${openFindings ? ` (${Object.entries(summary.openFindings).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""} — expected ${expectedFindings}`,
);
console.log(`demo login      ${DEMO_CUSTOMER.email} / ${DEMO_CUSTOMER.password}`);
console.log(`runtime         ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);

await pool.end();
if (openFindings !== expectedFindings) {
  console.error(`expected ${expectedFindings} open findings, found ${openFindings}`);
  process.exit(1);
}
