import { randomUUID } from "node:crypto";
import type { UserRole } from "@brightloop/shared";
import type { Express } from "express";
import request from "supertest";
import { db, pool } from "../db/client.js";
import { customers, settings, users } from "../db/schema/index.js";
import { createEventBus } from "../lib/events.js";
import { CSRF_HEADER } from "../middleware/csrf.js";
import { createAuditRepository } from "../repositories/audit.repository.js";
import { createSessionsRepository } from "../repositories/sessions.repository.js";
import { createUsersRepository } from "../repositories/users.repository.js";
import { createAuditService } from "../services/audit.service.js";
import { createAuthService } from "../services/auth.service.js";
import { createDomainServices, type DomainOptions } from "../services/domain.js";
import { createFakeMailer } from "./fakes.js";
import { createTestApp, testHasher } from "./test-app.js";

/**
 * Integration tests run against the Postgres in DATABASE_URL (.env). Every test creates
 * its own rows with unique names, so test files can run in parallel on one database.
 */
export { db, pool };

export const BUSINESS_TZ = "Asia/Kolkata";

/** Short unique suffix for names, SKUs and emails. */
export const uniq = () => randomUUID().slice(0, 8);

export async function ensureSettings() {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
}

const PASSWORD = "Test!passw0rd";

/** The real app with real repositories, auth and domain services on the test database. */
export async function createDbTestApp(options: Partial<Omit<DomainOptions, "db">> = {}) {
  await ensureSettings();
  const eventBus = options.eventBus ?? createEventBus();
  const mail = createFakeMailer();
  const auditService = createAuditService({ repo: createAuditRepository(db), timezone: BUSINESS_TZ });
  const domain = createDomainServices({
    db,
    auditService,
    eventBus,
    mailer: mail.mailer,
    timezone: BUSINESS_TZ,
    ...options,
  });
  const authService = createAuthService({
    users: createUsersRepository(db),
    sessions: createSessionsRepository(db),
    hasher: testHasher,
    sessionTtlMs: 60 * 60 * 1000,
  });
  const { app } = createTestApp({ authService, auditService, eventBus, domain });
  const passwordHash = await testHasher.hash(PASSWORD);

  /** A supertest agent signed in as a fresh database user with `role`. */
  async function signIn(role: UserRole) {
    let customerId: string | null = null;
    const email = `${role}.${uniq()}@test.brightloop.in`;
    if (role === "customer") {
      const [customer] = await db
        .insert(customers)
        .values({ name: `Test Customer ${uniq()}`, email })
        .returning({ id: customers.id });
      customerId = customer!.id;
    }
    const [user] = await db
      .insert(users)
      .values({ email, name: `${role} ${uniq()}`, role, passwordHash, customerId })
      .returning({ id: users.id });
    return agentFor(app, email, { id: user!.id, customerId });
  }

  return { app, domain, eventBus, mail, auditService, signIn };
}

async function agentFor(app: Express, email: string, user: { id: string; customerId: string | null }) {
  const agent = request.agent(app);
  let csrf: string = (await agent.get("/api/auth/csrf")).body.csrfToken;
  const login = await agent.post("/api/auth/login").set(CSRF_HEADER, csrf).send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  csrf = login.body.csrfToken;
  return {
    user,
    get: (path: string) => agent.get(path),
    post: (path: string, body?: object) => agent.post(path).set(CSRF_HEADER, csrf).send(body),
    patch: (path: string, body?: object) => agent.patch(path).set(CSRF_HEADER, csrf).send(body),
    delete: (path: string) => agent.delete(path).set(CSRF_HEADER, csrf),
  };
}

/** A customer record for back-office tests. */
export async function createCustomer(name = `Customer ${uniq()}`) {
  const [row] = await db
    .insert(customers)
    .values({ name, email: `${uniq()}@customer.test`, gstin: null, city: "Bengaluru", state: "Karnataka" })
    .returning();
  return row!;
}
