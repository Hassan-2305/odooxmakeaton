import http from "node:http";
import type { AddressInfo } from "node:net";
import type { AuthUser } from "@brightloop/shared";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createEventBus } from "../lib/events.js";
import { createTestApp } from "../test/test-app.js";
import { createEventsRouter } from "./events.routes.js";

const staff: AuthUser = { id: "u-staff", email: "s@example.in", name: "Staff", role: "staff", customerId: null };
const customer: AuthUser = { id: "u-cust", email: "c@example.in", name: "Cust", role: "customer", customerId: "cust-1" };

let server: http.Server | undefined;

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

/** Mounts the router behind a fake session for `user`. */
async function start(bus = createEventBus(), heartbeatMs?: number, user: AuthUser = staff) {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { user, sessionId: "s-1" };
    next();
  });
  app.use("/api/events", createEventsRouter(bus, { heartbeatMs }));
  server = app.listen(0);
  await new Promise((resolve) => server!.once("listening", resolve));
  return { bus, port: (server.address() as AddressInfo).port };
}

/** Opens the stream and collects text until `until` matches or 2s pass. */
function readStream(port: number, until: (text: string) => boolean, onOpen?: () => void) {
  return new Promise<{ text: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.get({ port, path: "/api/events" }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        text += chunk;
        if (text.includes("event: ready")) onOpen?.();
        if (until(text)) {
          req.destroy();
          resolve({ text, headers: res.headers });
        }
      });
    });
    req.on("error", (err) => (err.message === "socket hang up" ? undefined : reject(err)));
    setTimeout(() => reject(new Error("timed out waiting for SSE data")), 2000).unref();
  });
}

describe("GET /api/events", () => {
  it("returns 401 for an anonymous request", async () => {
    const { app } = createTestApp();

    const res = await request(app).get("/api/events");

    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).not.toContain("text/event-stream");
  });

  it("sends a customer only the events for their own customer", async () => {
    const bus = createEventBus();
    const { port } = await start(bus, undefined, customer);

    const { text } = await readStream(
      port,
      (t) => t.includes("event: payment.recorded"),
      () => {
        bus.emit("invoice.created", { invoiceId: "inv-other", customerId: "cust-2" });
        bus.emit("billing_run.finished", { id: "run-1" });
        bus.emit("payment.recorded", { paymentId: "pay-1", customerId: "cust-1" });
      },
    );

    expect(text).not.toContain("inv-other");
    expect(text).not.toContain("billing_run.finished");
    expect(text).toContain('"customerId":"cust-1"');
  });

  it("sends staff every event", async () => {
    const bus = createEventBus();
    const { port } = await start(bus, undefined, staff);

    const { text } = await readStream(
      port,
      (t) => t.includes("event: billing_run.finished"),
      () => {
        bus.emit("invoice.created", { invoiceId: "inv-other", customerId: "cust-2" });
        bus.emit("billing_run.finished", { id: "run-1" });
      },
    );

    expect(text).toContain("inv-other");
  });

  it("opens an event stream and sends a ready event", async () => {
    const { port } = await start();

    const { text, headers } = await readStream(port, (t) => t.includes("event: ready"));

    expect(headers["content-type"]).toBe("text/event-stream");
    expect(headers["cache-control"]).toContain("no-cache");
    expect(text).toContain("retry: 5000");
  });

  it("forwards emitted events with id, name and JSON data", async () => {
    const bus = createEventBus();
    const { port } = await start(bus);

    const { text } = await readStream(
      port,
      (t) => t.includes("event: invoice.confirmed"),
      () => bus.emit("invoice.confirmed", { id: "inv-1", totalPaise: 59000 }),
    );

    const block = text.split("\n\n").find((b) => b.includes("event: invoice.confirmed"))!;
    const [idLine, eventLine, dataLine] = block.split("\n");
    expect(idLine).toBe("id: 1");
    expect(eventLine).toBe("event: invoice.confirmed");
    expect(JSON.parse(dataLine!.slice("data: ".length))).toMatchObject({
      id: 1,
      event: "invoice.confirmed",
      payload: { id: "inv-1", totalPaise: 59000 },
    });
  });

  it("sends heartbeats on idle connections", async () => {
    const { port } = await start(createEventBus(), 20);

    const { text } = await readStream(port, (t) => t.includes(": heartbeat"));

    expect(text).toContain(": heartbeat");
  });

  it("unsubscribes when the client disconnects", async () => {
    const bus = createEventBus();
    const { port } = await start(bus);

    await readStream(port, (t) => t.includes("event: ready"));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(bus.listenerCount()).toBe(0);
  });
});
