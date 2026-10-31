import { z } from "zod";
import {
  idSchema,
  nameSchema,
  optionalTextSchema,
  quantitySchema,
  toPatchSchema,
} from "./common.js";

export const templateLineSchema = z.object({
  productId: idSchema,
  variantId: idSchema.nullish(),
  description: z.string().trim().max(500).optional(),
  quantity: quantitySchema.default(1),
  sortOrder: z.number().int().min(0).optional(),
});
export type TemplateLineInput = z.infer<typeof templateLineSchema>;

export const createQuotationTemplateSchema = z.object({
  name: nameSchema,
  validityDays: z.number().int().min(1).max(365).default(30),
  recurringPlanId: idSchema.nullish(),
  notes: optionalTextSchema,
  isActive: z.boolean().default(true),
  lines: z.array(templateLineSchema).min(1).max(100),
});
export type CreateQuotationTemplateInput = z.infer<typeof createQuotationTemplateSchema>;

export const updateQuotationTemplateSchema = toPatchSchema(createQuotationTemplateSchema);
export type UpdateQuotationTemplateInput = z.infer<typeof updateQuotationTemplateSchema>;
