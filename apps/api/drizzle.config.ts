import path from "node:path";
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env"));
} catch {
  // No .env file; rely on the real environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "../../database/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
