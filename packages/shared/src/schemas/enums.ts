import { z } from "zod";

// Values must match the pgEnums in apps/api/src/db/schema/enums.ts.

export const CURRENCIES = ["INR"] as const;
export const currencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof currencySchema>;

export const USER_ROLES = ["admin", "staff", "customer"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const PLAN_INTERVALS = ["day", "week", "month", "year"] as const;
export const planIntervalSchema = z.enum(PLAN_INTERVALS);
export type PlanInterval = z.infer<typeof planIntervalSchema>;

/** Odoo-style names accepted on input and stored as the short form. */
const PLAN_INTERVAL_ALIASES: Record<string, PlanInterval> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};
export const planIntervalInputSchema = z.preprocess(
  (value) => (typeof value === "string" ? (PLAN_INTERVAL_ALIASES[value] ?? value) : value),
  planIntervalSchema,
);

export const DISCOUNT_TYPES = ["percent", "fixed"] as const;
export const discountTypeSchema = z.enum(DISCOUNT_TYPES);
export type DiscountType = z.infer<typeof discountTypeSchema>;

export const DISCOUNT_SCOPES = ["subscription", "product"] as const;
export const discountScopeSchema = z.enum(DISCOUNT_SCOPES);
export type DiscountScope = z.infer<typeof discountScopeSchema>;

export const SUBSCRIPTION_STATUSES = [
  "draft",
  "quotation",
  "confirmed",
  "active",
  "paused",
  "closed",
  "cancelled",
] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const BILLING_RUN_MODES = ["scheduled", "manual"] as const;
export const billingRunModeSchema = z.enum(BILLING_RUN_MODES);
export type BillingRunMode = z.infer<typeof billingRunModeSchema>;

export const BILLING_RUN_STATUSES = ["running", "completed", "failed"] as const;
export const billingRunStatusSchema = z.enum(BILLING_RUN_STATUSES);
export type BillingRunStatus = z.infer<typeof billingRunStatusSchema>;

export const BILLING_RUN_ITEM_OUTCOMES = ["invoiced", "skipped", "failed"] as const;
export const billingRunItemOutcomeSchema = z.enum(BILLING_RUN_ITEM_OUTCOMES);
export type BillingRunItemOutcome = z.infer<typeof billingRunItemOutcomeSchema>;

export const INVOICE_STATUSES = ["draft", "confirmed", "paid", "cancelled"] as const;
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const INVOICE_LINE_KINDS = ["product", "discount"] as const;
export const invoiceLineKindSchema = z.enum(INVOICE_LINE_KINDS);
export type InvoiceLineKind = z.infer<typeof invoiceLineKindSchema>;

export const CREDIT_NOTE_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export const creditNoteStatusSchema = z.enum(CREDIT_NOTE_STATUSES);
export type CreditNoteStatus = z.infer<typeof creditNoteStatusSchema>;

export const PAYMENT_METHODS = ["cash", "bank_transfer", "upi", "card", "cheque"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const findingSeveritySchema = z.enum(FINDING_SEVERITIES);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const FINDING_STATUSES = ["open", "confirmed", "dismissed", "resolved"] as const;
export const findingStatusSchema = z.enum(FINDING_STATUSES);
export type FindingStatus = z.infer<typeof findingStatusSchema>;
