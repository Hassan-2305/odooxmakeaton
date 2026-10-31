import { pool } from "./client.js";

// Seed data lives in database/seed. This runs on every container start,
// so every seed step must be idempotent.
console.log("nothing to seed yet");
await pool.end();
