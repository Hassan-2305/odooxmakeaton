import { Router } from "express";
import type { HealthService } from "../services/health.service.js";

export function createHealthRouter(healthService: HealthService) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const status = await healthService.check();
    res.status(status.ok ? 200 : 503).json(status);
  });

  return router;
}
