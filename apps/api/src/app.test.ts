import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createEventBus } from "./lib/events.js";
import { silentLogger } from "./lib/logger.js";
import { createHealthService } from "./services/health.service.js";

function appWithPing(ping: () => Promise<void>) {
  return createApp({
    logger: silentLogger,
    eventBus: createEventBus(),
    healthService: createHealthService({ ping }),
  });
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

describe("app wiring", () => {
  it("returns a JSON 404 for unknown API routes", async () => {
    const res = await request(appWithPing(async () => {})).get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "not_found", message: "Route GET /api/nope not found" },
    });
  });

  it("sets a request id, keeping one sent by the client", async () => {
    const app = appWithPing(async () => {});

    const generated = await request(app).get("/api/health");
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const passed = await request(app).get("/api/health").set("x-request-id", "abc-123");
    expect(passed.headers["x-request-id"]).toBe("abc-123");
  });
});
