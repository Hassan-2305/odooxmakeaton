import { z } from "zod";
import { passwordSchema } from "./auth.js";
import { emailSchema, nameSchema } from "./common.js";

/** Back-office roles an admin can create. Customers sign up through /auth/register. */
export const STAFF_ROLES = ["staff", "admin"] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const createStaffSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  /** Initial password, set by the admin. Same rule as self-service passwords. */
  password: passwordSchema,
  role: staffRoleSchema.default("staff"),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
