import { Router } from "express";
import type { EventBus } from "../lib/events.js";
import type { Csrf } from "../middleware/csrf.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";
import type { CustomersService } from "../services/customers.service.js";
import type { HealthService } from "../services/health.service.js";
import type { IntegrityService } from "../services/integrity.service.js";
import type { PasswordResetService } from "../services/password-reset.service.js";
import type { PortalService } from "../services/portal.service.js";
import type { ReportsService } from "../services/reports.service.js";
import type { StaffService } from "../services/staff.service.js";
import { createAuditRouter } from "./audit.routes.js";
import { type AuthRateLimit, createAuthRouter } from "./auth.routes.js";
import { createCustomersRouter } from "./customers.routes.js";
import { createEventsRouter } from "./events.routes.js";
import { createHealthRouter } from "./health.routes.js";
import { createIntegrityRouter } from "./integrity.routes.js";
import { createPortalRouter } from "./portal.routes.js";
import { createReportsRouter } from "./reports.routes.js";
import { createStaffRouter } from "./staff.routes.js";

export interface RouteDeps {
  healthService: HealthService;
  authService: AuthService;
  passwordResetService: PasswordResetService;
  staffService: StaffService;
  customersService: CustomersService;
  auditService: AuditService;
  reportsService: ReportsService;
  portalService: PortalService;
  integrityService: IntegrityService;
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
  api.use("/staff", createStaffRouter({ staffService: deps.staffService }));
  api.use("/customers", createCustomersRouter({ customersService: deps.customersService }));
  api.use("/audit", createAuditRouter({ auditService: deps.auditService }));
  api.use("/portal", createPortalRouter(deps));
  api.use("/events", createEventsRouter(deps.eventBus));
  api.use("/reports", createReportsRouter(deps));
  api.use("/integrity", createIntegrityRouter(deps));

  return api;
}
