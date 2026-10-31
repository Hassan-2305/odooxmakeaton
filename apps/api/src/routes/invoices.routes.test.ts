import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, invoices, subscriptions } from "../db/schema/index.js";
import { type AppEvent, createEventBus } from "../lib/events.js";
import { createCustomer, createDbTestApp, db, pool } from "../test/db-app.js";
import { fixtures } from "../test/fixtures.js";

// Pinned clock: 2026-06-15 12:00 in Asia/Kolkata.
const NOW = new Date("2026-06-15T06:30:00Z");
const TODAY = "2026-06-15";

const events: AppEvent[] = [];
let ctx: Awaited<ReturnType<typeof createDbTestApp>>;
let admin: Awaited<ReturnType<typeof ctx.signIn>>;
let staff: Awaited<ReturnType<typeof ctx.signIn>>;
let fx: ReturnType<typeof fixtures>;

beforeAll(async () => {
  const eventBus = createEventBus();
  eventBus.subscribe((e) => events.push(e));
  ctx = await createDbTestApp({ now: () => NOW, eventBus });
  admin = await ctx.signIn("admin");
  staff = await ctx.signIn("staff");
  fx = fixtures(admin);
});

afterAll(() => pool.end());

interface InvoiceOptions {
  customerId: string;
  /** Billing day; the invoice is issued on it. */
  issueDate?: string;
  paymentTermsDays?: number;
  confirm?: boolean;
  /** Tax on the ₹1,000 product. */
  taxBps?: number;
}

/** A ₹1,000 (100_000 paise, plus tax if any) invoice produced by a real billing run. */
async function makeInvoice({ customerId, issueDate = TODAY, paymentTermsDays = 15, confirm = true, taxBps }: InvoiceOptions) {
  const taxIds = taxBps ? [(await fx.tax({ rateBps: taxBps })).id] : [];
  const product = await fx.product({ basePricePaise: 100_000, taxIds });
  const plan = await fx.plan();
  const template = await fx.template(plan.id, [{ productId: product.id, quantity: 1 }]);
  const sub = await fx.quotation(template.id, { customerId, startDate: TODAY, paymentTermsDays });
  await staff.post(`/api/subscriptions/${sub.id}/transition`, { to: "confirmed" });
  await staff.post(`/api/subscriptions/${sub.id}/transition`, { to: "active" });
  await db
    .update(subscriptions)
    .set({ startDate: issueDate, anchorDay: Number(issueDate.slice(8)), nextInvoiceDate: issueDate })
    .where(eq(subscriptions.id, sub.id));
  const run = await staff.post("/api/billing/runs?mode=live", { subscriptionIds: [sub.id], businessDate: issueDate });
  const invoiceId = run.body.run.items[0].invoiceId as string;
  if (confirm) expect((await staff.post(`/api/invoices/${invoiceId}/confirm`)).status).toBe(200);
  return invoiceId;
}

const getInvoice = async (id: string) => (await staff.get(`/api/invoices/${id}`)).body.invoice;

const pay = (customerId: string, amountPaise: number, allocations: object[] = []) =>
  staff.post("/api/payments", { customerId, method: "upi", amountPaise, paidOn: TODAY, reference: "UTR123", allocations });

