import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { IntegrityService } from "../services/integrity.service.js";
import { signInAs } from "../test/sign-in.js";
import { createTestApp } from "../test/test-app.js";

function appWithIntegrity() {
  const integrityService = {
    scan: vi.fn(async () => ({ detected: 0 })),
    list: vi.fn(async () => ({ data: [], total: 0, tookMs: 0 })),
    get: vi.fn(async () => ({ finding: {}, events: [] })),
    dismiss: vi.fn(async () => ({ status: "dismissed" })),
    resolve: vi.fn(async () => ({ status: "resolved" })),
  } as unknown as IntegrityService;
  return { ...createTestApp({ integrityService }), integrityService };
}

describe("/api/integrity", () => {
  it("lets staff scan, list, view and dismiss", async () => {
    const ctx = appWithIntegrity();
    const staff = await signInAs(ctx.app, ctx.store, "staff");
    const id = randomUUID();

    expect((await staff.post("/api/integrity/scan")).status).toBe(200);
    expect(ctx.integrityService.scan).toHaveBeenCalledWith(expect.objectContaining({ id: staff.user!.id }));
    expect((await staff.get("/api/integrity/findings?status=open&sort=-impactPaise")).status).toBe(200);
    expect((await staff.get(`/api/integrity/findings/${id}`)).status).toBe(200);
    expect((await staff.post(`/api/integrity/findings/${id}/dismiss`, { note: "False alarm" })).status).toBe(200);
  });

  it("allows only admins to resolve", async () => {
    const ctx = appWithIntegrity();
    const staff = await signInAs(ctx.app, ctx.store, "staff");
    const admin = await signInAs(ctx.app, ctx.store, "admin");
    const id = randomUUID();

    expect((await staff.post(`/api/integrity/findings/${id}/resolve`, { action: "refund" })).status).toBe(403);
    expect((await admin.post(`/api/integrity/findings/${id}/resolve`, { action: "refund" })).status).toBe(200);
    expect(ctx.integrityService.resolve).toHaveBeenCalledWith(expect.objectContaining({ id: admin.user!.id }), id, {
      action: "refund",
    });
  });

  it("validates bodies and filters", async () => {
    const ctx = appWithIntegrity();
    const admin = await signInAs(ctx.app, ctx.store, "admin");
    const id = randomUUID();

    expect((await admin.post(`/api/integrity/findings/${id}/dismiss`, {})).status).toBe(400);
    expect((await admin.post(`/api/integrity/findings/${id}/resolve`, {})).status).toBe(400);
    expect((await admin.get("/api/integrity/findings?status=bogus")).status).toBe(400);
    expect((await admin.get("/api/integrity/findings?sort=entityId")).status).toBe(400);
  });

  it("is closed to customers", async () => {
    const ctx = appWithIntegrity();
    const customer = await signInAs(ctx.app, ctx.store, "customer");

    expect((await customer.post("/api/integrity/scan")).status).toBe(403);
    expect((await customer.get("/api/integrity/findings")).status).toBe(403);
  });
});
