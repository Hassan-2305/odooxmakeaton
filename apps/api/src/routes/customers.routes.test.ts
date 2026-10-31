import { beforeEach, describe, expect, it } from "vitest";
import { signInAs } from "../test/sign-in.js";
import { createTestApp } from "../test/test-app.js";

const acme = {
  name: "Acme Traders",
  email: "Billing@Acme.in",
  phone: "+91 98765 43210",
  gstin: "29abcde1234f1z5",
  city: "Bengaluru",
  state: "Karnataka",
};

let ctx: ReturnType<typeof createTestApp>;
let staff: Awaited<ReturnType<typeof signInAs>>;

beforeEach(async () => {
  ctx = createTestApp();
  staff = await signInAs(ctx.app, ctx.store, "staff");
});

async function seed(...customers: object[]) {
  const created = [];
  for (const c of customers) created.push((await staff.post("/api/customers", c)).body.customer);
  return created;
}

describe("access", () => {
  it("allows admin and staff", async () => {
    const admin = await signInAs(ctx.app, ctx.store, "admin");
    expect((await admin.get("/api/customers")).status).toBe(200);
    expect((await staff.get("/api/customers")).status).toBe(200);
  });

  it("returns 403 for customers on every route and 401 when signed out", async () => {
    const customer = await signInAs(ctx.app, ctx.store, "customer");
    const [existing] = await seed(acme);
    const id = existing.id as string;

    expect((await customer.get("/api/customers")).status).toBe(403);
    expect((await customer.get(`/api/customers/${id}`)).status).toBe(403);
    expect((await customer.post("/api/customers", acme)).status).toBe(403);
    expect((await customer.patch(`/api/customers/${id}`, { name: "x" })).status).toBe(403);
    expect((await customer.delete(`/api/customers/${id}`)).status).toBe(403);

    const anon = await signInAs(ctx.app, ctx.store, null);
    expect((await anon.get("/api/customers")).status).toBe(401);
  });
});

describe("create / read / update / delete", () => {
  it("creates a customer, normalising email and GSTIN", async () => {
    const res = await staff.post("/api/customers", acme);

    expect(res.status).toBe(201);
    expect(res.body.customer).toMatchObject({
      name: "Acme Traders",
      email: "billing@acme.in",
      gstin: "29ABCDE1234F1Z5",
      country: "IN",
    });
  });

  it("rejects an invalid GSTIN and phone with field errors", async () => {
    const res = await staff.post("/api/customers", { ...acme, gstin: "29ABC", phone: "call me" });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(["gstin", "phone"]);
  });

  it("reads one customer and 404s for an unknown id", async () => {
    const [created] = await seed(acme);

    expect((await staff.get(`/api/customers/${created.id}`)).body.customer.id).toBe(created.id);
    const missing = await staff.get("/api/customers/6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b");
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe("Customer not found");
    expect((await staff.get("/api/customers/not-a-uuid")).status).toBe(400);
  });

  it("patches only the fields sent, and clears a field sent as empty", async () => {
    const [created] = await seed(acme);

    const res = await staff.patch(`/api/customers/${created.id}`, { city: "Mysuru", phone: "" });

    expect(res.status).toBe(200);
    expect(res.body.customer).toMatchObject({
      name: "Acme Traders",
      city: "Mysuru",
      phone: null,
      country: "IN",
      gstin: "29ABCDE1234F1Z5",
    });
  });

  it("deletes a customer", async () => {
    const [created] = await seed(acme);

    expect((await staff.delete(`/api/customers/${created.id}`)).status).toBe(204);
    expect((await staff.get(`/api/customers/${created.id}`)).status).toBe(404);
    expect((await staff.delete(`/api/customers/${created.id}`)).status).toBe(404);
  });

  it("returns 409 instead of deleting a customer that has records", async () => {
    const [created] = await seed(acme);
    ctx.customers.referenced.add(created.id);

    const res = await staff.delete(`/api/customers/${created.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
    expect((await staff.get(`/api/customers/${created.id}`)).status).toBe(200);
  });
});

describe("GET /api/customers list", () => {
  beforeEach(async () => {
    await seed(
      { name: "Acme Traders", email: "a@acme.in", city: "Bengaluru", state: "Karnataka" },
      { name: "Bharat Foods", email: "orders@bharat.in", city: "Pune", state: "Maharashtra", phone: "020 1234567" },
      { name: "Chai Point", email: "hi@chai.in", city: "Bengaluru", state: "Karnataka" },
      { name: "Delta Mills", email: "d@delta.in", city: "Mumbai", state: "Maharashtra", gstin: "27ABCDE1234F1Z5" },
      { name: "Eastern Tea", email: "e@east.in", city: "Kolkata", state: "West Bengal" },
    );
  });

  const names = (body: { data: { name: string }[] }) => body.data.map((c) => c.name);

  it("returns { data, total, tookMs }, sorted by name by default", async () => {
    const res = await staff.get("/api/customers");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: expect.any(Array), total: 5, tookMs: expect.any(Number) });
    expect(names(res.body)).toEqual(["Acme Traders", "Bharat Foods", "Chai Point", "Delta Mills", "Eastern Tea"]);
  });

  it("paginates", async () => {
    const page1 = await staff.get("/api/customers?pageSize=2&page=1");
    const page3 = await staff.get("/api/customers?pageSize=2&page=3");

    expect(names(page1.body)).toEqual(["Acme Traders", "Bharat Foods"]);
    expect(names(page3.body)).toEqual(["Eastern Tea"]);
    expect(page3.body.total).toBe(5);
  });

  it("sorts by an allowed field and rejects others", async () => {
    const desc = await staff.get("/api/customers?sort=-name");
    expect(names(desc.body)[0]).toBe("Eastern Tea");

    const bad = await staff.get("/api/customers?sort=gstin");
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.sort[0]).toContain('Cannot sort by "gstin"');
  });

  it("filters by city and state, case-insensitively", async () => {
    const city = await staff.get("/api/customers?city=bengaluru");
    expect(names(city.body)).toEqual(["Acme Traders", "Chai Point"]);
    expect(city.body.total).toBe(2);

    const state = await staff.get("/api/customers?state=Maharashtra&sort=-name");
    expect(names(state.body)).toEqual(["Delta Mills", "Bharat Foods"]);
  });

  it("searches name, email, phone and GSTIN with q", async () => {
    expect(names((await staff.get("/api/customers?q=tea")).body)).toEqual(["Eastern Tea"]);
    expect(names((await staff.get("/api/customers?q=orders@")).body)).toEqual(["Bharat Foods"]);
    expect(names((await staff.get("/api/customers?q=1234567")).body)).toEqual(["Bharat Foods"]);
    expect(names((await staff.get("/api/customers?q=27abcde")).body)).toEqual(["Delta Mills"]);
  });

  it("combines filters with paging", async () => {
    const res = await staff.get("/api/customers?state=karnataka&q=chai&pageSize=1");

    expect(names(res.body)).toEqual(["Chai Point"]);
    expect(res.body.total).toBe(1);
  });

  it("caps pageSize at 100", async () => {
    expect((await staff.get("/api/customers?pageSize=101")).status).toBe(400);
  });
});
