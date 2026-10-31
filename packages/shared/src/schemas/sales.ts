import { z } from "zod";
import {
  idSchema,
  nameSchema,
  optionalTextSchema,
  quantitySchema,
  toPatchSchema,
} from "./common.js";
import { createListQuerySchema } from "./list-query.js";

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

export const quotationTemplateListQuerySchema = createListQuerySchema({
  sortFields: ["name", "validityDays", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    q: z.string().trim().min(1).max(100).optional(),
    isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  },
});
export type QuotationTemplateListQuery = z.infer<typeof quotationTemplateListQuerySchema>;

export interface QuotationTemplateLine {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  description: string | null;
  quantity: number;
  sortOrder: number;
}

export interface QuotationTemplate {
  id: string;
  name: string;
  validityDays: number;
  recurringPlanId: string | null;
  notes: string | null;
  isActive: boolean;
  lines: QuotationTemplateLine[];
  createdAt: string;
  updatedAt: string;
}
