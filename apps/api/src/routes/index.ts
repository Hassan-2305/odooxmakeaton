import { Router } from "express";
import type { EventBus } from "../lib/events.js";
import type { HealthService } from "../services/health.service.js";
import { createEventsRouter } from "./events.routes.js";
import { createHealthRouter } from "./health.routes.js";

export interface RouteDeps {
  healthService: HealthService;
  eventBus: EventBus;
}

/**
 * Mounts every feature router under /api. Each feature follows the same layering:
 * routes (+ validate) → services (business rules) → repositories (queries) → db.
 */
export function createApiRouter(deps: RouteDeps) {
  const api = Router();

  api.use("/health", createHealthRouter(deps.healthService));
  api.use("/events", createEventsRouter(deps.eventBus));

  return api;
}
