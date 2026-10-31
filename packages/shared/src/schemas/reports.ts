import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

const dateRange = {
  /** Calendar days in the business timezone, both inclusive. Default: first of this month. */
  from: isoDateSchema.optional(),
  /** Default: today. */
  to: isoDateSchema.optional(),
};

function checkRange(q: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (q.from && q.to && q.to < q.from) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "Must be on or after the from date" });
  }
}

/** GET /api/reports/summary?from&to&customer_id */
export const reportSummaryQuerySchema = z
  .object({ ...dateRange, customer_id: idSchema.optional() })
  .superRefine(checkRange);
export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;

/** GET /api/reports/aging?customer_id */
export const reportAgingQuerySchema = z.object({ customer_id: idSchema.optional() });
export type ReportAgingQuery = z.infer<typeof reportAgingQuerySchema>;

/** GET /api/reports/collections?from&to&customer_id (at most 366 days) */
export const reportCollectionsQuerySchema = z
  .object({ ...dateRange, customer_id: idSchema.optional() })
  .superRefine(checkRange);
export type ReportCollectionsQuery = z.infer<typeof reportCollectionsQuerySchema>;

/** GET /api/reports/renewals?days=30&customer_id */
export const reportRenewalsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  customer_id: idSchema.optional(),
});
export type ReportRenewalsQuery = z.infer<typeof reportRenewalsQuerySchema>;

export interface ReportSummary {
  from: string;
  to: string;
  activeSubscriptions: number;
  /** Total of confirmed and paid invoices issued in the range. */
  invoicedPaise: number;
  /** Payment allocations whose payment's paid_on falls in the range. */
  collectedPaise: number;
  /** Unpaid balance of every confirmed invoice, as of today. */
  outstandingPaise: number;
  overdue: { count: number; amountPaise: number };
  /** Active subscriptions normalised to a month, pre-tax. */
  mrrPaise: number;
  openFindings: number;
  tookMs: number;
}

export const AGING_BUCKETS = ["current", "0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface ReportAging {
  asOf: string;
  buckets: { bucket: AgingBucket; count: number; amountPaise: number }[];
  totalPaise: number;
  tookMs: number;
}

export interface ReportCollections {
  from: string;
  to: string;
  series: { date: string; collectedPaise: number; receivedPaise: number; payments: number }[];
  totalCollectedPaise: number;
  totalReceivedPaise: number;
  tookMs: number;
}

export interface ReportRenewal {
  subscriptionId: string;
  number: string;
  customer: { id: string; name: string };
  planName: string;
  renewable: boolean;
  expiryDate: string;
  daysLeft: number;
  mrrPaise: number;
}

export interface ReportRenewals {
  asOf: string;
  days: number;
  data: ReportRenewal[];
  tookMs: number;
}
