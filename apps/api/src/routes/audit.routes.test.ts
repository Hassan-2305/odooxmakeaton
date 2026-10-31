import { beforeEach, describe, expect, it } from "vitest";
import { redact } from "../repositories/audit.repository.js";
import { signInAs } from "../test/sign-in.js";
import { createTestApp } from "../test/test-app.js";

const INVOICE_ID = "6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

let ctx: ReturnType<typeof createTestApp>;
let admin: Awaited<ReturnType<typeof signInAs>>;

beforeEach(async () => {
  ctx = createTestApp();
  admin = await signInAs(ctx.app, ctx.store, "admin");
});

describe("auditService.audit()", () => {
  it("records actor, entity, id, action, before and after", async () => {
    await ctx.auditService.audit(admin.user!, "invoice", INVOICE_ID, "invoice.confirmed", { status: "draft" }, { status: "confirmed" });

    expect(ctx.store.audit).toEqual([
      {
        actorUserId: admin.user!.id,
        entityType: "invoice",
        entityId: INVOICE_ID,
        action: "invoice.confirmed",
        before: { status: "draft" },
        after: { status: "confirmed" },
      },
    ]);
  });

  it("allows a null actor for system actions", async () => {
    await ctx.auditService.audit(null, "invoice", INVOICE_ID, "invoice.created", null, { totalPaise: 59000 });

    expect(ctx.store.audit[0]).toMatchObject({ actorUserId: null, before: null });
  });

  it("redacts passwords and tokens at any depth", async () => {
    await ctx.auditService.audit(admin.user!, "user", INVOICE_ID, "user.updated", { passwordHash: "$2b$12$abc" }, {
      email: "a@b.in",
      nested: { token: "secret", tokenHash: "f00", keep: 1 },
      list: [{ password: "Str0ng!pass" }],
    });

    expect(ctx.store.audit[0]!.before).toEqual({ passwordHash: "[redacted]" });
    expect(ctx.store.audit[0]!.after).toEqual({
      email: "a@b.in",
      nested: { token: "[redacted]", tokenHash: "[redacted]", keep: 1 },
      list: [{ password: "[redacted]" }],
    });
  });

  it("redact() leaves non-secret values alone", () => {
    expect(redact({ a: 1, b: "x", c: null, d: [1, 2] })).toEqual({ a: 1, b: "x", c: null, d: [1, 2] });
    expect(redact(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("GET /api/audit", () => {
  beforeEach(async () => {
    await admin.post("/api/staff", { name: "Sam", email: "sam@brightloop.in", password: "Str0ng!pass" });
    await ctx.auditService.audit(admin.user!, "invoice", INVOICE_ID, "invoice.confirmed", null, { status: "confirmed" });
    await ctx.auditService.audit(null, "invoice", INVOICE_ID, "invoice.paid", null, { status: "paid" });
  });

  it("returns 403 for staff and customers, 401 when signed out", async () => {
    expect((await (await signInAs(ctx.app, ctx.store, "staff")).get("/api/audit")).status).toBe(403);
    expect((await (await signInAs(ctx.app, ctx.store, "customer")).get("/api/audit")).status).toBe(403);
    expect((await (await signInAs(ctx.app, ctx.store, null)).get("/api/audit")).status).toBe(401);
  });

  it("lists entries newest first as { data, total, tookMs } with the actor", async () => {
    const res = await admin.get("/api/audit");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.tookMs).toEqual(expect.any(Number));
    expect(res.body.data.map((e: { action: string }) => e.action)).toEqual([
      "invoice.paid",
      "invoice.confirmed",
      "staff.created",
    ]);
    expect(res.body.data[0].actor).toBeNull();
    expect(res.body.data[1].actor).toEqual({
      id: admin.user!.id,
      email: admin.user!.email,
      name: admin.user!.name,
    });
  });

  it("filters by entity, exact action and action prefix", async () => {
    const byEntity = await admin.get(`/api/audit?entityType=invoice&entityId=${INVOICE_ID}`);
    expect(byEntity.body.total).toBe(2);

    const exact = await admin.get("/api/audit?action=invoice.paid");
    expect(exact.body.data.map((e: { action: string }) => e.action)).toEqual(["invoice.paid"]);

    const prefix = await admin.get("/api/audit?action=invoice.");
    expect(prefix.body.total).toBe(2);
  });

  it("filters by actor and paginates", async () => {
    const res = await admin.get(`/api/audit?actorUserId=${admin.user!.id}&pageSize=1&page=2`);

    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe("staff.created");
  });

  it("passes date filters and the business timezone to the repository", async () => {
    await admin.get("/api/audit?from=2026-11-01&to=2026-11-30&sort=action");

    expect(ctx.auditRepo.queries.at(-1)).toEqual({
      timezone: "Asia/Kolkata",
      query: {
        page: 1,
        pageSize: 20,
        from: "2026-11-01",
        to: "2026-11-30",
        sort: [{ field: "action", direction: "asc" }],
      },
    });
  });

  it.each([
    ["an invalid date", "from=2026-13-01", "from"],
    ["to before from", "from=2026-11-10&to=2026-11-01", "to"],
    ["a non-uuid actor", "actorUserId=sam", "actorUserId"],
    ["an unknown sort field", "sort=before", "sort"],
  ])("returns 400 for %s", async (_label, qs, field) => {
    const res = await admin.get(`/api/audit?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty(field);
  });
});
