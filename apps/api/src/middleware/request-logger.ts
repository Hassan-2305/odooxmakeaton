import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "../lib/logger.js";

/** Logs one line per request when the response finishes, with its duration. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    const requestId = req.get("x-request-id") ?? randomUUID();
    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
      const fields = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      };
      if (res.statusCode >= 500) logger.error("request", fields);
      else if (res.statusCode >= 400) logger.warn("request", fields);
      else logger.info("request", fields);
    });

    next();
  };
}
