import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, integrityFindings, invoices, subscriptions } from "../db/schema/index.js";
import { createCustomer, createDbTestApp, db, pool } from "../test/db-app.js";
import { fixtures } from "../test/fixtures.js";

// Pinned clock: 2026-06-15 12:00 in Asia/Kolkata.
const NOW = new Date("2026-06-15T06:30:00Z");
const TODAY = "2026-06-15";

let ctx: Awaited<ReturnType<typeof createDbTestApp>>;
let admin: Awaited<ReturnType<typeof ctx.signIn>>;
let staff: Awaited<ReturnType<typeof ctx.signIn>>;
let fx: ReturnType<typeof fixtures>;

beforeAll(async () => {
  ctx = await createDbTestApp({ now: () => NOW });
  admin = await ctx.signIn("admin");
  staff = await ctx.signIn("staff");
  fx = fixtures(admin);
});

afterAll(() => pool.end());

/** An active ₹1,000/month subscription whose next invoice date is `nextInvoiceDate`. */
async function activeSubscription(customerId: string, nextInvoiceDate: string) {
  const product = await fx.product({ basePricePaise: 100_000 });
  const plan = await fx.plan();
  const template = await fx.template(plan.id, [{ productId: product.id, quantity: 1 }]);
  const sub = await fx.quotation(template.id, { customerId, startDate: TODAY });
  await staff.post(`/api/subscriptions/${sub.id}/transition`, { to: "confirmed" });
  await staff.post(`/api/subscriptions/${sub.id}/transition`, { to: "active" });
  await db
    .update(subscriptions)
    .set({ startDate: nextInvoiceDate, anchorDay: Number(nextInvoiceDate.slice(8)), nextInvoiceDate })
    .where(eq(subscriptions.id, sub.id));
  return sub.id as string;
}

async function scanAndFind(rule: string, entityId: string) {
  expect((await staff.post("/api/integrity/scan")).status).toBe(200);
  const [finding] = await db
    .select()
    .from(integrityFindings)
    .where(and(eq(integrityFindings.rule, rule), eq(integrityFindings.entityId, entityId)));
  expect(finding, `${rule} finding for ${entityId}`).toBeDefined();
  return finding!;
}

describe("resolve with allocate_payment", () => {
  it("allocates through the payments service, then resolves the finding", async () => {
    const customerId = (await createCustomer()).id;
    const sub = await activeSubscription(customerId, TODAY);
    const run = await staff.post("/api/billing/runs?mode=live", { subscriptionIds: [sub] });
    const invoiceId = run.body.run.items[0].invoiceId as string;
    await staff.post(`/api/invoices/${invoiceId}/confirm`);
    const payment = (
      await staff.post("/api/payments", { customerId, method: "upi", amountPaise: 100_000, paidOn: TODAY })
    ).body.payment;

    const finding = await scanAndFind("unallocated_payment", payment.id);
    expect(finding.status).toBe("open");

    const res = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, {
      action: "allocate_payment",
      note: "Matched by UTR",
      allocations: [{ invoiceId, amountPaise: 100_000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.finding).toMatchObject({ status: "resolved" });

    const paid = (await staff.get(`/api/payments/${payment.id}`)).body.payment;
    expect(paid).toMatchObject({ allocatedPaise: 100_000, unallocatedPaise: 0 });
    expect((await staff.get(`/api/invoices/${invoiceId}`)).body.invoice.status).toBe("paid");

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, finding.id), eq(auditLog.action, "integrity_finding.resolved")));
    expect(audit!.after).toMatchObject({
      action: "allocate_payment",
      correction: expect.objectContaining({ id: payment.id, allocatedPaise: 100_000 }),
    });
  });

  it("leaves the finding open when the allocation is rejected", async () => {
    const customerId = (await createCustomer()).id;
    const sub = await activeSubscription(customerId, TODAY);
    const run = await staff.post("/api/billing/runs?mode=live", { subscriptionIds: [sub] });
    const draftInvoice = run.body.run.items[0].invoiceId as string; // not confirmed
    const payment = (
      await staff.post("/api/payments", { customerId, method: "cash", amountPaise: 5_000, paidOn: TODAY })
    ).body.payment;
    const finding = await scanAndFind("unallocated_payment", payment.id);

    const res = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, {
      action: "allocate_payment",
      allocations: [{ invoiceId: draftInvoice, amountPaise: 5_000 }],
    });
    expect(res.status).toBe(409);
    const [after] = await db.select().from(integrityFindings).where(eq(integrityFindings.id, finding.id));
    expect(after!.status).toBe("open");

    const noAllocations = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, { action: "allocate_payment" });
    expect(noAllocations.status).toBe(400);
    const wrongRule = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, { action: "generate_invoice" });
    expect(wrongRule.status).toBe(400);
  });
});

describe("resolve with generate_invoice", () => {
  it("bills the missing period through the billing service, then resolves the finding", async () => {
    const customerId = (await createCustomer()).id;
    const sub = await activeSubscription(customerId, "2026-05-01");
    const finding = await scanAndFind("missing_invoice", sub);
    expect(finding.expected).toEqual({ invoiceForPeriodStart: "2026-05-01" });

    const res = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, { action: "generate_invoice" });
    expect(res.status).toBe(200);
    expect(res.body.finding.status).toBe("resolved");

    const rows = await db.select().from(invoices).where(eq(invoices.subscriptionId, sub));
    expect(rows.map((r) => [r.periodStart, r.periodEnd, r.issueDate, r.billingRunId !== null])).toEqual([
      ["2026-05-01", "2026-06-01", "2026-05-01", true],
    ]);
    const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub));
    expect(s!.nextInvoiceDate).toBe("2026-06-01");

    // Already resolved: no second invoice.
    const again = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, { action: "generate_invoice" });
    expect(again.status).toBe(409);
    expect(await db.select().from(invoices).where(eq(invoices.subscriptionId, sub))).toHaveLength(1);
  });

  it("refuses when the period is no longer due, without resolving", async () => {
    const customerId = (await createCustomer()).id;
    const sub = await activeSubscription(customerId, "2026-05-01");
    const finding = await scanAndFind("missing_invoice", sub);
    // Someone pauses the subscription in the meantime.
    await db.update(subscriptions).set({ status: "paused" }).where(eq(subscriptions.id, sub));

    const res = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, { action: "generate_invoice" });
    expect(res.status).toBe(409);
    const [after] = await db.select().from(integrityFindings).where(eq(integrityFindings.id, finding.id));
    expect(after!.status).toBe("open");
  });
});

describe("plain resolve actions", () => {
  it("still only record the decision", async () => {
    const customerId = (await createCustomer()).id;
    const payment = (
      await staff.post("/api/payments", { customerId, method: "cash", amountPaise: 1_000, paidOn: TODAY })
    ).body.payment;
    const finding = await scanAndFind("unallocated_payment", payment.id);
    const res = await admin.post(`/api/integrity/findings/${finding.id}/resolve`, { action: "refund", note: "Refunded" });
    expect(res.body.finding.status).toBe("resolved");
    expect((await staff.get(`/api/payments/${payment.id}`)).body.payment.allocatedPaise).toBe(0);
  });
});
