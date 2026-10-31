import type { AuthUser, LoginInput, RegisterInput } from "@brightloop/shared";
import { isUniqueViolation } from "../lib/db-errors.js";
import { AppError } from "../lib/errors.js";
import type { PasswordHasher } from "../lib/password.js";
import { randomToken, sha256 } from "../lib/tokens.js";
import type { SessionsRepository } from "../repositories/sessions.repository.js";
import type { UsersRepository } from "../repositories/users.repository.js";

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface IssuedSession {
  user: AuthUser;
  /** Raw token for the cookie. Only its SHA-256 is stored. */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

interface Deps {
  users: Pick<UsersRepository, "findByEmail" | "createCustomerUser" | "touchLastLogin">;
  sessions: Pick<SessionsRepository, "create" | "findActiveUser" | "delete">;
  hasher: PasswordHasher;
  sessionTtlMs: number;
  now?: () => Date;
}

const emailTaken = () =>
  new AppError(409, "email_taken", "An account with this email already exists", {
    field: "email",
  });

const invalidCredentials = () =>
  new AppError(401, "invalid_credentials", "Email or password is incorrect");

export function createAuthService({ users, sessions, hasher, sessionTtlMs, now = () => new Date() }: Deps) {
  // Compared against when the email is unknown, so both paths take as long.
  let dummyHash: Promise<string> | undefined;

  async function issueSession(user: AuthUser, meta: SessionMeta): Promise<IssuedSession> {
    const token = randomToken();
    const sessionId = sha256(token);
    const expiresAt = new Date(now().getTime() + sessionTtlMs);
    await sessions.create({ id: sessionId, userId: user.id, expiresAt, ...meta });
    return { user, token, sessionId, expiresAt };
  }

  return {
    /** Public sign-up: always creates a customer and its portal user, then signs them in. */
    async register(input: RegisterInput, meta: SessionMeta = {}): Promise<IssuedSession> {
      if (await users.findByEmail(input.email)) throw emailTaken();

      const passwordHash = await hasher.hash(input.password);
      let user: AuthUser;
      try {
        user = await users.createCustomerUser({ name: input.name, email: input.email, passwordHash });
      } catch (err) {
        // Two sign-ups with the same email at once.
        if (isUniqueViolation(err, "users_email_unique")) throw emailTaken();
        throw err;
      }
      return issueSession(user, meta);
    },

    async login(input: LoginInput, meta: SessionMeta = {}): Promise<IssuedSession> {
      const user = await users.findByEmail(input.email);
      if (!user) {
        dummyHash ??= hasher.hash("not-a-real-password");
        await hasher.verify(input.password, await dummyHash);
        throw invalidCredentials();
      }
      const ok = await hasher.verify(input.password, user.passwordHash);
      if (!ok || !user.isActive) throw invalidCredentials();

      await users.touchLastLogin(user.id);
      const { id, email, name, role, customerId } = user;
      return issueSession({ id, email, name, role, customerId }, meta);
    },

    async logout(sessionId: string): Promise<void> {
      await sessions.delete(sessionId);
    },

    /** Resolves a cookie token to its user, or undefined if the session is missing or expired. */
    async authenticate(token: string): Promise<{ user: AuthUser; sessionId: string } | undefined> {
      const sessionId = sha256(token);
      const user = await sessions.findActiveUser(sessionId, now());
      return user && { user, sessionId };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
