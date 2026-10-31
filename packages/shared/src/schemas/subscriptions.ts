import { z } from "zod";
import {
  checkDateOrder,
  idSchema,
  isoDateSchema,
  optionalTextSchema,
  quantitySchema,
} from "./common.js";

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

/**
 * Requested transitions. The transition service maps each action to a status change
 * and rejects any that the subscription's current status doesn't allow.
 */
export const SUBSCRIPTION_ACTIONS = [
  "send_quotation",
  "confirm",
  "pause",
  "resume",
  "renew",
  "close",
  "cancel",
] as const;
export const subscriptionActionSchema = z.enum(SUBSCRIPTION_ACTIONS);
export type SubscriptionAction = z.infer<typeof subscriptionActionSchema>;

export const subscriptionTransitionSchema = z
  .object({
    action: subscriptionActionSchema,
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.action === "cancel" && !t.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Give a reason for cancelling" });
    }
  });
export type SubscriptionTransitionInput = z.infer<typeof subscriptionTransitionSchema>;
