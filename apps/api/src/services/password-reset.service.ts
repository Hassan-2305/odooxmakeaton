import type { ForgotPasswordInput, ResetPasswordInput } from "@brightloop/shared";
import { AppError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { Mailer } from "../lib/mailer.js";
import type { PasswordHasher } from "../lib/password.js";
import { randomToken, sha256 } from "../lib/tokens.js";
import type { PasswordResetsRepository } from "../repositories/password-resets.repository.js";
import type { UsersRepository } from "../repositories/users.repository.js";

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

interface Deps {
  users: Pick<UsersRepository, "findByEmail">;
  resets: Pick<PasswordResetsRepository, "create" | "consumeAndSetPassword">;
  hasher: PasswordHasher;
  mailer: Mailer;
  logger: Logger;
  /** Web app origin; the emailed link opens `${appUrl}/reset-password?token=…`. */
  appUrl: string;
  ttlMs?: number;
  now?: () => Date;
}

export function createPasswordResetService({
  users,
  resets,
  hasher,
  mailer,
  logger,
  appUrl,
  ttlMs = RESET_TOKEN_TTL_MS,
  now = () => new Date(),
}: Deps) {
  return {
    /**
     * Emails a single-use reset link if the account exists. Resolves the same way
     * whether or not it does, so the response can't be used to find accounts.
     */
    async requestReset({ email }: ForgotPasswordInput): Promise<void> {
      const user = await users.findByEmail(email);
      if (!user || !user.isActive) return;

      const token = randomToken();
      const issuedAt = now();
      await resets.create(
        { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(issuedAt.getTime() + ttlMs) },
        issuedAt,
      );

      const link = new URL("/reset-password", appUrl);
      link.searchParams.set("token", token);
      const minutes = Math.round(ttlMs / 60_000);

      // Not awaited: SMTP latency would otherwise reveal which emails have accounts.
      mailer
        .send({
          to: user.email,
          subject: "Reset your Recurra password",
          text: [
            `Hi ${user.name},`,
            "",
            "Use this link to choose a new password:",
            link.toString(),
            "",
            `It works once and expires in ${minutes} minutes.`,
            "If you didn't ask for this, you can ignore this email.",
          ].join("\n"),
          html: `<p>Hi ${escapeHtml(user.name)},</p>
<p><a href="${link.toString()}">Choose a new password</a></p>
<p>This link works once and expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.</p>`,
        })
        .catch((err: unknown) =>
          logger.error("password reset email failed", {
            userId: user.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    },

    /** Sets the new password and signs the user out of every session. */
    async resetPassword({ token, password }: ResetPasswordInput): Promise<void> {
      const passwordHash = await hasher.hash(password);
      const userId = await resets.consumeAndSetPassword(sha256(token), passwordHash, now());
      if (!userId) {
        throw new AppError(
          400,
          "invalid_reset_token",
          "This reset link is invalid or has expired. Request a new one.",
        );
      }
    },
  };
}

export type PasswordResetService = ReturnType<typeof createPasswordResetService>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
