import { randomUUID } from "node:crypto";
import type { AuthUser, UserRole } from "@brightloop/shared";
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
  /** Set to make the next createCustomerUser fail like a concurrent duplicate insert. */
  let failNextCreateWithUniqueViolation = false;

  const findByEmail = async (email: string) =>
    [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());

  const usersRepo: Pick<UsersRepository, "findByEmail" | "createCustomerUser" | "touchLastLogin"> = {
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
