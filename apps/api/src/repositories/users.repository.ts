import type { AuthUser } from "@brightloop/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { customers, users } from "../db/schema/index.js";
import { writeAudit } from "./audit.repository.js";

export interface UserWithPassword extends AuthUser {
  passwordHash: string;
  isActive: boolean;
}

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  customerId: users.customerId,
  passwordHash: users.passwordHash,
  isActive: users.isActive,
};

export function createUsersRepository(db: Db) {
  return {
    async findByEmail(email: string): Promise<UserWithPassword | undefined> {
      const [user] = await db
        .select(userColumns)
        .from(users)
        .where(sql`lower(${users.email}) = lower(${email})`)
        .limit(1);
      return user;
    },

    /** Creates the customer record and its portal user together. */
    async createCustomerUser(input: {
      name: string;
      email: string;
      passwordHash: string;
    }): Promise<AuthUser> {
      return db.transaction(async (tx) => {
        const [customer] = await tx
          .insert(customers)
          .values({ name: input.name, email: input.email })
          .returning({ id: customers.id });
        const [user] = await tx
          .insert(users)
          .values({
            name: input.name,
            email: input.email,
            passwordHash: input.passwordHash,
            role: "customer",
            customerId: customer!.id,
          })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            customerId: users.customerId,
          });
        return user!;
      });
    },

    async touchLastLogin(userId: string): Promise<void> {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    },

    /** Creates a staff/admin user and its audit_log row in one transaction. */
    async createStaffUser(
      input: { name: string; email: string; passwordHash: string; role: "staff" | "admin" },
      actorUserId: string,
    ): Promise<AuthUser> {
      return db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ ...input, customerId: null })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            customerId: users.customerId,
          });
        await writeAudit(tx, {
          actorUserId,
          action: "staff.created",
          entityType: "user",
          entityId: user!.id,
          before: null,
          // Never the password hash.
          after: { ...user, isActive: true },
        });
        return user!;
      });
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
