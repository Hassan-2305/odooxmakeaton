import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { passwordResets, sessions, users } from "../db/schema/index.js";

export function createPasswordResetsRepository(db: Db) {
  return {
    /** Stores a new reset token and voids any earlier unused ones for the same user. */
    async create(input: { userId: string; tokenHash: string; expiresAt: Date }, now = new Date()) {
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResets)
          .set({ usedAt: now })
          .where(and(eq(passwordResets.userId, input.userId), isNull(passwordResets.usedAt)));
        await tx.insert(passwordResets).values(input);
      });
    },

    /**
     * Marks the token used, sets the new password hash and signs the user out
     * everywhere, all in one transaction. The conditional UPDATE is what makes a
     * token single-use: a second (or concurrent) attempt matches no row.
     * Returns the user id, or undefined if the token is unknown, used or expired.
     */
    async consumeAndSetPassword(
      tokenHash: string,
      passwordHash: string,
      now = new Date(),
    ): Promise<string | undefined> {
      return db.transaction(async (tx) => {
        const [reset] = await tx
          .update(passwordResets)
          .set({ usedAt: now })
          .where(
            and(
              eq(passwordResets.tokenHash, tokenHash),
              isNull(passwordResets.usedAt),
              gt(passwordResets.expiresAt, now),
            ),
          )
          .returning({ userId: passwordResets.userId });
        if (!reset) return undefined;

        await tx
          .update(users)
          .set({ passwordHash, updatedAt: now })
          .where(eq(users.id, reset.userId));
        await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
        return reset.userId;
      });
    },
  };
}

export type PasswordResetsRepository = ReturnType<typeof createPasswordResetsRepository>;
