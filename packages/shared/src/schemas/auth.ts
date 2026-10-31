import { z } from "zod";
import { emailSchema, nameSchema } from "./common.js";

export const PASSWORD_MIN_LENGTH = 9; // "more than 8 characters"
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be more than ${PASSWORD_MIN_LENGTH - 1} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

const confirmMatches = (data: { password: string; confirmPassword: string }) =>
  data.password === data.confirmPassword;
const confirmMismatch = { message: "Passwords do not match", path: ["confirmPassword"] };

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(confirmMatches, confirmMismatch);
export type RegisterInput = z.infer<typeof registerSchema>;

// Login only checks presence; the password rule applies when a password is set.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(512),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(confirmMatches, confirmMismatch);
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
