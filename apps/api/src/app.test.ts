import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createHealthService } from "./services/health.service.js";

function appWithPing(ping: () => Promise<void>) {
  return createApp({ healthService: createHealthService({ ping }) });
}

describe("GET /api/health", () => {
  it("returns db ok with latency when the database responds", async () => {
    const res = await request(appWithPing(async () => {})).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: "ok", latencyMs: expect.any(Number) });
    expect(res.body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns 503 with db error when the database is unreachable", async () => {
    const res = await request(
      appWithPing(async () => {
        throw new Error("connection refused");
      }),
    ).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: "error", latencyMs: expect.any(Number) });
  });
});
