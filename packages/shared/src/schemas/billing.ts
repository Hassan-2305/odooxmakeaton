import { z } from "zod";
import { emailSchema, idSchema, isoDateSchema, positivePaiseSchema } from "./common.js";

/** Manual billing run. Scheduled runs are started by the cron job, not the API. */
export const billingRunRequestSchema = z.object({
  /** Billing day in the business timezone; defaults to today there. */
  businessDate: isoDateSchema.optional(),
  /** Limit the run to these subscriptions; all due subscriptions when omitted. */
  subscriptionIds: z
    .array(idSchema)
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Subscriptions must not repeat")
    .optional(),
  /** Report what would be invoiced without writing anything. */
  dryRun: z.boolean().default(false),
});
export type BillingRunRequest = z.infer<typeof billingRunRequestSchema>;

const reasonSchema = z.string().trim().min(3).max(1000);

/** Confirmed invoices are immutable; corrections go through a credit note. */
export const invoiceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("send"), to: emailSchema.optional() }),
  z.object({ action: z.literal("cancel"), reason: reasonSchema }),
]);
export type InvoiceActionInput = z.infer<typeof invoiceActionSchema>;

/** Credit note against a confirmed invoice. The server splits the amount into net and tax. */
export const createCreditNoteSchema = z.object({
  reason: reasonSchema,
  /** Tax-inclusive amount to credit. Must not exceed what is left on the invoice. */
  amountPaise: positivePaiseSchema,
});
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;
