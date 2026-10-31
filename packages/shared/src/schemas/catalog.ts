import { z } from "zod";
import {
  bpsSchema,
  checkDateOrder,
  idSchema,
  isoDateSchema,
  nameSchema,
  optionalTextSchema,
  paiseSchema,
  positivePaiseSchema,
  quantitySchema,
  toPatchSchema,
} from "./common.js";
import { discountScopeSchema, discountTypeSchema, planIntervalInputSchema } from "./enums.js";
import { createListQuerySchema } from "./list-query.js";

const skuSchema = z.string().trim().min(1).max(64).optional();

// Products

export const createProductSchema = z.object({
  name: nameSchema,
  description: optionalTextSchema,
  sku: skuSchema,
  /** Sales price in paise. Variant price = this + the price extras of its attribute values. */
  basePricePaise: paiseSchema,
  isActive: z.boolean().default(true),
  /** Default taxes, copied onto subscription lines for this product. */
  taxIds: z
    .array(idSchema)
    .max(10)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, "Taxes must not repeat"),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = toPatchSchema(createProductSchema);
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// Attributes and values

export const attributeValueSchema = z.object({
  value: z.string().trim().min(1).max(100),
  priceExtraPaise: paiseSchema.default(0),
});
export type AttributeValueInput = z.infer<typeof attributeValueSchema>;

export const createAttributeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  values: z
    .array(attributeValueSchema)
    .max(100)
    .default([])
    .refine(
      (values) => new Set(values.map((v) => v.value.toLowerCase())).size === values.length,
      "Attribute values must be unique",
    ),
});
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;

export const updateAttributeSchema = z.object({ name: z.string().trim().min(1).max(100) });
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;

export const updateAttributeValueSchema = toPatchSchema(attributeValueSchema);
export type UpdateAttributeValueInput = z.infer<typeof updateAttributeValueSchema>;

// Variants (product id comes from the route)

