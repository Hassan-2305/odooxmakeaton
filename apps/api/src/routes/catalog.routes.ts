import {
  attributeParamsSchema,
  attributeValueParamsSchema,
  attributeValueSchema,
  createAttributeSchema,
  createPlanSchema,
  createProductSchema,
  createTaxSchema,
  createVariantWithProductSchema,
  idParamSchema,
  planListQuerySchema,
  productListQuerySchema,
  taxListQuerySchema,
  updateAttributeSchema,
  updateAttributeValueSchema,
  updatePlanSchema,
  updateProductSchema,
  updateTaxSchema,
  updateVariantSchema,
  variantListQuerySchema,
  type AttributeParams,
  type AttributeValueParams,
  type IdParam,
  type PlanListQuery,
  type ProductListQuery,
  type TaxListQuery,
  type VariantListQuery,
} from "@brightloop/shared";
import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { CatalogService } from "../services/catalog.service.js";
import type { PlanService } from "../services/plan.service.js";
import type { TaxService } from "../services/tax.service.js";

// Catalog: reads for admin and staff, writes for admin only.
const readers = requireRole("admin", "staff");
const writers = requireRole("admin");

export function createProductsRouter({ catalogService }: { catalogService: CatalogService }) {
  const router = Router();

  router.get("/", readers, validate({ query: productListQuerySchema }), async (req, res) => {
    res.json(await catalogService.listProducts(req.query as unknown as ProductListQuery));
  });

  router.post("/", writers, validate({ body: createProductSchema }), async (req, res) => {
    res.status(201).json({ product: await catalogService.createProduct(req.body) });
  });

  router.get("/:id", readers, validate({ params: idParamSchema }), async (req, res) => {
    res.json({ product: await catalogService.getProduct((req.params as IdParam).id) });
  });

  router.patch("/:id", writers, validate({ params: idParamSchema, body: updateProductSchema }), async (req, res) => {
    res.json({ product: await catalogService.updateProduct((req.params as IdParam).id, req.body) });
  });

  router.delete("/:id", writers, validate({ params: idParamSchema }), async (req, res) => {
    await catalogService.removeProduct((req.params as IdParam).id);
    res.status(204).end();
  });

  // Attributes offered to the product (global + product-specific) and their values.

  router.get("/:id/attributes", readers, validate({ params: idParamSchema }), async (req, res) => {
    res.json({ data: await catalogService.listAttributes((req.params as IdParam).id) });
  });

  router.post(
    "/:id/attributes",
    writers,
    validate({ params: idParamSchema, body: createAttributeSchema }),
    async (req, res) => {
      res.status(201).json({ attribute: await catalogService.createAttribute((req.params as IdParam).id, req.body) });
    },
  );

  router.patch(
    "/:id/attributes/:attributeId",
    writers,
    validate({ params: attributeParamsSchema, body: updateAttributeSchema }),
    async (req, res) => {
      const { id, attributeId } = req.params as AttributeParams;
      res.json({ attribute: await catalogService.renameAttribute(id, attributeId, req.body.name) });
    },
  );

  router.delete("/:id/attributes/:attributeId", writers, validate({ params: attributeParamsSchema }), async (req, res) => {
    const { id, attributeId } = req.params as AttributeParams;
    await catalogService.removeAttribute(id, attributeId);
    res.status(204).end();
  });

  router.post(
    "/:id/attributes/:attributeId/values",
    writers,
    validate({ params: attributeParamsSchema, body: attributeValueSchema }),
    async (req, res) => {
      const { id, attributeId } = req.params as AttributeParams;
      res.status(201).json({ attribute: await catalogService.addValue(id, attributeId, req.body) });
    },
  );

  router.patch(
    "/:id/attributes/:attributeId/values/:valueId",
    writers,
    validate({ params: attributeValueParamsSchema, body: updateAttributeValueSchema }),
    async (req, res) => {
      const { id, attributeId, valueId } = req.params as AttributeValueParams;
      res.json({ value: await catalogService.updateValue(id, attributeId, valueId, req.body) });
    },
  );

  router.delete(
    "/:id/attributes/:attributeId/values/:valueId",
    writers,
    validate({ params: attributeValueParamsSchema }),
    async (req, res) => {
      const { id, attributeId, valueId } = req.params as AttributeValueParams;
      await catalogService.removeValue(id, attributeId, valueId);
      res.status(204).end();
    },
  );

  return router;
}

export function createVariantsRouter({ catalogService }: { catalogService: CatalogService }) {
  const router = Router();

  router.get("/", readers, validate({ query: variantListQuerySchema }), async (req, res) => {
    res.json(await catalogService.listVariants(req.query as unknown as VariantListQuery));
  });

  router.post("/", writers, validate({ body: createVariantWithProductSchema }), async (req, res) => {
    res.status(201).json({ variant: await catalogService.createVariant(req.body) });
  });

  router.get("/:id", readers, validate({ params: idParamSchema }), async (req, res) => {
    res.json({ variant: await catalogService.getVariant((req.params as IdParam).id) });
  });

  router.patch("/:id", writers, validate({ params: idParamSchema, body: updateVariantSchema }), async (req, res) => {
    res.json({ variant: await catalogService.updateVariant((req.params as IdParam).id, req.body) });
  });

  router.delete("/:id", writers, validate({ params: idParamSchema }), async (req, res) => {
    await catalogService.removeVariant((req.params as IdParam).id);
    res.status(204).end();
  });

  return router;
}

export function createTaxesRouter({ taxService }: { taxService: TaxService }) {
  const router = Router();

  router.get("/", readers, validate({ query: taxListQuerySchema }), async (req, res) => {
    res.json(await taxService.list(req.query as unknown as TaxListQuery));
  });

  router.post("/", writers, validate({ body: createTaxSchema }), async (req, res) => {
    res.status(201).json({ tax: await taxService.create(req.body) });
  });

  router.get("/:id", readers, validate({ params: idParamSchema }), async (req, res) => {
    res.json({ tax: await taxService.get((req.params as IdParam).id) });
  });

  router.patch("/:id", writers, validate({ params: idParamSchema, body: updateTaxSchema }), async (req, res) => {
    res.json({ tax: await taxService.update((req.params as IdParam).id, req.body) });
  });

  router.delete("/:id", writers, validate({ params: idParamSchema }), async (req, res) => {
    await taxService.remove((req.params as IdParam).id);
    res.status(204).end();
  });

  return router;
}

export function createPlansRouter({ planService }: { planService: PlanService }) {
  const router = Router();

  router.get("/", readers, validate({ query: planListQuerySchema }), async (req, res) => {
    res.json(await planService.list(req.query as unknown as PlanListQuery));
  });

  router.post("/", writers, validate({ body: createPlanSchema }), async (req, res) => {
    res.status(201).json({ plan: await planService.create(req.body) });
  });

  router.get("/:id", readers, validate({ params: idParamSchema }), async (req, res) => {
    res.json({ plan: await planService.get((req.params as IdParam).id) });
  });

  router.patch("/:id", writers, validate({ params: idParamSchema, body: updatePlanSchema }), async (req, res) => {
    res.json({ plan: await planService.update((req.params as IdParam).id, req.body) });
  });

  router.delete("/:id", writers, validate({ params: idParamSchema }), async (req, res) => {
    await planService.remove((req.params as IdParam).id);
    res.status(204).end();
  });

  return router;
}
