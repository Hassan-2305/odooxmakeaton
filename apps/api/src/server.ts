import { createApp } from "./app.js";
import { env } from "./config.js";
import { db, pool } from "./db/client.js";
import { createHealthRepository } from "./repositories/health.repository.js";
import { createHealthService } from "./services/health.service.js";

const app = createApp({
  healthService: createHealthService(createHealthRepository(db)),
});

const server = app.listen(env.PORT, () => {
  console.log(`api listening on http://localhost:${env.PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().then(() => process.exit(0)));
  });
}
