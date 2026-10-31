import {
  createQuotationTemplateSchema,
  idParamSchema,
  quotationTemplateListQuerySchema,
  subscriptionFromTemplateSchema,
  subscriptionListQuerySchema,
  subscriptionTransitionSchema,
  updateQuotationTemplateSchema,
  type IdParam,
  type QuotationTemplateListQuery,
  type SubscriptionListQuery,
} from "@brightloop/shared";
import { Router } from "express";
import { currentUser, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { SubscriptionService } from "../services/subscription.service.js";
import type { TemplateService } from "../services/template.service.js";

/** Quotation templates: admin and staff read, admin writes. */
export function createTemplatesRouter({ templateService }: { templateService: TemplateService }) {
  const router = Router();
  const writers = requireRole("admin");

  router.use(requireRole("admin", "staff"));

  router.get("/", validate({ query: quotationTemplateListQuerySchema }), async (req, res) => {
    res.json(await templateService.list(req.query as unknown as QuotationTemplateListQuery));
  });

  router.post("/", writers, validate({ body: createQuotationTemplateSchema }), async (req, res) => {
    res.status(201).json({ template: await templateService.create(req.body) });
  });

  router.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
    res.json({ template: await templateService.get((req.params as IdParam).id) });
  });

  router.patch("/:id", writers, validate({ params: idParamSchema, body: updateQuotationTemplateSchema }), async (req, res) => {
    res.json({ template: await templateService.update((req.params as IdParam).id, req.body) });
  });

  router.delete("/:id", writers, validate({ params: idParamSchema }), async (req, res) => {
    await templateService.remove((req.params as IdParam).id);
    res.status(204).end();
  });

  return router;
}

/** Subscriptions: admin and staff. */
export function createSubscriptionsRouter({ subscriptionService }: { subscriptionService: SubscriptionService }) {
  const router = Router();

  router.use(requireRole("admin", "staff"));

  router.get("/", validate({ query: subscriptionListQuerySchema }), async (req, res) => {
    res.json(await subscriptionService.list(req.query as unknown as SubscriptionListQuery));
  });

  router.post(
    "/from-template/:id",
    validate({ params: idParamSchema, body: subscriptionFromTemplateSchema }),
    async (req, res) => {
      const subscription = await subscriptionService.fromTemplate(currentUser(req), (req.params as IdParam).id, req.body);
      res.status(201).json({ subscription });
    },
  );

  router.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
    res.json({ subscription: await subscriptionService.get((req.params as IdParam).id) });
  });

  router.post(
    "/:id/transition",
    validate({ params: idParamSchema, body: subscriptionTransitionSchema }),
    async (req, res) => {
      const subscription = await subscriptionService.transition(currentUser(req), (req.params as IdParam).id, req.body);
      res.json({ subscription });
    },
  );

  return router;
}