export const createVariantSchema = z.object({
  name: nameSchema,
  sku: skuSchema,
  attributeValueIds: z
    .array(idSchema)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Attribute values must not repeat"),
  isActive: z.boolean().default(true),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = toPatchSchema(createVariantSchema);
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

/** POST /api/variants: the product id travels in the body. */
export const createVariantWithProductSchema = createVariantSchema.extend({ productId: idSchema });
export type CreateVariantWithProductInput = z.infer<typeof createVariantWithProductSchema>;

// Taxes

const taxFields = z.object({
  name: z.string().trim().min(1).max(100),
  rateBps: bpsSchema,
  inclusive: z.boolean().default(false),
  effectiveFrom: isoDateSchema,
  /** Last day the rate applies (inclusive). */
  effectiveTo: isoDateSchema.nullish(),
  isActive: z.boolean().default(true),
});

export const createTaxSchema = taxFields.superRefine((tax, ctx) =>
  checkDateOrder(ctx, tax.effectiveFrom, tax.effectiveTo, "effectiveTo"),
);
export type CreateTaxInput = z.infer<typeof createTaxSchema>;

export const updateTaxSchema = toPatchSchema(taxFields)
  .superRefine((tax, ctx) => checkDateOrder(ctx, tax.effectiveFrom, tax.effectiveTo, "effectiveTo"));
export type UpdateTaxInput = z.infer<typeof updateTaxSchema>;

// Recurring plans

const planFields = z.object({
  name: nameSchema,
  /** List price per billing period, in paise. */
  pricePaise: paiseSchema.default(0),
  /** day|week|month|year; daily|weekly|monthly|yearly are accepted too. */
  interval: planIntervalInputSchema,
  intervalCount: z.number().int().min(1).max(36).default(1),
  minQuantity: quantitySchema.default(1),
  availableFrom: isoDateSchema.nullish(),
  availableTo: isoDateSchema.nullish(),
  autoCloseOnEnd: z.boolean().default(false),
  closableEarly: z.boolean().default(true),
  pausable: z.boolean().default(false),
  renewable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const createPlanSchema = planFields.superRefine((plan, ctx) =>
  checkDateOrder(ctx, plan.availableFrom, plan.availableTo, "availableTo"),
);
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = toPatchSchema(planFields)
  .superRefine((plan, ctx) =>
    checkDateOrder(ctx, plan.availableFrom, plan.availableTo, "availableTo"),
  );
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

// Discount rules

const discountRuleFields = z.object({
  name: nameSchema,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,32}$/, "Use 3-32 letters, digits, - or _")
    .nullish(),
  type: discountTypeSchema,
  /** percent: basis points (1000 = 10%); fixed: paise. */
  value: positivePaiseSchema,
  minAmountPaise: paiseSchema.default(0),
  minQty: quantitySchema.default(1),
  validFrom: isoDateSchema.nullish(),
  validTo: isoDateSchema.nullish(),
  usageLimit: z.number().int().min(1).nullish(),
  /** subscription: the whole invoice; product: only lines for productId. */
  scope: discountScopeSchema.default("subscription"),
  productId: idSchema.nullish(),
  isActive: z.boolean().default(true),
});

type DiscountRuleShape = Partial<z.infer<typeof discountRuleFields>>;

function checkDiscountRule(rule: DiscountRuleShape, ctx: z.RefinementCtx) {
  if (rule.type === "percent" && rule.value !== undefined && rule.value > 10_000) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage cannot exceed 100%" });
  }
  if (rule.scope === "product" && !rule.productId) {
    ctx.addIssue({ code: "custom", path: ["productId"], message: "Pick a product for a product discount" });
  }
  if (rule.scope === "subscription" && rule.productId) {
    ctx.addIssue({ code: "custom", path: ["productId"], message: "Subscription discounts cannot target a product" });
  }
  checkDateOrder(ctx, rule.validFrom, rule.validTo, "validTo", { allowEqual: true });
}

export const createDiscountRuleSchema = discountRuleFields.superRefine(checkDiscountRule);
export type CreateDiscountRuleInput = z.infer<typeof createDiscountRuleSchema>;

export const updateDiscountRuleSchema = toPatchSchema(discountRuleFields)
  .superRefine(checkDiscountRule);
export type UpdateDiscountRuleInput = z.infer<typeof updateDiscountRuleSchema>;

// List queries

export const discountRuleListQuerySchema = createListQuerySchema({
  sortFields: ["name", "validFrom", "validTo", "createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
  filters: {
    q: z.string().trim().min(1).max(100).optional(),
    isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    scope: discountScopeSchema.optional(),
    productId: idSchema.optional(),
    /** Only rules valid on this date that still have uses left. */
    usableOn: isoDateSchema.optional(),
  },
});
export type DiscountRuleListQuery = z.infer<typeof discountRuleListQuerySchema>;

const booleanQuery = z.enum(["true", "false"]).transform((v) => v === "true");
const searchQuery = z.string().trim().min(1).max(100);

export const productListQuerySchema = createListQuerySchema({
  sortFields: ["name", "basePricePaise", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: { q: searchQuery.optional(), isActive: booleanQuery.optional() },
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const variantListQuerySchema = createListQuerySchema({
  sortFields: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: { productId: idSchema.optional(), q: searchQuery.optional(), isActive: booleanQuery.optional() },
});
export type VariantListQuery = z.infer<typeof variantListQuerySchema>;

export const taxListQuerySchema = createListQuerySchema({
  sortFields: ["name", "rateBps", "effectiveFrom", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    isActive: booleanQuery.optional(),
    /** Only taxes in effect on this date. */
    effectiveOn: isoDateSchema.optional(),
  },
});
export type TaxListQuery = z.infer<typeof taxListQuerySchema>;

export const planListQuerySchema = createListQuerySchema({
  sortFields: ["name", "pricePaise", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    q: searchQuery.optional(),
    isActive: booleanQuery.optional(),
    /** Only plans that can be sold on this date. */
    sellableOn: isoDateSchema.optional(),
  },
});
export type PlanListQuery = z.infer<typeof planListQuerySchema>;

// Responses

export interface AttributeValue {
  id: string;
  attributeId: string;
  value: string;
  priceExtraPaise: number;
}

export interface Attribute {
  id: string;
  /** null for global attributes offered to every product. */
  productId: string | null;
  name: string;
  values: AttributeValue[];
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  currency: "INR";
  basePricePaise: number;
  isActive: boolean;
  taxIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Variant {
  id: string;
  productId: string;
  productName: string;
  name: string;
  sku: string | null;
  isActive: boolean;
  /** Computed server-side: product base price + sum of attribute value price extras. */
  pricePaise: number;
  attributeValues: (AttributeValue & { attributeName: string })[];
  createdAt: string;
  updatedAt: string;
}

export interface Tax {
  id: string;
  name: string;
  rateBps: number;
  inclusive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  name: string;
  pricePaise: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  minQuantity: number;
  availableFrom: string | null;
  availableTo: string | null;
  autoCloseOnEnd: boolean;
  closableEarly: boolean;
  pausable: boolean;
  renewable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountRule {
  id: string;
  name: string;
  code: string | null;
  type: "percent" | "fixed";
  /** percent: basis points; fixed: paise. */
  value: number;
  minAmountPaise: number;
  minQty: number;
  validFrom: string | null;
  validTo: string | null;
  usageLimit: number | null;
  usedCount: number;
  scope: "subscription" | "product";
  productId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Route params

export const attributeParamsSchema = z.object({ id: idSchema, attributeId: idSchema });
export type AttributeParams = z.infer<typeof attributeParamsSchema>;

export const attributeValueParamsSchema = attributeParamsSchema.extend({ valueId: idSchema });
export type AttributeValueParams = z.infer<typeof attributeValueParamsSchema>;
