import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createEventBus } from "../lib/events.js";
import { createEventsRouter } from "./events.routes.js";

let server: http.Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

async function start(bus = createEventBus(), heartbeatMs?: number) {
  const app = express();
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
