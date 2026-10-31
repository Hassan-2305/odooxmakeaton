// Calls every list and report endpoint against a running API, 5 times each, and prints
// median/max wall time plus the server's own tookMs.
//
//   pnpm perf:check [--base=http://localhost:4000] [--runs=5] [--save=file.json] [--compare=file.json]
//
// Logs in as the seed admin and as the demo customer (pnpm db:seed:demo).

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEMO_CUSTOMER } from "../../../../database/seed/demo.js";
import { SEED_PASSWORDS, admin } from "../../../../database/seed/data.js";

const { values: flags } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    base: { type: "string", default: process.env.PERF_BASE_URL ?? "http://localhost:4000" },
    runs: { type: "string", default: "5" },
    save: { type: "string" },
    compare: { type: "string" },
  },
});
const BASE = flags.base!.replace(/\/$/, "");
const RUNS = Number(flags.runs);
const TARGET_MEDIAN_MS = 500;
const TARGET_MAX_MS = 2000;

/** A signed-in client: session and CSRF cookies kept between calls. */
async function signIn(email: string, password: string) {
  const jar = new Map<string, string>();
  const keep = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      jar.set(pair!.slice(0, i), pair!.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  keep(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken, cookie: cookie() },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login as ${email} failed: ${login.status} ${await login.text()}`);
  keep(login);

  return async function get(path: string): Promise<{ ms: number; body: unknown }> {
    const start = performance.now();
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookie() } });
    const body: unknown = await res.json();
    const ms = performance.now() - start;
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    return { ms, body };
  };
}

const staff = await signIn(admin.email, SEED_PASSWORDS.admin);
const portal = await signIn(DEMO_CUSTOMER.email, DEMO_CUSTOMER.password);

// Ids for typical filters: the customer of the oldest subscription (the seed's customer
// skew gives the first customers the most subscriptions), a plan, a portal invoice.
const firstOf = async (path: string) => ((await staff(path)).body as { data: { id: string }[] }).data[0]!;
const busyCustomer = ((await firstOf("/api/subscriptions?sort=createdAt&pageSize=1")) as unknown as { customerId: string })
  .customerId;
const planId = (await firstOf("/api/plans")).id;
const portalInvoice = ((await portal("/api/portal/invoices")).body as { data?: { id: string }[] } | { id: string }[]);
const portalInvoiceId = (Array.isArray(portalInvoice) ? portalInvoice : portalInvoice.data!)[0]!.id;

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const endpoints: { name: string; path: string; as?: "portal" }[] = [
  { name: "subscriptions", path: "/api/subscriptions" },
  { name: "subscriptions active", path: "/api/subscriptions?status=active&sort=-startDate&pageSize=50" },
  { name: "subscriptions by customer", path: `/api/subscriptions?customerId=${busyCustomer}` },
  { name: "subscriptions by plan", path: `/api/subscriptions?planId=${planId}&sort=nextInvoiceDate` },
  { name: "subscriptions expiring 60d", path: "/api/subscriptions?expiringWithinDays=60&sort=expiryDate" },
  { name: "subscriptions page 100", path: "/api/subscriptions?page=100&pageSize=20" },
  { name: "invoices", path: "/api/invoices" },
  { name: "invoices overdue", path: "/api/invoices?overdue=true&sort=dueDate&pageSize=50" },
  { name: "invoices confirmed", path: "/api/invoices?status=confirmed&sort=-dueDate" },
  { name: "invoices by customer", path: `/api/invoices?customerId=${busyCustomer}` },
  { name: "invoices last 30d", path: `/api/invoices?from=${daysAgo(30)}&to=${today}&sort=-issueDate` },
  { name: "invoices page 300", path: "/api/invoices?page=300&pageSize=20" },
  { name: "payments", path: "/api/payments" },
  { name: "payments by customer", path: `/api/payments?customerId=${busyCustomer}` },
  { name: "payments unallocated", path: "/api/payments?unallocated=true" },
  { name: "payments last 30d", path: `/api/payments?from=${daysAgo(30)}&to=${today}` },
  { name: "customers", path: "/api/customers" },
  { name: "customers search", path: "/api/customers?q=traders" },
  { name: "customers by city", path: "/api/customers?city=Mumbai&sort=name" },
  { name: "reports/summary", path: "/api/reports/summary" },
  { name: "reports/summary 6 months", path: `/api/reports/summary?from=${daysAgo(183)}&to=${today}` },
  { name: "reports/summary customer", path: `/api/reports/summary?customer_id=${busyCustomer}` },
  { name: "reports/aging", path: "/api/reports/aging" },
  { name: "reports/collections", path: `/api/reports/collections?from=${daysAgo(183)}&to=${today}` },
  { name: "reports/renewals", path: "/api/reports/renewals?days=90" },
  { name: "integrity/findings", path: "/api/integrity/findings" },
  { name: "integrity/findings open", path: "/api/integrity/findings?status=open&sort=-impactPaise" },
  { name: "billing/runs", path: "/api/billing/runs" },
  { name: "audit", path: "/api/audit" },
  { name: "portal/profile", path: "/api/portal/profile", as: "portal" },
  { name: "portal/subscriptions", path: "/api/portal/subscriptions", as: "portal" },
  { name: "portal/invoices", path: "/api/portal/invoices", as: "portal" },
  { name: "portal/invoices/:id", path: `/api/portal/invoices/${portalInvoiceId}`, as: "portal" },
  { name: "portal/payments", path: "/api/portal/payments", as: "portal" },
];

interface Result {
  name: string;
  median: number;
  max: number;
  tookMs: number | null;
  total: number | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const results: Result[] = [];
for (const e of endpoints) {
  const get = e.as === "portal" ? portal : staff;
  const times: number[] = [];
  const took: number[] = [];
  let total: number | null = null;
  for (let i = 0; i < RUNS; i++) {
    const { ms, body } = await get(e.path);
    times.push(ms);
    const b = body as { tookMs?: number; total?: number };
    if (typeof b.tookMs === "number") took.push(b.tookMs);
    if (typeof b.total === "number") total = b.total;
  }
  results.push({ name: e.name, median: median(times), max: Math.max(...times), tookMs: took.length ? median(took) : null, total });
}

const before: Result[] | null = flags.compare ? (JSON.parse(readFileSync(flags.compare, "utf8")) as Result[]) : null;
const f = (n: number | null | undefined) => (n == null ? "-" : n.toFixed(1));
const pad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);

const header = before
  ? `${pad("endpoint", 30)}${lpad("before med", 11)}${lpad("before max", 11)}${lpad("median", 9)}${lpad("max", 9)}${lpad("tookMs", 9)}${lpad("rows", 8)}`
  : `${pad("endpoint", 30)}${lpad("median", 9)}${lpad("max", 9)}${lpad("tookMs", 9)}${lpad("rows", 8)}`;
console.log(`\n${BASE}, ${RUNS} runs each, times in ms\n`);
console.log(header);
console.log("-".repeat(header.length + 3));
let failures = 0;
for (const r of results) {
  const ok = r.median < TARGET_MEDIAN_MS && r.max < TARGET_MAX_MS;
  if (!ok) failures++;
  const b = before?.find((x) => x.name === r.name);
  const cols = before ? `${lpad(f(b?.median), 11)}${lpad(f(b?.max), 11)}` : "";
  console.log(
    `${pad(r.name, 30)}${cols}${lpad(f(r.median), 9)}${lpad(f(r.max), 9)}${lpad(f(r.tookMs), 9)}${lpad(r.total == null ? "-" : String(r.total), 8)}${ok ? "" : "  ✗"}`,
  );
}
console.log(
  `\n${failures ? `${failures} endpoint(s) miss` : "all endpoints meet"} the target (median < ${TARGET_MEDIAN_MS} ms, max < ${TARGET_MAX_MS} ms)`,
);

if (flags.save) writeFileSync(flags.save, JSON.stringify(results, null, 2));
process.exitCode = failures ? 1 : 0;
