import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "../lib/logger.js";
import { errorHandler } from "../middleware/error-handler.js";
import { scopeToCustomer } from "../middleware/scope.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { Db } from "../db/client.js";
import { settings } from "../db/schema/index.js";
import { createInvoicesRepository } from "../repositories/invoices.repository.js";
import { createPortalRepository } from "../repositories/portal.repository.js";
import { createSettingsRepository } from "../repositories/settings.repository.js";
import { createInvoicePdf } from "../services/invoice-actions.service.js";
import { createPortalService } from "../services/portal.service.js";
import { closeTestDb, dbAvailable, fixtures, inRollback } from "../test/db.js";
import { signInAs } from "../test/sign-in.js";
import { createTestApp } from "../test/test-app.js";

let ctx: ReturnType<typeof createTestApp>;
afterAll(closeTestDb);
beforeEach(() => {
  ctx = createTestApp();
});

describe("scopeToCustomer()", () => {
  function appWith(user: object | undefined) {
    const app = express();
    app.use((req, _res, next) => {
      if (user) req.auth = { user: user as never, sessionId: "s" };
      next();
    });
    app.get("/scope", (req, res) => void res.json({ customerId: scopeToCustomer(req) }));
    app.use(errorHandler(silentLogger));
    return app;
  }

  it("returns the session's customer_id for a customer user", async () => {
    const res = await request(appWith({ id: "u1", role: "customer", customerId: "c-123" })).get(
      "/scope?customerId=someone-else",
    );

    expect(res.body).toEqual({ customerId: "c-123" });
  });

  it("returns 403 for staff and admins", async () => {
    for (const role of ["staff", "admin"]) {
      const res = await request(appWith({ id: "u1", role, customerId: null })).get("/scope");
      expect(res.status).toBe(403);
    }
  });

  it("returns 403 for a customer user without a customer record", async () => {
    const res = await request(appWith({ id: "u1", role: "customer", customerId: null })).get("/scope");

    expect(res.status).toBe(403);
  });

  it("returns 401 when signed out", async () => {
    expect((await request(appWith(undefined)).get("/scope")).status).toBe(401);
  });
});

describe("GET /api/portal/profile", () => {
  it("returns the signed-in customer's own record and ignores a customerId in the query", async () => {
    const staff = await signInAs(ctx.app, ctx.store, "staff");
    const mine = (await staff.post("/api/customers", { name: "Mine", email: "me@x.in" })).body.customer;
    const other = (await staff.post("/api/customers", { name: "Other", email: "o@x.in" })).body.customer;

    const customer = await signInAs(ctx.app, ctx.store, "customer");
    ctx.store.users.get(customer.user!.id)!.customerId = mine.id;

    const res = await customer.get(`/api/portal/profile?customerId=${other.id}`);

    expect(res.status).toBe(200);
    expect(res.body.customer).toMatchObject({ id: mine.id, name: "Mine" });
  });

  it("returns 403 for back-office users", async () => {
    const staff = await signInAs(ctx.app, ctx.store, "staff");

    expect((await staff.get("/api/portal/profile")).status).toBe(403);
  });
});

