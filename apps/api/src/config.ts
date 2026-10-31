import path from "node:path";
import { z } from "zod";

// Load the repo-root .env for local runs. Variables already set in the
// environment (e.g. by docker compose) take precedence.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // No .env file; rely on the real environment.
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
});

export const env = envSchema.parse(process.env);
