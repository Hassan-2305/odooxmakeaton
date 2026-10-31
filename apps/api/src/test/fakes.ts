import { randomUUID } from "node:crypto";
import type { AuthUser, UserRole } from "@brightloop/shared";
import type { NewSession, SessionsRepository } from "../repositories/sessions.repository.js";
import type { UsersRepository, UserWithPassword } from "../repositories/users.repository.js";

/** In-memory stand-ins for the users and sessions repositories. */
export function createFakeAuthStore() {
  const users = new Map<string, UserWithPassword>();
  const sessions = new Map<string, NewSession>();
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

  return {
    users,
    sessions,
    usersRepo,
    sessionsRepo,
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
