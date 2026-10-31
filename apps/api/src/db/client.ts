import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});

// Idle clients error when Postgres restarts; log instead of crashing the process.
pool.on("error", (err) => {
  console.error("postgres pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
