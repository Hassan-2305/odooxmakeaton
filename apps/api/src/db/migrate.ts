import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

const migrationsFolder = path.resolve(process.cwd(), "../../database/migrations");

await migrate(db, { migrationsFolder });
console.log("migrations applied");
await pool.end();
