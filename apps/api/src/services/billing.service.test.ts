import type { AppEvent } from "../lib/events.js";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  billingRuns,
  discountApplications,
  discountRules,
  invoiceLines,
  invoiceLineTaxes,
  invoices,
  subscriptions,
} from "../db/schema/index.js";
import { createEventBus } from "../lib/events.js";
import { createCustomer, createDbTestApp, db, pool, uniq } from "../test/db-app.js";
import { fixtures } from "../test/fixtures.js";

// Pinned clock: 2026-06-15 12:00 in Asia/Kolkata.
const NOW = new Date("2026-06-15T06:30:00Z");
const TODAY = "2026-06-15";

const failing = new Set<string>();
const events: AppEvent[] = [];
let ctx: Awaited<ReturnType<typeof createDbTestApp>>;
let admin: Awaited<ReturnType<typeof ctx.signIn>>;
let staff: Awaited<ReturnType<typeof ctx.signIn>>;
let fx: ReturnType<typeof fixtures>;
let customerId: string;

beforeAll(async () => {
  const eventBus = createEventBus();
  eventBus.subscribe((e) => events.push(e));
  ctx = await createDbTestApp({
    now: () => NOW,
    eventBus,
    // Lets a test make chosen subscriptions fail inside the invoice builder.
    wrapInvoiceService: (service) => ({
      build: (sub, period, tx, opts) => {
        if (failing.has(sub.id)) throw new Error("boom: injected failure");
        return service.build(sub, period, tx, opts);
      },
    }),
  });
  admin = await ctx.signIn("admin");
  staff = await ctx.signIn("staff");
  fx = fixtures(admin);
  customerId = (await createCustomer()).id;
});

afterAll(() => pool.end());

interface ActiveOptions {
  plan?: object;
  startDate: string;
  anchorDay?: number;
  expiryDate?: string | null;
  paymentTermsDays?: number;
}

/** An active subscription billed from `startDate` (one product, ₹1,000 × 1, no tax). */
async function activeSubscription(opts: ActiveOptions, templateId?: string) {
  let tid = templateId;
  if (!tid) {
    const product = await fx.product({ basePricePaise: 100_000 });
    const plan = await fx.plan(opts.plan ?? {});
    tid = (await fx.template(plan.id, [{ productId: product.id, quantity: 1 }])).id as string;
  }
  const sub = await fx.quotation(tid, { customerId, startDate: TODAY, paymentTermsDays: opts.paymentTermsDays });
  await staff.post(`/api/subscriptions/${sub.id}/transition`, { to: "confirmed" });
  await staff.post(`/api/subscriptions/${sub.id}/transition`, { to: "active" });
  await db
    .update(subscriptions)
    .set({
      startDate: opts.startDate,
      anchorDay: opts.anchorDay ?? Number(opts.startDate.slice(8)),
      nextInvoiceDate: opts.startDate,
      expiryDate: opts.expiryDate ?? null,
    })
    .where(eq(subscriptions.id, sub.id));
  return sub.id as string;
}

const run = (mode: "dry" | "live", subscriptionIds: string[], businessDate?: string) =>
  staff.post(`/api/billing/runs?mode=${mode}`, { subscriptionIds, ...(businessDate ? { businessDate } : {}) });

const invoicesOf = (subscriptionId: string) =>
  db.select().from(invoices).where(eq(invoices.subscriptionId, subscriptionId)).orderBy(asc(invoices.periodStart));