describe("GET /api/invoices", () => {
  it("overdue=true returns only confirmed, unpaid invoices past their due date", async () => {
    const customerId = (await createCustomer()).id;
    const overdue = await makeInvoice({ customerId, issueDate: "2026-05-01", paymentTermsDays: 10 });
    await makeInvoice({ customerId, issueDate: "2026-05-02", paymentTermsDays: 10, confirm: false }); // draft
    const paid = await makeInvoice({ customerId, issueDate: "2026-05-03", paymentTermsDays: 10 });
    await pay(customerId, 100_000, [{ invoiceId: paid, amountPaise: 100_000 }]);
    const credited = await makeInvoice({ customerId, issueDate: "2026-05-04", paymentTermsDays: 10 });
    await admin.post(`/api/invoices/${credited}/credit-notes`, { reason: "Goodwill credit", amountPaise: 100_000 });
    const notDue = await makeInvoice({ customerId, issueDate: TODAY, paymentTermsDays: 0 }); // due today

    const res = await staff.get(`/api/invoices?customerId=${customerId}&overdue=true`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((i: { id: string }) => i.id)).toEqual([overdue]);
    expect(res.body).toMatchObject({ total: 1, tookMs: expect.any(Number) });

    const all = await staff.get(`/api/invoices?customerId=${customerId}`);
    expect(all.body.total).toBe(5);
    const notOverdue = await staff.get(`/api/invoices?customerId=${customerId}&overdue=false`);
    expect(notOverdue.body.data.map((i: { id: string }) => i.id)).toContain(notDue);
    expect(notOverdue.body.total).toBe(4);
  });

  it("filters by status and issue date range", async () => {
    const customerId = (await createCustomer()).id;
    const may = await makeInvoice({ customerId, issueDate: "2026-05-10", confirm: false });
    await makeInvoice({ customerId, issueDate: "2026-06-10" });
    const drafts = await staff.get(`/api/invoices?customerId=${customerId}&status=draft`);
    expect(drafts.body.data.map((i: { id: string }) => i.id)).toEqual([may]);
    const inMay = await staff.get(`/api/invoices?customerId=${customerId}&from=2026-05-01&to=2026-05-31`);
    expect(inMay.body.data.map((i: { id: string }) => i.id)).toEqual([may]);
  });
});

