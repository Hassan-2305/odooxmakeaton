import { randomUUID } from "node:crypto";
import type { AuthUser, Customer, CustomerListQuery, UserRole } from "@brightloop/shared";
import { paginate } from "../lib/paginate.js";
import type { AuditEntry } from "../repositories/audit.repository.js";
import type { CustomersRepository } from "../repositories/customers.repository.js";
import type { MailMessage, Mailer } from "../lib/mailer.js";
import type { PasswordResetsRepository } from "../repositories/password-resets.repository.js";
import type { NewSession, SessionsRepository } from "../repositories/sessions.repository.js";
import type { UsersRepository, UserWithPassword } from "../repositories/users.repository.js";

interface FakeReset {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

/** In-memory stand-ins for the users, sessions and password reset repositories. */
export function createFakeAuthStore() {
  const users = new Map<string, UserWithPassword>();
  const sessions = new Map<string, NewSession>();
  const resets: FakeReset[] = [];
  const audit: AuditEntry[] = [];
  /** Set to make the next createCustomerUser fail like a concurrent duplicate insert. */
  let failNextCreateWithUniqueViolation = false;

  const findByEmail = async (email: string) =>
    [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());

  const usersRepo: Pick<
    UsersRepository,
    "findByEmail" | "createCustomerUser" | "touchLastLogin" | "createStaffUser"
  > = {
    findByEmail,
    async createCustomerUser(input) {
      if (failNextCreateWithUniqueViolation || (await findByEmail(input.email))) {
        failNextCreateWithUniqueViolation = false;
        throw Object.assign(new Error("duplicate key"), {
          code: "23505",
          constraint: "users_email_unique",
        });
      }
      const user: UserWithPassword = {
        id: randomUUID(),
        email: input.email,
        name: input.name,
        role: "customer",
        customerId: randomUUID(),
        passwordHash: input.passwordHash,
        isActive: true,
      };
      users.set(user.id, user);
      return toAuthUser(user);
    },
    async touchLastLogin() {},
    async createStaffUser(input, actorUserId) {
      if (await findByEmail(input.email)) {
        throw Object.assign(new Error("duplicate key"), { code: "23505", constraint: "users_email_unique" });
      }
      const user: UserWithPassword = { id: randomUUID(), customerId: null, isActive: true, ...input };
      users.set(user.id, user);
      const authUser = toAuthUser(user);
      audit.push({
        actorUserId,
        action: "staff.created",
        entityType: "user",
        entityId: user.id,
        before: null,
        after: { ...authUser, isActive: true },
      });
      return authUser;
    },
  };

  const sessionsRepo: Pick<SessionsRepository, "create" | "findActiveUser" | "delete"> = {
    async create(session) {
      sessions.set(session.id, session);
    },
    async findActiveUser(sessionId, now = new Date()) {
      const session = sessions.get(sessionId);
      if (!session || session.expiresAt <= now) return undefined;
      const user = users.get(session.userId);
      return user?.isActive ? toAuthUser(user) : undefined;
    },
    async delete(sessionId) {
      sessions.delete(sessionId);
    },
  };

  // Same rules as the SQL: single use, unexpired, and a new request voids older tokens.
  const resetsRepo: Pick<PasswordResetsRepository, "create" | "consumeAndSetPassword"> = {
    async create(input, now = new Date()) {
      for (const r of resets) if (r.userId === input.userId && !r.usedAt) r.usedAt = now;
      resets.push({ ...input, usedAt: null });
    },
    async consumeAndSetPassword(tokenHash, passwordHash, now = new Date()) {
      const reset = resets.find((r) => r.tokenHash === tokenHash && !r.usedAt && r.expiresAt > now);
      if (!reset) return undefined;
      reset.usedAt = now;
      const user = users.get(reset.userId);
      if (user) user.passwordHash = passwordHash;
      for (const [id, s] of sessions) if (s.userId === reset.userId) sessions.delete(id);
      return reset.userId;
    },
  };

  return {
    users,
    sessions,
    resets,
    audit,
    usersRepo,
    sessionsRepo,
    resetsRepo,
    failNextCreate() {
      failNextCreateWithUniqueViolation = true;
    },
    /** Adds a staff/admin user directly, as an admin screen would. */
    addUser(role: UserRole, email: string, passwordHash: string, overrides: Partial<UserWithPassword> = {}) {
      const user: UserWithPassword = {
        id: randomUUID(),
        email,
        name: `${role} user`,
        role,
        customerId: role === "customer" ? randomUUID() : null,
        passwordHash,
        isActive: true,
        ...overrides,
      };
      users.set(user.id, user);
      return user;
    },
  };
}

function toAuthUser({ id, email, name, role, customerId }: UserWithPassword): AuthUser {
  return { id, email, name, role, customerId };
}

/** Captures sent mail instead of delivering it. */
export function createFakeMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

/** A clock tests can move forward. */
export function createFakeClock(start = new Date("2026-11-01T10:00:00Z")) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current += ms;
    },
  };
}

/** In-memory customers repository with the same filter and sort rules as the SQL one. */
export function createFakeCustomersRepo() {
  const rows = new Map<string, Customer>();
  let tick = 0;
  /** Ids that behave as if subscriptions/invoices/users still reference them. */
  const referenced = new Set<string>();

  const repo: CustomersRepository = {
    async list(query: CustomerListQuery) {
      const q = query.q?.toLowerCase();
      let list = [...rows.values()].filter(
        (c) =>
          (!q || [c.name, c.email, c.phone, c.gstin].some((v) => v?.toLowerCase().includes(q))) &&
          (!query.city || c.city?.toLowerCase() === query.city.toLowerCase()) &&
          (!query.state || c.state?.toLowerCase() === query.state.toLowerCase()),
      );
      for (const { field, direction } of [...(query.sort ?? [])].reverse()) {
        list = list.sort((a, b) => {
          const cmp = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
          return direction === "desc" ? -cmp : cmp;
        });
      }
      return paginate(query, async ({ limit, offset }) => ({
        rows: list.slice(offset, offset + limit),
        total: list.length,
      }));
    },
    async findById(id) {
      return rows.get(id);
    },
    async create(input) {
      // Strictly increasing timestamps keep createdAt sorting deterministic.
      const at = new Date(Date.UTC(2026, 10, 1) + tick++ * 1000).toISOString();
      const customer: Customer = {
        id: randomUUID(),
        phone: null,
        gstin: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        ...input,
        createdAt: at,
        updatedAt: at,
      } as Customer;
      rows.set(customer.id, customer);
      return customer;
    },
    async update(id, input) {
      const existing = rows.get(id);
      if (!existing) return undefined;
      const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      const updated = { ...existing, ...defined, updatedAt: new Date().toISOString() } as Customer;
      rows.set(id, updated);
      return updated;
    },
    async delete(id) {
      if (referenced.has(id)) throw Object.assign(new Error("fk violation"), { code: "23503" });
      return rows.delete(id);
    },
  };

  return { repo, rows, referenced };
}
