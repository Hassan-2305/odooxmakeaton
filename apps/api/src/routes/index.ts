import { Router } from "express";
import type { EventBus } from "../lib/events.js";
import type { Csrf } from "../middleware/csrf.js";
import type { AuthService } from "../services/auth.service.js";
import type { HealthService } from "../services/health.service.js";
import type { PasswordResetService } from "../services/password-reset.service.js";
import { type AuthRateLimit, createAuthRouter } from "./auth.routes.js";
import { createEventsRouter } from "./events.routes.js";
import { createHealthRouter } from "./health.routes.js";

export interface RouteDeps {
  healthService: HealthService;
  authService: AuthService;
  passwordResetService: PasswordResetService;
  eventBus: EventBus;
  csrf: Csrf;
  secureCookies: boolean;
  authRateLimit?: AuthRateLimit | false;
}

/**
 * Mounts every feature router under /api. Each feature follows the same layering:
 * routes (+ validate) → services (business rules) → repositories (queries) → db.
 */
export function createApiRouter(deps: RouteDeps) {
  const api = Router();

  api.use("/health", createHealthRouter(deps.healthService));
  api.use(
    "/auth",
    createAuthRouter({
      authService: deps.authService,
      passwordResetService: deps.passwordResetService,
      csrf: deps.csrf,
      secureCookies: deps.secureCookies,
      rateLimit: deps.authRateLimit,
    }),
  );
  api.use("/events", createEventsRouter(deps.eventBus));

  return api;
}
