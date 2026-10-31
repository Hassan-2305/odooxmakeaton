import { pgEnum } from "drizzle-orm/pg-core";

export const currency = pgEnum("currency", ["INR"]);

export const userRole = pgEnum("user_role", ["admin", "staff", "customer"]);

export const planInterval = pgEnum("plan_interval", ["day", "week", "month", "year"]);

export const discountType = pgEnum("discount_type", ["percent", "fixed"]);
export const discountScope = pgEnum("discount_scope", ["subscription", "product"]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "draft",
  "quotation",
  "confirmed",
  "active",
  "paused",
  "closed",
  "cancelled",
]);

export const billingRunMode = pgEnum("billing_run_mode", ["scheduled", "manual"]);
export const billingRunStatus = pgEnum("billing_run_status", ["running", "completed", "failed"]);
export const billingRunItemOutcome = pgEnum("billing_run_item_outcome", [
  "invoiced",
  "skipped",
  "failed",
]);

export const invoiceStatus = pgEnum("invoice_status", ["draft", "confirmed", "paid", "cancelled"]);
export const invoiceLineKind = pgEnum("invoice_line_kind", ["product", "discount"]);

export const creditNoteStatus = pgEnum("credit_note_status", ["draft", "confirmed", "cancelled"]);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "upi",
  "card",
  "cheque",
]);

export const findingSeverity = pgEnum("finding_severity", ["low", "medium", "high", "critical"]);
export const findingStatus = pgEnum("finding_status", ["open", "confirmed", "dismissed", "resolved"]);
