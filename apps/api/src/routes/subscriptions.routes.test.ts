import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@brightloop/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, subscriptions } from "../db/schema/index.js";
import { subscriptionTransitions } from "../services/subscription.service.js";
import { createCustomer, createDbTestApp, db, pool, uniq } from "../test/db-app.js";
import { fixtures } from "../test/fixtures.js";

// Pinned clock: 2026-06-15 12:00 in Asia/Kolkata.
const NOW = new Date("2026-06-15T06:30:00Z");
const TODAY = "2026-06-15";

let ctx: Awaited<ReturnType<typeof createDbTestApp>>;
let admin: Awaited<ReturnType<typeof ctx.signIn>>;
let staff: Awaited<ReturnType<typeof ctx.signIn>>;
let fx: ReturnType<typeof fixtures>;
let customerId: string;

beforeAll(async () => {
  ctx = await createDbTestApp({ now: () => NOW });
  admin = await ctx.signIn("admin");
  staff = await ctx.signIn("staff");
  fx = fixtures(admin);
  customerId = (await createCustomer()).id;
});

afterAll(() => pool.end());

/** A plan + one-product template, ready to quote. */
async function setup(planOverrides: object = {}, quantity = 2) {
  const tax = await fx.tax({ rateBps: 1800 });
  const product = await fx.product({ basePricePaise: 100_000, taxIds: [tax.id] });
  const attr = (
    await admin.post(`/api/products/${product.id}/attributes`, {
      name: "Brand",
      values: [{ value: "Odoo", priceExtraPaise: 56_000 }],
    })
  ).body.attribute;
  const variant = (
    await admin.post("/api/variants", { productId: product.id, name: "Odoo", attributeValueIds: [attr.values[0].id] })
  ).body.variant;
  const plan = await fx.plan(planOverrides);
  const template = await fx.template(plan.id, [{ productId: product.id, variantId: variant.id, quantity }]);
  return { tax, product, variant, plan, template };
}

async function quote(planOverrides: object = {}, body: object = {}) {
  const s = await setup(planOverrides);
  const sub = await fx.quotation(s.template.id, { customerId, startDate: TODAY, ...body });
  return { ...s, sub };
}

const transition = (id: string, to: string, extra: object = {}) =>
  staff.post(`/api/subscriptions/${id}/transition`, { to, ...extra });

async function forceStatus(id: string, status: SubscriptionStatus) {
  await db.update(subscriptions).set({ status }).where(eq(subscriptions.id, id));
}

