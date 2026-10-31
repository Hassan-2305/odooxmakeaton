import { Router } from "express";
import type { AppEvent, EventBus } from "../lib/events.js";

interface Options {
  /** Comment line sent on idle connections so proxies don't close them. */
  heartbeatMs?: number;
}

/**
 * GET /api/events: Server-Sent Events stream of every bus event.
 * TODO: once sessions exist, require auth and scope customer users to their own events.
 */
export function createEventsRouter(bus: EventBus, { heartbeatMs = 25_000 }: Options = {}) {
  const router = Router();

  router.get("/", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 5000\n\n");
    write(res, { id: 0, event: "ready", payload: {}, at: new Date().toISOString() });

    const unsubscribe = bus.subscribe((event) => write(res, event));
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), heartbeatMs);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}

function write(res: NodeJS.WritableStream, event: AppEvent) {
  res.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
}
