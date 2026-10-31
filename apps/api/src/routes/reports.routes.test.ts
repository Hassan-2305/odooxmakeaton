import { describe, expect, it, vi } from "vitest";
import type { ReportsService } from "../services/reports.service.js";
import { signInAs } from "../test/sign-in.js";
import { createTestApp } from "../test/test-app.js";

function appWithReports() {
  const reportsService = {
    summary: vi.fn(async () => ({ tookMs: 1 })),
    aging: vi.fn(async () => ({ tookMs: 1 })),
    collections: vi.fn(async () => ({ tookMs: 1 })),
    renewals: vi.fn(async () => ({ tookMs: 1 })),
  } as unknown as ReportsService;
  return { ...createTestApp({ reportsService }), reportsService };
}

describe("/api/reports", () => {
  it("is available to admin and staff", async () => {
    const ctx = appWithReports();
    for (const role of ["admin", "staff"] as const) {
      const agent = await signInAs(ctx.app, ctx.store, role);
      for (const path of ["summary", "aging", "collections", "renewals"]) {
        expect((await agent.get(`/api/reports/${path}`)).status).toBe(200);
      }
    }
  });

  it("returns 403 for customers and 401 when signed out", async () => {
    const ctx = appWithReports();
    const customer = await signInAs(ctx.app, ctx.store, "customer");
    const anon = await signInAs(ctx.app, ctx.store, null);

    expect((await customer.get("/api/reports/summary")).status).toBe(403);
    expect((await anon.get("/api/reports/summary")).status).toBe(401);
  });

  it("validates the query and passes it through parsed", async () => {
    const ctx = appWithReports();
    const staff = await signInAs(ctx.app, ctx.store, "staff");

    expect((await staff.get("/api/reports/summary?from=2026-10-10&to=2026-10-01")).status).toBe(400);
    expect((await staff.get("/api/reports/summary?customer_id=nope")).status).toBe(400);
    expect((await staff.get("/api/reports/renewals?days=0")).status).toBe(400);

    await staff.get("/api/reports/renewals");
    expect(ctx.reportsService.renewals).toHaveBeenCalledWith({ days: 30 });
  });
});
