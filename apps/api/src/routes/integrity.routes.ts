import {
  dismissFindingSchema,
  findingListQuerySchema,
  idParamSchema,
  resolveFindingSchema,
  type DismissFindingInput,
  type FindingListQuery,
  type IdParam,
  type ResolveFindingInput,
} from "@brightloop/shared";
import { Router } from "express";
import { currentUser, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { IntegrityService } from "../services/integrity.service.js";

/** Revenue integrity: run the scanner and review its findings. Resolving is admin-only. */
export function createIntegrityRouter({ integrityService }: { integrityService: IntegrityService }) {
  const router = Router();

  router.use(requireRole("admin", "staff"));

  router.post("/scan", async (req, res) => {
    res.json(await integrityService.scan(currentUser(req)));
  });

  router.get("/findings", validate({ query: findingListQuerySchema }), async (req, res) => {
    res.json(await integrityService.list(req.query as unknown as FindingListQuery));
  });

  router.get("/findings/:id", validate({ params: idParamSchema }), async (req, res) => {
    res.json(await integrityService.get((req.params as unknown as IdParam).id));
  });

  router.post(
    "/findings/:id/dismiss",
    validate({ params: idParamSchema, body: dismissFindingSchema }),
    async (req, res) => {
      const { id } = req.params as unknown as IdParam;
      const finding = await integrityService.dismiss(currentUser(req), id, req.body as DismissFindingInput);
      res.json({ finding });
    },
  );

  router.post(
    "/findings/:id/resolve",
    requireRole("admin"),
    validate({ params: idParamSchema, body: resolveFindingSchema }),
    async (req, res) => {
      const { id } = req.params as unknown as IdParam;
      const finding = await integrityService.resolve(currentUser(req), id, req.body as ResolveFindingInput);
      res.json({ finding });
    },
  );

  return router;
}
