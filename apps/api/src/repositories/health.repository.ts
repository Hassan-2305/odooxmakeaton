import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";

export function createHealthRepository(db: Db) {
  return {
    async ping() {
      await db.execute(sql`select 1`);
    },
  };
}

export type HealthRepository = ReturnType<typeof createHealthRepository>;
