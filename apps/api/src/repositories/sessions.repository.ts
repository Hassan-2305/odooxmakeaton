import type { AuthUser } from "@brightloop/shared";
import { and, eq, gt, lte } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions, users } from "../db/schema/index.js";

export interface NewSession {
  id: string;
  userId: string;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
}

export function createSessionsRepository(db: Db) {
  return {
    async create(session: NewSession): Promise<void> {
      await db.insert(sessions).values(session);
    },

    /** The session's user, if the session exists, hasn't expired and the user is active. */
    async findActiveUser(sessionId: string, now = new Date()): Promise<AuthUser | undefined> {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          customerId: users.customerId,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now), eq(users.isActive, true)))
        .limit(1);
      return user;
    },

    async delete(sessionId: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    },

    async deleteExpired(now = new Date()): Promise<number> {
      const deleted = await db
        .delete(sessions)
        .where(lte(sessions.expiresAt, now))
        .returning({ id: sessions.id });
      return deleted.length;
    },
  };
}

export type SessionsRepository = ReturnType<typeof createSessionsRepository>;
