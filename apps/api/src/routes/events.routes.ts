import type { AuthUser } from "@brightloop/shared";
import { Router } from "express";
import type { AppEvent, EventBus } from "../lib/events.js";
import { currentUser, requireAuth } from "../middleware/auth.js";

interface Options {
  /** Comment line sent on idle connections so proxies don't close them. */
  heartbeatMs?: number;
}

/**
 * Admin and staff see every event. A customer sees only events whose payload carries
 * their own customerId; events without one (e.g. billing_run.finished) are never sent.
 */
export function canSee(user: Pick<AuthUser, "role" | "customerId">, event: AppEvent): boolean {
  if (user.role === "admin" || user.role === "staff") return true;
  if (!user.customerId) return false;
  const payload = event.payload as { customerId?: unknown } | null;
  return payload?.customerId === user.customerId;
}

/** GET /api/events: Server-Sent Events stream of the bus events the signed-in user may see. */
export function createEventsRouter(bus: EventBus, { heartbeatMs = 25_000 }: Options = {}) {
  const router = Router();

  router.get("/", requireAuth, (req, res) => {
    const user = currentUser(req);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 5000\n\n");
    write(res, { id: 0, event: "ready", payload: {}, at: new Date().toISOString() });

    const unsubscribe = bus.subscribe((event) => {
      if (canSee(user, event)) write(res, event);
    });
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
