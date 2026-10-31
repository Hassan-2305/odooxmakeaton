import { z } from "zod";
import {
  checkDateOrder,
  idSchema,
  isoDateSchema,
  optionalTextSchema,
  quantitySchema,
} from "./common.js";
import { SUBSCRIPTION_STATUSES, subscriptionStatusSchema, type SubscriptionStatus } from "./enums.js";
import { createListQuerySchema } from "./list-query.js";

/** No price fields: unit prices and tax rates are snapshotted server-side. */
export const subscriptionLineSchema = z.object({
  productId: idSchema,
  variantId: idSchema.nullish(),
  quantity: quantitySchema,
  description: z.string().trim().max(500).optional(),
  taxIds: z
    .array(idSchema)
    .max(10)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, "Taxes must not repeat"),
});
export type SubscriptionLineInput = z.infer<typeof subscriptionLineSchema>;

export const createSubscriptionSchema = z
  .object({
    customerId: idSchema,
    recurringPlanId: idSchema,
    quotationTemplateId: idSchema.nullish(),
    startDate: isoDateSchema,
    expiryDate: isoDateSchema.nullish(),
    /** Defaults to the day of month of `startDate`. */
    anchorDay: z.number().int().min(1).max(31).optional(),
    paymentTermsDays: z.number().int().min(0).max(365).optional(),
    notes: optionalTextSchema,
    lines: z.array(subscriptionLineSchema).min(1).max(100),
  })
  .superRefine((sub, ctx) => checkDateOrder(ctx, sub.startDate, sub.expiryDate, "expiryDate"));
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

/** POST /api/subscriptions/from-template/:id */
export const subscriptionFromTemplateSchema = z
  .object({
    customerId: idSchema,
    startDate: isoDateSchema,
    /** Overrides the template's plan; required when the template has none. */
    recurringPlanId: idSchema.optional(),
    expiryDate: isoDateSchema.nullish(),
    paymentTermsDays: z.number().int().min(0).max(365).optional(),
    notes: optionalTextSchema,
  })
  .superRefine((sub, ctx) => checkDateOrder(ctx, sub.startDate, sub.expiryDate, "expiryDate"));
export type SubscriptionFromTemplateInput = z.infer<typeof subscriptionFromTemplateSchema>;

/**
 * Transition targets: a status, or "renew" to extend the expiry date of an active
 * subscription whose plan is renewable. The server's transition map decides what is allowed.
 */
export const SUBSCRIPTION_TRANSITION_TARGETS = [...SUBSCRIPTION_STATUSES, "renew"] as const;
export const subscriptionTransitionTargetSchema = z.enum(SUBSCRIPTION_TRANSITION_TARGETS);
export type SubscriptionTransitionTarget = z.infer<typeof subscriptionTransitionTargetSchema>;

export const subscriptionTransitionSchema = z.object({
  to: subscriptionTransitionTargetSchema,
  note: z.string().trim().max(1000).optional(),
  /** renew only: the new expiry date. Defaults to one plan period after the current expiry. */
  expiryDate: isoDateSchema.optional(),
});
export type SubscriptionTransitionInput = z.infer<typeof subscriptionTransitionSchema>;

export const subscriptionListQuerySchema = createListQuerySchema({
  sortFields: ["number", "startDate", "expiryDate", "nextInvoiceDate", "createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
  filters: {
    status: subscriptionStatusSchema.optional(),
    customerId: idSchema.optional(),
    planId: idSchema.optional(),
    /** Subscriptions whose expiry date is between today and today + N days. */
    expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  },
});
export type SubscriptionListQuery = z.infer<typeof subscriptionListQuerySchema>;

export interface SubscriptionLineTax {
  taxId: string | null;
  name: string;
  rateBps: number;
  inclusive: boolean;
}

export interface SubscriptionLine {
  id: string;
  productId: string;
  variantId: string | null;
  description: string;
  quantity: number;
  /** Snapshot taken when the line was created. */
  unitPricePaise: number;
  sortOrder: number;
  taxes: SubscriptionLineTax[];
}

export interface SubscriptionEvent {
  id: string;
  type: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus | null;
  actorUserId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface Subscription {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  recurringPlanId: string;
  planName: string;
  quotationTemplateId: string | null;
  status: SubscriptionStatus;
  currency: "INR";
  startDate: string;
  expiryDate: string | null;
  nextInvoiceDate: string | null;
  anchorDay: number;
  paymentTermsDays: number;
  quotationExpiresAt: string | null;
  notes: string | null;
  /** Sum of quantity × snapshot unit price over the lines, before tax and discounts. */
  recurringAmountPaise: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionDetail extends Subscription {
  lines: SubscriptionLine[];
  events: SubscriptionEvent[];
}
