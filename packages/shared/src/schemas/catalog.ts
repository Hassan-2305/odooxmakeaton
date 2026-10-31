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
import { discountScopeSchema, discountTypeSchema, planIntervalSchema } from "./enums.js";

const skuSchema = z.string().trim().min(1).max(64).optional();

// Products

export const createProductSchema = z.object({
  name: nameSchema,
  description: optionalTextSchema,
  sku: skuSchema,
  basePricePaise: paiseSchema,
  isActive: z.boolean().default(true),
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

// Taxes

const taxFields = z.object({
  name: z.string().trim().min(1).max(100),
  rateBps: bpsSchema,
  inclusive: z.boolean().default(false),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullish(),
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
  interval: planIntervalSchema,
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
  /** percentage: basis points (1000 = 10%); fixed: paise. */
  value: positivePaiseSchema,
  minAmountPaise: paiseSchema.default(0),
  minQty: quantitySchema.default(1),
  validFrom: isoDateSchema.nullish(),
  validTo: isoDateSchema.nullish(),
  usageLimit: z.number().int().min(1).nullish(),
  scope: discountScopeSchema.default("order"),
  productId: idSchema.nullish(),
  isActive: z.boolean().default(true),
});

type DiscountRuleShape = Partial<z.infer<typeof discountRuleFields>>;

function checkDiscountRule(rule: DiscountRuleShape, ctx: z.RefinementCtx) {
  if (rule.type === "percentage" && rule.value !== undefined && rule.value > 10_000) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage cannot exceed 100%" });
  }
  if (rule.scope === "product" && !rule.productId) {
    ctx.addIssue({ code: "custom", path: ["productId"], message: "Pick a product for a product discount" });
  }
  if (rule.scope === "order" && rule.productId) {
    ctx.addIssue({ code: "custom", path: ["productId"], message: "Order discounts cannot target a product" });
  }
  checkDateOrder(ctx, rule.validFrom, rule.validTo, "validTo", { allowEqual: true });
}

export const createDiscountRuleSchema = discountRuleFields.superRefine(checkDiscountRule);
export type CreateDiscountRuleInput = z.infer<typeof createDiscountRuleSchema>;

export const updateDiscountRuleSchema = toPatchSchema(discountRuleFields)
  .superRefine(checkDiscountRule);
export type UpdateDiscountRuleInput = z.infer<typeof updateDiscountRuleSchema>;
