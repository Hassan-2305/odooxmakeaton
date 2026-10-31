import cookieParser from "cookie-parser";
import express from "express";
import { type Logger, consoleLogger } from "./lib/logger.js";
import { loadSession } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createApiRouter, type RouteDeps } from "./routes/index.js";

export interface AppDeps extends RouteDeps {
  logger?: Logger;
  /** Number of reverse proxies to trust for the client IP (rate limiting). */
  trustProxy?: number;
}

export function createApp({ logger = consoleLogger, trustProxy = 0, ...deps }: AppDeps) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.use(requestLogger(logger));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(loadSession(deps.authService, { secure: deps.secureCookies }));
  // Every POST/PUT/PATCH/DELETE under /api needs a valid CSRF token.
  app.use("/api", deps.csrf.protect);

  app.use("/api", createApiRouter(deps));

  app.use("/api", notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
