import { beforeEach, describe, expect, it } from "vitest";
import { signInAs } from "../test/sign-in.js";
import { createTestApp } from "../test/test-app.js";

const newStaff = { name: "Sam Iyer", email: "Sam@Brightloop.in", password: "Str0ng!pass" };

let ctx: ReturnType<typeof createTestApp>;
beforeEach(() => {
  ctx = createTestApp();
});

describe("POST /api/staff", () => {
  it("returns 403 when staff call it", async () => {
    const staff = await signInAs(ctx.app, ctx.store, "staff");

    const res = await staff.post("/api/staff", newStaff);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    expect(ctx.store.audit).toHaveLength(0);
  });

  it("returns 403 for customers and 401 when signed out", async () => {
    const customer = await signInAs(ctx.app, ctx.store, "customer");
    expect((await customer.post("/api/staff", newStaff)).status).toBe(403);

    const anon = await signInAs(ctx.app, ctx.store, null);
    expect((await anon.post("/api/staff", newStaff)).status).toBe(401);
  });

  it("lets an admin create a staff user who can then sign in", async () => {
    const admin = await signInAs(ctx.app, ctx.store, "admin");

    const res = await admin.post("/api/staff", newStaff);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: "sam@brightloop.in",
      name: "Sam Iyer",
      role: "staff",
      customerId: null,
    });

    const sam = await signInAs(ctx.app, ctx.store, null);
    const login = await sam.post("/api/auth/login", { email: "sam@brightloop.in", password: "Str0ng!pass" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("staff");
  });

  it("writes an audit_log row naming the admin, without the password", async () => {
    const admin = await signInAs(ctx.app, ctx.store, "admin");

    const res = await admin.post("/api/staff", newStaff);

    expect(ctx.store.audit).toEqual([
      {
        actorUserId: admin.user!.id,
        action: "staff.created",
        entityType: "user",
        entityId: res.body.user.id,
        before: null,
        after: { ...res.body.user, isActive: true },
      },
    ]);
    expect(JSON.stringify(ctx.store.audit)).not.toMatch(/passw|\$2[aby]\$/i);
  });

  it("can create another admin", async () => {
    const admin = await signInAs(ctx.app, ctx.store, "admin");

    const res = await admin.post("/api/staff", { ...newStaff, role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("admin");
  });

  it("refuses to create customer users here", async () => {
    const admin = await signInAs(ctx.app, ctx.store, "admin");

    const res = await admin.post("/api/staff", { ...newStaff, role: "customer" });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("role");
  });

  it("returns 409 for an email that's already taken, and writes no audit row", async () => {
    const admin = await signInAs(ctx.app, ctx.store, "admin");
    await admin.post("/api/staff", newStaff);

    const res = await admin.post("/api/staff", { ...newStaff, email: "SAM@brightloop.in" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
    expect(ctx.store.audit).toHaveLength(1);
  });

  it("applies the password rule", async () => {
    const admin = await signInAs(ctx.app, ctx.store, "admin");

    const res = await admin.post("/api/staff", { ...newStaff, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("password");
  });
});
