import type { HealthRepository } from "../repositories/health.repository.js";

export type HealthStatus =
  | { ok: true; db: "ok"; latencyMs: number }
  | { ok: false; db: "error"; latencyMs: number };

export function createHealthService(repo: Pick<HealthRepository, "ping">) {
  return {
    async check(): Promise<HealthStatus> {
      const start = performance.now();
      try {
        await repo.ping();
        return { ok: true, db: "ok", latencyMs: elapsed(start) };
      } catch {
        return { ok: false, db: "error", latencyMs: elapsed(start) };
      }
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;

function elapsed(start: number) {
  return Math.round((performance.now() - start) * 100) / 100;
}
