import express from "express";
import { type Logger, consoleLogger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createApiRouter, type RouteDeps } from "./routes/index.js";

export interface AppDeps extends RouteDeps {
  logger?: Logger;
}

export function createApp({ logger = consoleLogger, ...deps }: AppDeps) {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestLogger(logger));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createApiRouter(deps));

  app.use("/api", notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