describe("invoice actions", () => {
  it("confirms drafts and refuses to edit confirmed invoices", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId, confirm: false });
    expect((await staff.patch(`/api/invoices/${id}`, { dueDate: "2026-07-31" })).body.invoice.dueDate).toBe("2026-07-31");

    const confirmed = await staff.post(`/api/invoices/${id}/confirm`);
    expect(confirmed.body.invoice).toMatchObject({ status: "confirmed", confirmedAt: NOW.toISOString() });

    const edit = await staff.patch(`/api/invoices/${id}`, { dueDate: "2026-08-31" });
    expect(edit.status).toBe(409);
    expect(edit.body.error.message).toContain("cannot be edited");
    expect((await staff.post(`/api/invoices/${id}/confirm`)).body.error.code).toBe("invalid_transition");
  });

  it("cancels drafts and unallocated confirmed invoices only", async () => {
    const customerId = (await createCustomer()).id;
    const draft = await makeInvoice({ customerId, confirm: false });
    expect((await staff.post(`/api/invoices/${draft}/cancel`, { reason: "duplicate" })).body.invoice.status).toBe("cancelled");

    const clean = await makeInvoice({ customerId });
    expect((await staff.post(`/api/invoices/${clean}/cancel`, {})).body.invoice.status).toBe("cancelled");

    const partlyPaid = await makeInvoice({ customerId });
    await pay(customerId, 10_000, [{ invoiceId: partlyPaid, amountPaise: 10_000 }]);
    const res = await staff.post(`/api/invoices/${partlyPaid}/cancel`, {});
    expect(res.status).toBe(409);
    expect((await getInvoice(partlyPaid)).status).toBe("confirmed");
  });

  it("renders a PDF on request", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId, taxBps: 1800 });
    const res = await staff
      .get(`/api/invoices/${id}/pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("emails confirmed invoices with the PDF attached", async () => {
    const customer = await createCustomer();
    const draft = await makeInvoice({ customerId: customer.id, confirm: false });
    expect((await staff.post(`/api/invoices/${draft}/send`, {})).status).toBe(409);

    const id = await makeInvoice({ customerId: customer.id });
    const res = await staff.post(`/api/invoices/${id}/send`, {});
    expect(res.status).toBe(200);
    expect(res.body.sentTo).toBe(customer.email);
    const mail = ctx.mail.sent.at(-1)!;
    expect(mail.to).toBe(customer.email);
    expect(mail.subject).toContain("INR 1,000.00");
    expect(mail.attachments?.[0]).toMatchObject({ contentType: "application/pdf", filename: expect.stringMatching(/^INV-\d+\.pdf$/) });
  });
});

describe("payments and allocations", () => {
  it("a partial payment leaves the correct balance, the rest marks it paid", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId, taxBps: 1800 }); // 118_000
    events.length = 0;

    const first = await pay(customerId, 40_000, [{ invoiceId: id, amountPaise: 40_000 }]);
    expect(first.status).toBe(201);
    expect(first.body.payment).toMatchObject({ allocatedPaise: 40_000, unallocatedPaise: 0 });
    expect(await getInvoice(id)).toMatchObject({ status: "confirmed", amountPaidPaise: 40_000, balancePaise: 78_000 });
    expect(events.map((e) => e.event)).toEqual(["payment.recorded"]);
    expect(events[0]!.payload).toMatchObject({ customerId, amountPaise: 40_000, invoiceIds: [id] });

    await pay(customerId, 78_000, [{ invoiceId: id, amountPaise: 78_000 }]);
    const done = await getInvoice(id);
    expect(done).toMatchObject({ status: "paid", amountPaidPaise: 118_000, balancePaise: 0 });
    expect(done.allocations).toHaveLength(2);
  });

  it("rejects over-allocation and leaves nothing behind", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId });

    const overInvoice = await pay(customerId, 200_000, [{ invoiceId: id, amountPaise: 100_001 }]);
    expect(overInvoice.status).toBe(400);
    expect(overInvoice.body.error.details).toMatchObject({ balancePaise: 100_000 });
    expect((await staff.get(`/api/payments?customerId=${customerId}`)).body.total).toBe(0);

    // Over the payment's remainder, through the allocations endpoint.
    const payment = (await pay(customerId, 30_000)).body.payment;
    const overPayment = await staff.post(`/api/payments/${payment.id}/allocations`, {
      allocations: [{ invoiceId: id, amountPaise: 30_001 }],
    });
    expect(overPayment.status).toBe(400);
    expect(overPayment.body.error.details).toMatchObject({ unallocatedPaise: 30_000 });

    // Allocations above the payment amount fail validation up front.
    expect((await pay(customerId, 10, [{ invoiceId: id, amountPaise: 11 }])).status).toBe(400);
    expect((await getInvoice(id)).amountPaidPaise).toBe(0);
  });

  it("only allocates to the customer's own confirmed invoices", async () => {
    const customerId = (await createCustomer()).id;
    const otherId = (await createCustomer()).id;
    const draft = await makeInvoice({ customerId, confirm: false });
    const theirs = await makeInvoice({ customerId: otherId });

    expect((await pay(customerId, 1_000, [{ invoiceId: draft, amountPaise: 1_000 }])).status).toBe(409);
    expect((await pay(customerId, 1_000, [{ invoiceId: theirs, amountPaise: 1_000 }])).status).toBe(400);
  });

  it("stores unallocated payments and allocates them later", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId });
    const payment = (await pay(customerId, 150_000)).body.payment;
    expect(payment).toMatchObject({ amountPaise: 150_000, allocatedPaise: 0, unallocatedPaise: 150_000, reference: "UTR123" });

    const open = await staff.get(`/api/payments?customerId=${customerId}&unallocated=true`);
    expect(open.body.data.map((p: { id: string }) => p.id)).toEqual([payment.id]);

    const allocated = await staff.post(`/api/payments/${payment.id}/allocations`, {
      allocations: [{ invoiceId: id, amountPaise: 100_000 }],
    });
    expect(allocated.body.payment).toMatchObject({ allocatedPaise: 100_000, unallocatedPaise: 50_000 });
    expect((await getInvoice(id)).status).toBe("paid");

    // Still 50_000 open.
    expect((await staff.get(`/api/payments?customerId=${customerId}&unallocated=true`)).body.total).toBe(1);
  });
});

describe("credit notes", () => {
  it("reduces the outstanding balance without editing the invoice", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId, taxBps: 1800 }); // 100_000 + 18_000
    const before = (await db.select().from(invoices).where(eq(invoices.id, id)))[0]!;

    expect((await staff.post(`/api/invoices/${id}/credit-notes`, { reason: "Service outage", amountPaise: 11_800 })).status).toBe(403);

    const res = await admin.post(`/api/invoices/${id}/credit-notes`, { reason: "Service outage", amountPaise: 11_800 });
    expect(res.status).toBe(201);
    expect(res.body.creditNote).toMatchObject({
      number: expect.stringMatching(/^CN-\d{6}$/),
      status: "confirmed",
      subtotalPaise: 10_000,
      taxTotalPaise: 1_800,
      totalPaise: 11_800,
      issueDate: TODAY,
    });
    expect(res.body.invoice).toMatchObject({ totalPaise: 118_000, creditedPaise: 11_800, balancePaise: 106_200, status: "confirmed" });

    const after = (await db.select().from(invoices).where(eq(invoices.id, id)))[0]!;
    expect(after).toEqual(before);

    // A payment can now only cover what is left.
    expect((await pay(customerId, 118_000, [{ invoiceId: id, amountPaise: 118_000 }])).status).toBe(400);
    await pay(customerId, 106_200, [{ invoiceId: id, amountPaise: 106_200 }]);
    expect(await getInvoice(id)).toMatchObject({ status: "paid", balancePaise: 0 });
  });

  it("cannot credit more than is owed, a draft, or an invoice being cancelled", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId });
    const over = await admin.post(`/api/invoices/${id}/credit-notes`, { reason: "Too much", amountPaise: 100_001 });
    expect(over.status).toBe(400);
    const draft = await makeInvoice({ customerId, confirm: false });
    expect((await admin.post(`/api/invoices/${draft}/credit-notes`, { reason: "Draft", amountPaise: 1 })).status).toBe(409);

    await admin.post(`/api/invoices/${id}/credit-notes`, { reason: "Partial", amountPaise: 5_000 });
    expect((await staff.post(`/api/invoices/${id}/cancel`, {})).status).toBe(409);
  });
});

describe("audit and access", () => {
  it("audits every invoice, payment and credit-note write", async () => {
    const customerId = (await createCustomer()).id;
    const id = await makeInvoice({ customerId, confirm: false });
    await staff.patch(`/api/invoices/${id}`, { dueDate: "2026-07-15" });
    await staff.post(`/api/invoices/${id}/confirm`);
    const payment = (await pay(customerId, 20_000, [{ invoiceId: id, amountPaise: 10_000 }])).body.payment;
    await staff.post(`/api/payments/${payment.id}/allocations`, { allocations: [{ invoiceId: id, amountPaise: 10_000 }] });
    const note = (await admin.post(`/api/invoices/${id}/credit-notes`, { reason: "Adjustment", amountPaise: 1_000 })).body.creditNote;

    const rows = await db
      .select({ action: auditLog.action, entityId: auditLog.entityId })
      .from(auditLog)
      .where(and(inArray(auditLog.entityId, [id, payment.id, note.id])));
    const actions = rows.map((r) => r.action).sort();
    expect(actions).toEqual(
      [
        "credit_note.created",
        "invoice.confirmed",
        "invoice.payment_applied",
        "invoice.payment_applied",
        "invoice.updated",
        "payment.allocated",
        "payment.created",
      ].sort(),
    );
  });

  it("keeps customers out", async () => {
    const customer = await ctx.signIn("customer");
    expect((await customer.get("/api/invoices")).status).toBe(403);
    expect((await customer.get("/api/payments")).status).toBe(403);
  });
});
