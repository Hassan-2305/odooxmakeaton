import { db, pool } from "./client.js";
import { settings } from "./schema/index.js";

// This runs on every container start, so every seed step must be idempotent.
await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
console.log("settings row ensured");

await pool.end();
