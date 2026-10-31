import {
  billingRunListQuerySchema,
  billingRunQuerySchema,
  billingRunRequestSchema,
  idParamSchema,
  type BillingRunListQuery,
  type BillingRunQuery,
  type BillingRunRequest,
  type IdParam,
} from "@brightloop/shared";
import { Router } from "express";
import { currentUser, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { BillingService } from "../services/billing.service.js";

/** Billing runs: admin and staff. */
export function createBillingRouter({ billingService }: { billingService: BillingService }) {
  const router = Router();

  router.use(requireRole("admin", "staff"));

  router.post(
    "/runs",
    validate({ query: billingRunQuerySchema, body: billingRunRequestSchema }),
    async (req, res) => {
      const { mode } = req.query as unknown as BillingRunQuery;
      const body = req.body as BillingRunRequest;
      const run = await billingService.run({ mode, trigger: "manual", actor: currentUser(req), ...body });
      res.status(mode === "live" ? 201 : 200).json({ run });
    },
  );

  router.get("/runs", validate({ query: billingRunListQuerySchema }), async (req, res) => {
    res.json(await billingService.list(req.query as unknown as BillingRunListQuery));
  });

  router.get("/runs/:id", validate({ params: idParamSchema }), async (req, res) => {
    res.json({ run: await billingService.get((req.params as IdParam).id) });
  });

  return router;
}
