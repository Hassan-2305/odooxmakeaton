import { z } from "zod";
import { emailSchema, idSchema, isoDateSchema, positivePaiseSchema } from "./common.js";
import {
  billingRunItemOutcomeSchema,
  billingRunStatusSchema,
  type BillingRunItemOutcome,
  type BillingRunMode,
  type BillingRunStatus,
} from "./enums.js";
import { createListQuerySchema } from "./list-query.js";

/** POST /api/billing/runs?mode=dry|live. dry previews the run and writes nothing. */
export const billingRunQuerySchema = z.object({ mode: z.enum(["dry", "live"]) });
export type BillingRunQuery = z.infer<typeof billingRunQuerySchema>;

/** Manual billing run body (optional). Scheduled runs are started by the cron job. */
export const billingRunRequestSchema = z.object({
  /** Billing day in the business timezone; defaults to today there. Cannot be in the future. */
  businessDate: isoDateSchema.optional(),
  /** Limit the run to these subscriptions; all due subscriptions when omitted. */
  subscriptionIds: z
    .array(idSchema)
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Subscriptions must not repeat")
    .optional(),
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

export const billingRunListQuerySchema = createListQuerySchema({
  sortFields: ["startedAt", "businessDate"],
  defaultSort: [{ field: "startedAt", direction: "desc" }],
  filters: { status: billingRunStatusSchema.optional() },
});
export type BillingRunListQuery = z.infer<typeof billingRunListQuerySchema>;

export const billingRunItemListQuerySchema = z.object({ outcome: billingRunItemOutcomeSchema.optional() });

export interface BillingRunItem {
  id: string;
  subscriptionId: string;
  subscriptionNumber: string | null;
  outcome: BillingRunItemOutcome;
  periodStart: string | null;
  reason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  totalPaise: number | null;
  createdAt: string;
}

export interface BillingRun {
  id: string;
  mode: BillingRunMode;
  /** True for a dry run: nothing was saved. */
  dryRun: boolean;
  status: BillingRunStatus;
  businessDate: string;
  triggeredBy: string | null;
  consideredCount: number;
  invoicedCount: number;
  alreadyBilledCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface BillingRunDetail extends BillingRun {
  items: BillingRunItem[];
}
