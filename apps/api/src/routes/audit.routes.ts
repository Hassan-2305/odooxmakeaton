import { auditListQuerySchema, type AuditListQuery } from "@brightloop/shared";
import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { AuditService } from "../services/audit.service.js";

export function createAuditRouter({ auditService }: { auditService: AuditService }) {
  const router = Router();

  router.use(requireRole("admin"));

  router.get("/", validate({ query: auditListQuerySchema }), async (req, res) => {
    res.json(await auditService.list(req.query as unknown as AuditListQuery));
  });

  return router;
}