describe("quotation templates", () => {
  it("lets staff read and only admins write", async () => {
    const { template } = await setup();
    expect((await staff.get(`/api/quotation-templates/${template.id}`)).body.template.lines).toHaveLength(1);
    expect((await staff.post("/api/quotation-templates", { name: "x", lines: [] })).status).toBe(403);
    const listed = await staff.get("/api/quotation-templates?pageSize=1");
    expect(listed.body).toMatchObject({ total: expect.any(Number), tookMs: expect.any(Number) });
  });

  it("rejects a variant that belongs to another product", async () => {
    const a = await setup();
    const other = await fx.product();
    const res = await admin.post("/api/quotation-templates", {
      name: "Mismatch",
      lines: [{ productId: other.id, variantId: a.variant.id, quantity: 1 }],
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/subscriptions/from-template/:id", () => {
  it("creates a numbered quotation with snapshotted prices and taxes", async () => {
    const { sub, product, tax } = await quote();

    expect(sub).toMatchObject({
      status: "quotation",
      number: expect.stringMatching(/^SUB-\d{6}$/),
      startDate: TODAY,
      anchorDay: 15,
      nextInvoiceDate: null,
      // 15 validity days: valid through 2026-06-30 IST, expires at its end.
      quotationExpiresAt: "2026-06-30T18:30:00.000Z",
      recurringAmountPaise: 2 * 156_000,
    });
    expect(sub.lines).toEqual([
      expect.objectContaining({
        unitPricePaise: 156_000,
        quantity: 2,
        description: "Odoo",
        taxes: [{ taxId: tax.id, name: tax.name, rateBps: 1800, inclusive: false }],
      }),
    ]);
    expect(sub.events.map((e: { type: string }) => e.type)).toEqual(["created"]);

    // Later price changes don't touch the snapshot.
    await admin.patch(`/api/products/${product.id}`, { basePricePaise: 999_999 });
    expect((await staff.get(`/api/subscriptions/${sub.id}`)).body.subscription.lines[0].unitPricePaise).toBe(156_000);
  });

  it("enforces the plan's minimum quantity", async () => {
    const { template } = await setup({ minQuantity: 5 }, 4);
    const res = await staff.post(`/api/subscriptions/from-template/${template.id}`, { customerId, startDate: TODAY });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ minQuantity: 5, quantity: 4 });

    const ok = await setup({ minQuantity: 5 }, 5);
    expect((await staff.post(`/api/subscriptions/from-template/${ok.template.id}`, { customerId, startDate: TODAY })).status).toBe(201);
  });

  it("refuses a plan that is not sellable today", async () => {
    const { template } = await setup({ availableFrom: "2026-07-01", availableTo: "2026-12-31" });
    const res = await staff.post(`/api/subscriptions/from-template/${template.id}`, { customerId, startDate: TODAY });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("not available");
  });

  it("rejects an unknown customer", async () => {
    const { template } = await setup();
    const res = await staff.post(`/api/subscriptions/from-template/${template.id}`, {
      customerId: "6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
      startDate: TODAY,
    });
    expect(res.status).toBe(400);
  });
});

describe("lifecycle", () => {
  it("quotation → confirmed → active sets the billing anchor, with events and audit rows", async () => {
    const { sub } = await quote({}, { startDate: "2026-06-20" });

    expect((await transition(sub.id, "confirmed", { note: "signed" })).body.subscription.status).toBe("confirmed");
    const active = (await transition(sub.id, "active")).body.subscription;
    expect(active).toMatchObject({ status: "active", startDate: "2026-06-20", anchorDay: 20, nextInvoiceDate: "2026-06-20" });
    expect(active.events.map((e: { toStatus: string }) => e.toStatus)).toEqual(["active", "confirmed", "quotation"]);
    expect(active.events[1].payload).toEqual({ note: "signed" });

    const audits = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "subscription"), eq(auditLog.entityId, sub.id)));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "subscription.active",
      "subscription.confirmed",
      "subscription.created",
    ]);
  });

  it("starts today when the quoted start date has passed", async () => {
    const { sub } = await quote({}, { startDate: "2026-06-01" });
    await transition(sub.id, "confirmed");
    const active = (await transition(sub.id, "active")).body.subscription;
    expect(active).toMatchObject({ startDate: TODAY, anchorDay: 15, nextInvoiceDate: TODAY });
  });

  it("rejects every transition that is not in the map", async () => {
    const { sub } = await quote({ pausable: true });
    let checked = 0;
    for (const from of SUBSCRIPTION_STATUSES) {
      for (const to of SUBSCRIPTION_STATUSES) {
        if (subscriptionTransitions.can(from, to)) continue;
        await forceStatus(sub.id, from);
        const res = await transition(sub.id, to);
        expect(res.status, `${from} → ${to}`).toBe(409);
        expect(res.body.error.code).toBe("invalid_transition");
        checked++;
      }
    }
    // 7 statuses × 7 targets minus the 11 allowed moves.
    expect(checked).toBe(49 - 11);
  });

  it("refuses to confirm an expired quotation", async () => {
    const { sub } = await quote();
    await db
      .update(subscriptions)
      .set({ quotationExpiresAt: new Date(NOW.getTime() - 1000) })
      .where(eq(subscriptions.id, sub.id));
    const res = await transition(sub.id, "confirmed");
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("expired");
  });

  async function activeSub(planOverrides: object, body: object = {}) {
    const { sub } = await quote(planOverrides, body);
    await transition(sub.id, "confirmed");
    await transition(sub.id, "active");
    return sub.id as string;
  }

  it("pauses only when the plan is pausable, and resumes", async () => {
    const fixed = await activeSub({ pausable: false });
    expect((await transition(fixed, "paused")).status).toBe(409);

    const flexible = await activeSub({ pausable: true });
    expect((await transition(flexible, "paused")).body.subscription.status).toBe("paused");
    expect((await transition(flexible, "active")).body.subscription.status).toBe("active");
  });

  it("closes early only when the plan allows it", async () => {
    const locked = await activeSub({ closableEarly: false }, { expiryDate: "2027-06-15" });
    const res = await transition(locked, "closed");
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("before 2027-06-15");

    const open = await activeSub({ closableEarly: true }, { expiryDate: "2027-06-15" });
    expect((await transition(open, "closed")).body.subscription.status).toBe("closed");

    // At or after the expiry date it is not "early".
    const ended = await activeSub({ closableEarly: false }, { expiryDate: "2027-06-15" });
    await db.update(subscriptions).set({ startDate: "2025-06-15", expiryDate: TODAY }).where(eq(subscriptions.id, ended));
    expect((await transition(ended, "closed")).body.subscription.status).toBe("closed");
  });

  it("renews only renewable plans, extending expiry by one period", async () => {
    const stuck = await activeSub({ renewable: false }, { expiryDate: "2026-12-15" });
    expect((await transition(stuck, "renew")).status).toBe(409);

    const monthly = await activeSub({ renewable: true }, { expiryDate: "2026-12-15" });
    const renewed = (await transition(monthly, "renew", { note: "another month" })).body.subscription;
    expect(renewed).toMatchObject({ status: "active", expiryDate: "2027-01-15" });
    expect(renewed.events[0]).toMatchObject({ type: "renewed", payload: { previousExpiryDate: "2026-12-15", expiryDate: "2027-01-15" } });

    const explicit = (await transition(monthly, "renew", { expiryDate: "2027-12-31" })).body.subscription;
    expect(explicit.expiryDate).toBe("2027-12-31");
    expect((await transition(monthly, "renew", { expiryDate: "2027-01-01" })).status).toBe(400);
  });

  it("cannot renew a subscription that is not active", async () => {
    const { sub } = await quote({ renewable: true }, { expiryDate: "2026-12-15" });
    const res = await transition(sub.id, "renew");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_transition");
  });
});