describe("catch-up and idempotency", () => {
  it("bills 3 missed months as 3 invoices with month-end clamping", async () => {
    const id = await activeSubscription({ startDate: "2026-03-31" });

    const res = await run("live", [id]);
    expect(res.status).toBe(201);
    expect(res.body.run).toMatchObject({ dryRun: false, status: "completed", invoicedCount: 3, failedCount: 0, consideredCount: 1 });
    expect(res.body.run.items.map((i: { outcome: string; periodStart: string }) => [i.outcome, i.periodStart])).toEqual([
      ["created", "2026-03-31"],
      ["created", "2026-04-30"],
      ["created", "2026-05-31"],
    ]);

    const rows = await invoicesOf(id);
    expect(rows.map((r) => [r.periodStart, r.periodEnd])).toEqual([
      ["2026-03-31", "2026-04-30"],
      ["2026-04-30", "2026-05-31"],
      ["2026-05-31", "2026-06-30"],
    ]);
    expect(rows.every((r) => r.status === "draft" && /^INV-\d{6}$/.test(r.number!))).toBe(true);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    expect(sub!.nextInvoiceDate).toBe("2026-06-30");
  });

  it("creates zero duplicates on rerun, even when next_invoice_date is rewound", async () => {
    const id = await activeSubscription({ startDate: "2026-04-15" });
    await run("live", [id]);
    expect(await invoicesOf(id)).toHaveLength(3); // Apr 15, May 15, Jun 15

    const again = await run("live", [id]);
    expect(again.body.run).toMatchObject({ consideredCount: 0, invoicedCount: 0 });

    // Simulate a crash that lost the next_invoice_date update.
    await db.update(subscriptions).set({ nextInvoiceDate: "2026-04-15" }).where(eq(subscriptions.id, id));
    const rewound = await run("live", [id]);
    expect(rewound.body.run).toMatchObject({ invoicedCount: 0, alreadyBilledCount: 3 });
    expect(rewound.body.run.items.every((i: { invoiceId: string | null }) => i.invoiceId)).toBe(true);
    expect(await invoicesOf(id)).toHaveLength(3);
  });

  it("does not let one failing subscription halt the run", async () => {
    const a = await activeSubscription({ startDate: "2026-06-01" });
    const bad = await activeSubscription({ startDate: "2026-06-01" });
    const c = await activeSubscription({ startDate: "2026-06-01" });
    failing.add(bad);

    const res = await run("live", [a, bad, c]);
    failing.delete(bad);

    expect(res.body.run).toMatchObject({ status: "completed", consideredCount: 3, invoicedCount: 2, failedCount: 1 });
    const failed = res.body.run.items.find((i: { outcome: string }) => i.outcome === "failed");
    expect(failed).toMatchObject({ subscriptionId: bad, reason: "boom: injected failure" });
    expect(await invoicesOf(a)).toHaveLength(1);
    expect(await invoicesOf(c)).toHaveLength(1);
    expect(await invoicesOf(bad)).toHaveLength(0);

    // The failed subscription is picked up by the next run.
    const retry = await run("live", [bad]);
    expect(retry.body.run.invoicedCount).toBe(1);
  });
});

describe("dry runs", () => {
  it("returns the preview and writes nothing", async () => {
    const id = await activeSubscription({ startDate: "2026-05-15" });
    const runsBefore = (await db.select({ id: billingRuns.id }).from(billingRuns)).length;

    const res = await run("dry", [id]);
    expect(res.status).toBe(200);
    expect(res.body.run).toMatchObject({ dryRun: true, invoicedCount: 2 });
    expect(res.body.run.items.map((i: { totalPaise: number }) => i.totalPaise)).toEqual([100_000, 100_000]);

    expect(await invoicesOf(id)).toHaveLength(0);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    expect(sub!.nextInvoiceDate).toBe("2026-05-15");
    expect((await db.select({ id: billingRuns.id }).from(billingRuns)).length).toBe(runsBefore);
  });
});

describe("end of term", () => {
  it("closes the subscription when the plan auto-closes", async () => {
    const id = await activeSubscription({ plan: { autoCloseOnEnd: true }, startDate: "2026-04-01", expiryDate: "2026-05-01" });
    const res = await run("live", [id]);
    expect(res.body.run.items.map((i: { outcome: string }) => i.outcome)).toEqual(["created", "skipped"]);
    expect(res.body.run.items[1].reason).toBe("Term ended on 2026-05-01; subscription closed");
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    expect(sub!.status).toBe("closed");
  });

  it("skips without closing otherwise", async () => {
    const id = await activeSubscription({ plan: { autoCloseOnEnd: false }, startDate: "2026-04-01", expiryDate: "2026-05-01" });
    const res = await run("live", [id]);
    expect(res.body.run.items[1]).toMatchObject({ outcome: "skipped", reason: "Term ended on 2026-05-01" });
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    expect(sub!.status).toBe("active");
  });
});

