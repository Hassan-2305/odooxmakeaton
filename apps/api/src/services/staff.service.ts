import type { AuthUser, CreateStaffInput } from "@brightloop/shared";
import { isUniqueViolation } from "../lib/db-errors.js";
import { AppError } from "../lib/errors.js";
import type { PasswordHasher } from "../lib/password.js";
import type { UsersRepository } from "../repositories/users.repository.js";

const emailTaken = () =>
  new AppError(409, "email_taken", "An account with this email already exists", { field: "email" });

interface Deps {
  users: Pick<UsersRepository, "findByEmail" | "createStaffUser">;
  hasher: PasswordHasher;
}

export function createStaffService({ users, hasher }: Deps) {
  return {
    /** Admin-only. The repository writes the audit_log row in the same transaction. */
    async create(input: CreateStaffInput, actor: AuthUser): Promise<AuthUser> {
      if (await users.findByEmail(input.email)) throw emailTaken();
      const passwordHash = await hasher.hash(input.password);
      try {
        return await users.createStaffUser(
          { name: input.name, email: input.email, passwordHash, role: input.role },
          actor.id,
        );
      } catch (err) {
        if (isUniqueViolation(err, "users_email_unique")) throw emailTaken();
        throw err;
      }
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;
