import { z } from "zod";
import { emailSchema, idSchema, isoDateSchema, positivePaiseSchema } from "./common.js";
import {
  billingRunItemOutcomeSchema,
  billingRunStatusSchema,
  invoiceStatusSchema,
  type BillingRunItemOutcome,
  type BillingRunMode,
  type BillingRunStatus,
  type CreditNoteStatus,
  type InvoiceLineKind,
  type InvoiceStatus,
  type PaymentMethod,
} from "./enums.js";
import type { IntegrityScanResult } from "./findings.js";
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
  /** Integrity scan run after a live billing run; null when it was skipped or failed. */
  integrityScan?: IntegrityScanResult | null;
}

// Invoices

export const invoiceListQuerySchema = createListQuerySchema({
  sortFields: ["number", "issueDate", "dueDate", "totalPaise", "createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
  filters: {
    status: invoiceStatusSchema.optional(),
    customerId: idSchema.optional(),
    subscriptionId: idSchema.optional(),
    /** Issue date range, inclusive. */
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    /** Confirmed, not fully paid, and past the due date (business timezone). */
    overdue: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  },
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

/** Drafts only: confirmed invoices are immutable. */
export const updateInvoiceSchema = z.object({ dueDate: isoDateSchema });
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const cancelInvoiceSchema = z.object({ reason: z.string().trim().max(1000).optional() });
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

export const sendInvoiceSchema = z.object({
  /** Defaults to the email on the invoice's customer snapshot. */
  to: emailSchema.optional(),
});
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;

export interface InvoiceLineTax {
  taxId: string | null;
  name: string;
  rateBps: number;
  inclusive: boolean;
  taxableAmountPaise: number;
  taxAmountPaise: number;
}

export interface InvoiceLine {
  id: string;
  kind: InvoiceLineKind;
  productId: string | null;
  variantId: string | null;
  description: string;
  quantity: number;
  unitPricePaise: number;
  /** Net of tax; discount lines hold a positive amount that is subtracted. */
  amountPaise: number;
  taxes: InvoiceLineTax[];
}

export interface Invoice {
  id: string;
  number: string | null;
  subscriptionId: string | null;
  customerId: string;
  customerName: string;
  billingRunId: string | null;
  status: InvoiceStatus;
  currency: "INR";
  periodStart: string;
  /** Exclusive: the first day of the next period. */
  periodEnd: string;
  issueDate: string | null;
  dueDate: string | null;
  subtotalPaise: number;
  discountTotalPaise: number;
  taxTotalPaise: number;
  totalPaise: number;
  amountPaidPaise: number;
  /** Sum of confirmed credit notes. */
  creditedPaise: number;
  /** total − paid − credited. */
  balancePaise: number;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface InvoiceAllocation {
  id: string;
  paymentId: string;
  amountPaise: number;
  method: PaymentMethod;
  paidOn: string;
  reference: string | null;
  createdAt: string;
}

export interface CreditNote {
  id: string;
  number: string | null;
  invoiceId: string;
  customerId: string;
  status: CreditNoteStatus;
  reason: string;
  subtotalPaise: number;
  taxTotalPaise: number;
  totalPaise: number;
  issueDate: string | null;
  createdAt: string;
}

export interface InvoiceDetail extends Invoice {
  customerSnapshot: Record<string, unknown>;
  lines: InvoiceLine[];
  allocations: InvoiceAllocation[];
  creditNotes: CreditNote[];
}
