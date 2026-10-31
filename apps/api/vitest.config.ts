import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // API test files share one Postgres database (DATABASE_URL); running them in
    // parallel lets one file's rows leak into another's counts and scans.
    fileParallelism: false,
  },
});