describe.skipIf(!dbAvailable)("portal data isolation (Postgres)", () => {
  /** Two customers with a subscription, invoices and a payment each; A and B signed in. */
  async function setup(tx: DbOrTx) {
    await tx.insert(settings).values({ id: 1 }).onConflictDoNothing();
    // The real invoice PDF function, reading through the same rolled-back transaction.
    const invoicePdf = createInvoicePdf({
      invoices: createInvoicesRepository(tx as unknown as Db),
      settings: createSettingsRepository(tx as unknown as Db),
    });
    const app = createTestApp({ portalService: createPortalService({ repo: createPortalRepository(tx), invoicePdf }) });
    const f = fixtures(tx);
    const plan = await f.plan("month");

    async function customerWithData(name: string) {
      const customer = await f.customer(name);
      const subscription = await f.subscription({
        customerId: customer.id,
        planId: plan.id,
        lines: [{ quantity: 2, unitPricePaise: 5000 }],
      });
      await f.subscription({ customerId: customer.id, planId: plan.id, status: "draft" });
      const invoice = await f.invoice({ customerId: customer.id, subscriptionId: subscription.id, totalPaise: 10000 });
      const draft = await f.invoice({
        customerId: customer.id,
        subscriptionId: subscription.id,
        status: "draft",
        totalPaise: 10000,
        periodStart: "2026-11-01",
        periodEnd: "2026-12-01",
      });
      const payment = await f.payment({
        customerId: customer.id,
        amountPaise: 4000,
        allocations: [{ invoiceId: invoice.id, amountPaise: 4000 }],
      });
      const agent = await signInAs(app.app, app.store, "customer");
      app.store.users.get(agent.user!.id)!.customerId = customer.id;
      // Mirror the in-memory user into Postgres so audit rows can reference it.
      await tx.execute(sql`insert into users (id, email, password_hash, name, role, customer_id)
        values (${agent.user!.id}::uuid, ${agent.user!.email}, 'x', ${name}, 'customer', ${customer.id}::uuid)`);
      return { customer, subscription, invoice, draft, payment, agent };
    }

    return { app, a: await customerWithData("Customer A"), b: await customerWithData("Customer B") };
  }

  it("lists only the signed-in customer's own records, without drafts", () =>
    inRollback(async (tx) => {
      const { a } = await setup(tx);

      const subs = await a.agent.get("/api/portal/subscriptions?customerId=" + a.customer.id);
      expect(subs.status).toBe(200);
      expect(subs.body.data).toEqual([
        expect.objectContaining({ id: a.subscription.id, status: "active", recurringAmountPaise: 10000 }),
      ]);

      const invoices = await a.agent.get("/api/portal/invoices");
      expect(invoices.body.data).toEqual([
        expect.objectContaining({ id: a.invoice.id, totalPaise: 10000, paidPaise: 4000, balancePaise: 6000 }),
      ]);

      const payments = await a.agent.get("/api/portal/payments");
      expect(payments.body.data).toEqual([
        expect.objectContaining({
          id: a.payment.id,
          amountPaise: 4000,
          allocations: [{ invoiceId: a.invoice.id, invoiceNumber: a.invoice.number, amountPaise: 4000 }],
        }),
      ]);
    }));

  it("returns 404 for another customer's invoice and its PDF", () =>
    inRollback(async (tx) => {
      const { a, b } = await setup(tx);

      expect((await a.agent.get(`/api/portal/invoices/${b.invoice.id}`)).status).toBe(404);
      expect((await a.agent.get(`/api/portal/invoices/${b.invoice.id}/pdf`)).status).toBe(404);
      // Drafts are invisible too, even your own.
      expect((await a.agent.get(`/api/portal/invoices/${a.draft.id}`)).status).toBe(404);

      const own = await a.agent.get(`/api/portal/invoices/${a.invoice.id}`);
      expect(own.status).toBe(200);
      expect(own.body.invoice).toMatchObject({ id: a.invoice.id, balancePaise: 6000, lines: [] });
      // The owner gets the rendered invoice PDF.
      const pdf = await a.agent
        .get(`/api/portal/invoices/${a.invoice.id}/pdf`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toBe("application/pdf");
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    }));

  it("stores a cancel request in the audit log, only for the customer's own subscription", () =>
    inRollback(async (tx) => {
      const { a, b } = await setup(tx);

      const denied = await a.agent.post("/api/portal/requests", {
        type: "cancel",
        subscriptionId: b.subscription.id,
        message: "Please cancel",
      });
      expect(denied.status).toBe(404);

      const res = await a.agent.post("/api/portal/requests", {
        type: "cancel",
        subscriptionId: a.subscription.id,
        message: "Please cancel at period end",
      });
      expect(res.status).toBe(202);
      expect(res.body.request).toMatchObject({ type: "cancel", subscriptionId: a.subscription.id });

      const { rows } = await tx.execute(
        sql`select action, actor_user_id, after from audit_log where entity_id = ${a.subscription.id}::uuid`,
      );
      expect(rows).toEqual([
        {
          action: "portal.request.cancel",
          actor_user_id: a.agent.user!.id,
          after: { type: "cancel", message: "Please cancel at period end", customerId: a.customer.id, status: "pending" },
        },
      ]);
    }));

  it("returns 403 to back-office users", () =>
    inRollback(async (tx) => {
      const { app } = await setup(tx);
      const staff = await signInAs(app.app, app.store, "staff");

      expect((await staff.get("/api/portal/invoices")).status).toBe(403);
    }));
});