describe("GET /api/subscriptions", () => {
  it("filters by status, customer, plan and expiring_within_days", async () => {
    const mine = (await createCustomer(`Filter ${uniq()}`)).id;
    const { sub: soon, plan } = await quote({}, { customerId: mine, expiryDate: "2026-07-01" });
    const { sub: later } = await quote({}, { customerId: mine, expiryDate: "2027-07-01" });
    await transition(soon.id, "confirmed");

    const byCustomer = await staff.get(`/api/subscriptions?customerId=${mine}`);
    expect(byCustomer.body.total).toBe(2);
    const confirmed = await staff.get(`/api/subscriptions?customerId=${mine}&status=confirmed`);
    expect(confirmed.body.data.map((s: { id: string }) => s.id)).toEqual([soon.id]);
    const expiring = await staff.get(`/api/subscriptions?customerId=${mine}&expiringWithinDays=30`);
    expect(expiring.body.data.map((s: { id: string }) => s.id)).toEqual([soon.id]);
    const byPlan = await staff.get(`/api/subscriptions?planId=${plan.id}`);
    expect(byPlan.body.data.map((s: { id: string }) => s.id)).toEqual([soon.id]);
    expect(later.status).toBe("quotation");
  });

  it("is closed to customers", async () => {
    const customer = await ctx.signIn("customer");
    expect((await customer.get("/api/subscriptions")).status).toBe(403);
  });
});
