import express from "express";
import { createHealthRouter } from "./routes/health.routes.js";
import type { HealthService } from "./services/health.service.js";

export interface AppDeps {
  healthService: HealthService;
}

export function createApp({ healthService }: AppDeps) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use("/api/health", createHealthRouter(healthService));

  return app;
}
