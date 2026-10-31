import path from "node:path";
import { z } from "zod";
import { isTimeZone } from "./lib/time.js";

// Load the repo-root .env for local runs. Variables already set in the
// environment (e.g. by docker compose) take precedence.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // No .env file; rely on the real environment.
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Signs CSRF tokens. Use a long random string in production. */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Number of reverse proxies in front of the API, for client IPs in rate limiting. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Public URL of the web app, used in emailed links. */
  APP_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().min(3).default("Recurra <no-reply@recurra.local>"),
  /** IANA timezone for calendar-day logic (billing days, date filters). */
  BUSINESS_TZ: z.string().refine(isTimeZone, "Unknown timezone").default("Asia/Kolkata"),
});

export const env = envSchema.parse(process.env);
