import { createApp } from "./app.js";
import { env } from "./config.js";
import { db, pool } from "./db/client.js";
import { eventBus } from "./lib/events.js";
import { consoleLogger } from "./lib/logger.js";
import { createSmtpMailer } from "./lib/mailer.js";
import { createPasswordHasher } from "./lib/password.js";
import { createCsrf } from "./middleware/csrf.js";
import { createAuditRepository } from "./repositories/audit.repository.js";
import { createCustomersRepository } from "./repositories/customers.repository.js";
import { createHealthRepository } from "./repositories/health.repository.js";
import { createPasswordResetsRepository } from "./repositories/password-resets.repository.js";
import { createPortalRepository } from "./repositories/portal.repository.js";
import { createReportsRepository } from "./repositories/reports.repository.js";
import { createSessionsRepository } from "./repositories/sessions.repository.js";
import { createUsersRepository } from "./repositories/users.repository.js";
import { createAuthService } from "./services/auth.service.js";
import { createAuditService } from "./services/audit.service.js";
import { scheduleBillingRuns } from "./services/billing.scheduler.js";
import { createCustomersService } from "./services/customers.service.js";
import { createDomainServices } from "./services/domain.js";
import { createHealthService } from "./services/health.service.js";
import { createPasswordResetService } from "./services/password-reset.service.js";
import { createPortalService } from "./services/portal.service.js";
import { createReportsService } from "./services/reports.service.js";
import { createStaffService } from "./services/staff.service.js";

const secureCookies = env.NODE_ENV === "production";
const users = createUsersRepository(db);
const hasher = createPasswordHasher(12);
const mailer = createSmtpMailer({ host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.MAIL_FROM });
const auditService = createAuditService({ repo: createAuditRepository(db), timezone: env.BUSINESS_TZ });

const domain = createDomainServices({
  db,
  auditService,
  eventBus,
  mailer,
  timezone: env.BUSINESS_TZ,
  logger: consoleLogger,
});

const app = createApp({
  logger: consoleLogger,
  trustProxy: env.TRUST_PROXY,
  eventBus,
  secureCookies,
  csrf: createCsrf(env.SESSION_SECRET, { secure: secureCookies }),
  healthService: createHealthService(createHealthRepository(db)),
  authService: createAuthService({
    users,
    sessions: createSessionsRepository(db),
    hasher,
    sessionTtlMs: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  }),
  passwordResetService: createPasswordResetService({
    users,
    resets: createPasswordResetsRepository(db),
    hasher,
    mailer,
    logger: consoleLogger,
    appUrl: env.APP_URL,
  }),
  staffService: createStaffService({ users, hasher }),
  customersService: createCustomersService({ customers: createCustomersRepository(db) }),
  auditService,
  integrityService: domain.integrityService,
  portalService: createPortalService({
    repo: createPortalRepository(db),
    invoicePdf: (id) => domain.invoiceActionsService.pdf(id),
  }),
  reportsService: createReportsService({ repo: createReportsRepository(db), timezone: env.BUSINESS_TZ }),
  domain,
});

const server = app.listen(env.PORT, () => {
  consoleLogger.info(`api listening on http://localhost:${env.PORT}`);
});

const billingCron = scheduleBillingRuns(domain.billingService, { timezone: env.BUSINESS_TZ, logger: consoleLogger });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void billingCron.stop();
    server.close(() => void pool.end().then(() => process.exit(0)));
    // Open SSE streams never finish on their own.
    server.closeAllConnections();
  });
}