describe("invoice contents", () => {
  it("snapshots prices and tax rates, applies and consumes discounts, and sets the due date", async () => {
    const excl = await fx.tax({ rateBps: 1800 });
    const incl = await fx.tax({ rateBps: 1200, inclusive: true, name: `GST 12 incl ${uniq()}` });
    const erp = await fx.product({ basePricePaise: 100_000, taxIds: [excl.id] });
    const attr = (
      await admin.post(`/api/products/${erp.id}/attributes`, { name: "Brand", values: [{ value: "Odoo", priceExtraPaise: 56_000 }] })
    ).body.attribute;
    const odoo = (await admin.post("/api/variants", { productId: erp.id, name: "ERP Odoo", attributeValueIds: [attr.values[0].id] }))
      .body.variant;
    const support = await fx.product({ basePricePaise: 112_000, taxIds: [incl.id] });
    const plan = await fx.plan();
    const template = await fx.template(plan.id, [
      { productId: erp.id, variantId: odoo.id, quantity: 2 },
      { productId: support.id, quantity: 1 },
    ]);
    // Codeless and product-scoped, so it applies automatically to this test's product only.
    const rule = (
      await admin.post("/api/discounts", { name: "ERP 10%", type: "percent", value: 1000, scope: "product", productId: erp.id, usageLimit: 5 })
    ).body.discount;

    const id = await activeSubscription({ startDate: TODAY, paymentTermsDays: 10 }, template.id);
    const res = await run("live", [id]);
    expect(res.body.run.invoicedCount).toBe(1);

    const [invoice] = await invoicesOf(id);
    expect(invoice).toMatchObject({
      issueDate: TODAY,
      dueDate: "2026-06-25",
      subtotalPaise: 412_000,
      discountTotalPaise: 31_200,
      taxTotalPaise: 62_544,
      totalPaise: 443_344,
      amountPaidPaise: 0,
    });
    expect(invoice!.customerSnapshot).toMatchObject({ id: customerId });

    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice!.id)).orderBy(asc(invoiceLines.sortOrder));
    expect(lines.map((l) => [l.kind, l.unitPricePaise, l.amountPaise])).toEqual([
      ["product", 156_000, 312_000],
      ["product", 112_000, 100_000],
      ["discount", 31_200, 31_200],
    ]);
    const taxes = await db.select().from(invoiceLineTaxes).where(inArray(invoiceLineTaxes.invoiceLineId, lines.map((l) => l.id)));
    expect(taxes.map((t) => [t.rateBps, t.inclusive, t.taxableAmountPaise, t.taxAmountPaise]).sort()).toEqual(
      [
        [1200, true, 100_000, 12_000],
        [1800, false, 280_800, 50_544],
      ].sort(),
    );

    const [used] = await db.select().from(discountRules).where(eq(discountRules.id, rule.id));
    expect(used!.usedCount).toBe(1);
    const applications = await db.select().from(discountApplications).where(eq(discountApplications.invoiceId, invoice!.id));
    expect(applications).toEqual([expect.objectContaining({ discountRuleId: rule.id, amountPaise: 31_200 })]);

    // Rate change after invoicing does not touch the snapshot.
    await admin.patch(`/api/taxes/${excl.id}`, { rateBps: 2800 });
    const [after] = await db.select().from(invoiceLineTaxes).where(eq(invoiceLineTaxes.taxId, excl.id));
    expect(after!.rateBps).toBe(1800);
    await admin.patch(`/api/taxes/${excl.id}`, { isActive: false });
  });
});

describe("events, history and access", () => {
  it("emits invoice.created and billing_run.finished on live runs only", async () => {
    const id = await activeSubscription({ startDate: TODAY });
    events.length = 0;
    await run("dry", [id]);
    expect(events).toEqual([]);

    const res = await run("live", [id]);
    const invoiceId = res.body.run.items[0].invoiceId;
    expect(events.map((e) => e.event)).toEqual(["invoice.created", "billing_run.finished"]);
    expect(events[0]!.payload).toMatchObject({ invoiceId, subscriptionId: id, customerId, totalPaise: 100_000 });
    expect(events[1]!.payload).toMatchObject({ id: res.body.run.id, invoicedCount: 1 });
  });

  it("lists runs and shows one with its items", async () => {
    const id = await activeSubscription({ startDate: TODAY });
    const created = (await run("live", [id])).body.run;
    const list = await staff.get("/api/billing/runs?pageSize=5");
    expect(list.body).toMatchObject({ total: expect.any(Number), tookMs: expect.any(Number) });
    expect(list.body.data.map((r: { id: string }) => r.id)).toContain(created.id);
    const one = await staff.get(`/api/billing/runs/${created.id}`);
    expect(one.body.run.items).toHaveLength(1);
  });

  it("rejects a future business date, a missing mode, and customers", async () => {
    expect((await staff.post("/api/billing/runs?mode=live", { businessDate: "2026-06-16" })).status).toBe(400);
    expect((await staff.post("/api/billing/runs", {})).status).toBe(400);
    const customer = await ctx.signIn("customer");
    expect((await customer.post("/api/billing/runs?mode=dry", {})).status).toBe(403);
  });
});
