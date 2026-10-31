import {
  createDiscountRuleSchema,
  discountRuleListQuerySchema,
  idParamSchema,
  updateDiscountRuleSchema,
  type DiscountRuleListQuery,
  type IdParam,
} from "@brightloop/shared";
import { Router } from "express";
import { currentUser, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { DiscountService } from "../services/discount.service.js";

/** Discount rules: admin only, reads included. Every write is audited. */
export function createDiscountsRouter({ discountService }: { discountService: DiscountService }) {
  const router = Router();

  router.use(requireRole("admin"));

  router.get("/", validate({ query: discountRuleListQuerySchema }), async (req, res) => {
    res.json(await discountService.list(req.query as unknown as DiscountRuleListQuery));
  });

  router.post("/", validate({ body: createDiscountRuleSchema }), async (req, res) => {
    res.status(201).json({ discount: await discountService.create(currentUser(req), req.body) });
  });

  router.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
    res.json({ discount: await discountService.get((req.params as IdParam).id) });
  });

  router.patch("/:id", validate({ params: idParamSchema, body: updateDiscountRuleSchema }), async (req, res) => {
    res.json({ discount: await discountService.update(currentUser(req), (req.params as IdParam).id, req.body) });
  });

  router.delete("/:id", validate({ params: idParamSchema }), async (req, res) => {
    await discountService.remove(currentUser(req), (req.params as IdParam).id);
    res.status(204).end();
  });

  return router;
}
