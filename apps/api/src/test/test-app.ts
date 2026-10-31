import { type AppDeps, createApp } from "../app.js";
import { createEventBus } from "../lib/events.js";
import { silentLogger } from "../lib/logger.js";
import { createPasswordHasher } from "../lib/password.js";
import { createCsrf } from "../middleware/csrf.js";
import { createAuthService } from "../services/auth.service.js";
import { createCustomersService } from "../services/customers.service.js";
import { createHealthService } from "../services/health.service.js";
import { createPasswordResetService } from "../services/password-reset.service.js";
import { createStaffService } from "../services/staff.service.js";
import { createFakeAuthStore, createFakeClock, createFakeCustomersRepo, createFakeMailer } from "./fakes.js";

export const TEST_SECRET = "test-secret-that-is-at-least-32-characters";

/** Low bcrypt cost keeps tests fast. */
export const testHasher = createPasswordHasher(4);

/** The real app wired to in-memory repositories. Override any dependency per test. */
export function createTestApp(overrides: Partial<AppDeps> = {}) {
  const store = createFakeAuthStore();
  const clock = createFakeClock();
  const mail = createFakeMailer();
  const authService = createAuthService({
    users: store.usersRepo,
    sessions: store.sessionsRepo,
    hasher: testHasher,
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    now: clock.now,
  });
  const passwordResetService = createPasswordResetService({
    users: store.usersRepo,
    resets: store.resetsRepo,
    hasher: testHasher,
    mailer: mail.mailer,
    logger: silentLogger,
    appUrl: "http://localhost:3000",
    now: clock.now,
  });
  const customers = createFakeCustomersRepo();

  const app = createApp({
    logger: silentLogger,
    eventBus: createEventBus(),
    secureCookies: false,
    csrf: createCsrf(TEST_SECRET, { secure: false }),
    healthService: createHealthService({ ping: async () => {} }),
    authService,
    passwordResetService,
    staffService: createStaffService({ users: store.usersRepo, hasher: testHasher }),
    customersService: createCustomersService({ customers: customers.repo }),
    authRateLimit: false,
    ...overrides,
  });

  return { app, store, authService, passwordResetService, clock, mail, customers };
}
