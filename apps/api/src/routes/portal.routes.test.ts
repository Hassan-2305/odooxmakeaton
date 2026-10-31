import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "../lib/logger.js";
import { errorHandler } from "../middleware/error-handler.js";
import { scopeToCustomer } from "../middleware/scope.js";
import { signInAs } from "../test/sign-in.js";
import { createTestApp } from "../test/test-app.js";

let ctx: ReturnType<typeof createTestApp>;
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
