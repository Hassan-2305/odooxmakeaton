import { z } from "zod";
import { emailSchema, nameSchema, toPatchSchema } from "./common.js";
import { createListQuerySchema } from "./list-query.js";

/** Optional text that forms may send as "": empty becomes null, so it clears the field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

/** Indian GST number, e.g. 29ABCDE1234F1Z5. */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN");

const customerFields = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: optionalText(20).refine(
    (v) => v == null || /^[+0-9 ()-]{7,20}$/.test(v),
    "Use digits, spaces, +, - or brackets",
  ),
  gstin: z
    .union([z.literal("").transform(() => null), gstinSchema])
    .nullish(),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(12),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a 2-letter country code")
    .default("IN"),
});

export const createCustomerSchema = customerFields;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = toPatchSchema(customerFields);
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const CUSTOMER_SORT_FIELDS = ["name", "email", "city", "createdAt"] as const;

/** GET /api/customers?page&pageSize&sort&q&city&state */
export const customerListQuerySchema = createListQuerySchema({
  sortFields: CUSTOMER_SORT_FIELDS,
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    /** Matches name, email, phone or GSTIN (case-insensitive, partial). */
    q: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    state: z.string().trim().min(1).max(100).optional(),
  },
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  createdAt: string;
  updatedAt: string;
}
