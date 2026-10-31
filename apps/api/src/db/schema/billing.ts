import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { discountRules, products, productVariants, taxes } from "./catalog.js";
import { currencyCol, id, paise, timestamps, utc } from "./columns.js";
import {
  billingRunItemOutcome,
  billingRunMode,
  billingRunStatus,
  creditNoteStatus,
  invoiceLineKind,
  invoiceStatus,
} from "./enums.js";
import { customers, users } from "./identity.js";
import { subscriptionLines, subscriptions } from "./subscriptions.js";

export const billingRuns = pgTable(
  "billing_runs",
  {
    id: id(),
    mode: billingRunMode("mode").notNull(),
    status: billingRunStatus("status").notNull().default("running"),
    // The billing day, evaluated in the business timezone.
    businessDate: date("business_date", { mode: "string" }).notNull(),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    consideredCount: integer("considered_count").notNull().default(0),
    invoicedCount: integer("invoiced_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    startedAt: utc("started_at").notNull().defaultNow(),
    finishedAt: utc("finished_at"),
  },
  (t) => [
    index("billing_runs_business_date_idx").on(t.businessDate),
    check(
      "billing_runs_counts_chk",
      sql`${t.consideredCount} >= 0 and ${t.invoicedCount} >= 0 and ${t.skippedCount} >= 0 and ${t.failedCount} >= 0`,
    ),
    check(
      "billing_runs_finished_chk",
      sql`${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt}`,
    ),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    // Assigned from settings.next_invoice_seq when the invoice is confirmed.
    number: text("number").unique("invoices_number_unique"),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "restrict",
    }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    billingRunId: uuid("billing_run_id").references(() => billingRuns.id, {
      onDelete: "set null",
    }),
    status: invoiceStatus("status").notNull().default("draft"),
    currency: currencyCol(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    issueDate: date("issue_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    // Name, email, GSTIN and address as they were when the invoice was issued.
    customerSnapshot: jsonb("customer_snapshot").notNull(),
    subtotalPaise: paise("subtotal_paise").notNull().default(0),
    discountTotalPaise: paise("discount_total_paise").notNull().default(0),
    taxTotalPaise: paise("tax_total_paise").notNull().default(0),
    totalPaise: paise("total_paise").notNull().default(0),
    amountPaidPaise: paise("amount_paid_paise").notNull().default(0),
    confirmedAt: utc("confirmed_at"),
    cancelledAt: utc("cancelled_at"),
    ...timestamps(),
  },
  (t) => [
    // Also serves lookups by subscription_id (leading column).
    unique("invoices_subscription_period_unique").on(t.subscriptionId, t.periodStart),
    index("invoices_status_due_date_idx").on(t.status, t.dueDate),
    index("invoices_customer_id_idx").on(t.customerId),
    check("invoices_period_chk", sql`${t.periodEnd} > ${t.periodStart}`),
    check(
      "invoices_due_date_chk",
      sql`${t.dueDate} is null or ${t.issueDate} is null or ${t.dueDate} >= ${t.issueDate}`,
    ),
    check(
      "invoices_amounts_chk",
      sql`${t.subtotalPaise} >= 0 and ${t.discountTotalPaise} >= 0 and ${t.taxTotalPaise} >= 0 and ${t.totalPaise} >= 0`,
    ),
    check(
      "invoices_total_chk",
      sql`${t.totalPaise} = ${t.subtotalPaise} - ${t.discountTotalPaise} + ${t.taxTotalPaise}`,
    ),
    check(
      "invoices_amount_paid_chk",
      sql`${t.amountPaidPaise} >= 0 and ${t.amountPaidPaise} <= ${t.totalPaise}`,
    ),
    check(
      "invoices_number_chk",
      sql`${t.status} = 'draft' or ${t.number} is not null`,
    ),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: invoiceLineKind("kind").notNull(),
    subscriptionLineId: uuid("subscription_line_id").references(() => subscriptionLines.id, {
      onDelete: "set null",
    }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPricePaise: paise("unit_price_paise").notNull(),
    // Net of tax. Discount lines store a positive amount that is subtracted.
    amountPaise: paise("amount_paise").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("invoice_lines_invoice_id_idx").on(t.invoiceId),
    check("invoice_lines_quantity_chk", sql`${t.quantity} >= 1`),
    check(
      "invoice_lines_amounts_chk",
      sql`${t.unitPricePaise} >= 0 and ${t.amountPaise} >= 0`,
    ),
    check(
      "invoice_lines_product_chk",
      sql`${t.kind} <> 'product' or ${t.productId} is not null`,
    ),
  ],
);

export const invoiceLineTaxes = pgTable(
  "invoice_line_taxes",
  {
    id: id(),
    invoiceLineId: uuid("invoice_line_id")
      .notNull()
      .references(() => invoiceLines.id, { onDelete: "cascade" }),
    taxId: uuid("tax_id").references(() => taxes.id, { onDelete: "set null" }),
    // Snapshot of the tax as applied.
    name: text("name").notNull(),
    rateBps: integer("rate_bps").notNull(),
    inclusive: boolean("inclusive").notNull(),
    taxableAmountPaise: paise("taxable_amount_paise").notNull(),
    taxAmountPaise: paise("tax_amount_paise").notNull(),
  },
  (t) => [
    index("invoice_line_taxes_invoice_line_id_idx").on(t.invoiceLineId),
    check("invoice_line_taxes_rate_chk", sql`${t.rateBps} between 0 and 10000`),
    check(
      "invoice_line_taxes_amounts_chk",
      sql`${t.taxableAmountPaise} >= 0 and ${t.taxAmountPaise} >= 0`,
    ),
  ],
);

export const discountApplications = pgTable(
  "discount_applications",
  {
    id: id(),
    discountRuleId: uuid("discount_rule_id")
      .notNull()
      .references(() => discountRules.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    invoiceLineId: uuid("invoice_line_id").references(() => invoiceLines.id, {
      onDelete: "set null",
    }),
    amountPaise: paise("amount_paise").notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("discount_applications_rule_invoice_unique").on(t.discountRuleId, t.invoiceId),
    index("discount_applications_invoice_id_idx").on(t.invoiceId),
    check("discount_applications_amount_chk", sql`${t.amountPaise} > 0`),
  ],
);

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: id(),
    number: text("number").unique("credit_notes_number_unique"),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: creditNoteStatus("status").notNull().default("draft"),
    currency: currencyCol(),
    reason: text("reason").notNull(),
    subtotalPaise: paise("subtotal_paise").notNull(),
    taxTotalPaise: paise("tax_total_paise").notNull().default(0),
    totalPaise: paise("total_paise").notNull(),
    issueDate: date("issue_date", { mode: "string" }),
    confirmedAt: utc("confirmed_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("credit_notes_invoice_id_idx").on(t.invoiceId),
    index("credit_notes_customer_id_idx").on(t.customerId),
    check(
      "credit_notes_amounts_chk",
      sql`${t.subtotalPaise} >= 0 and ${t.taxTotalPaise} >= 0 and ${t.totalPaise} > 0`,
    ),
    check(
      "credit_notes_total_chk",
      sql`${t.totalPaise} = ${t.subtotalPaise} + ${t.taxTotalPaise}`,
    ),
    check(
      "credit_notes_number_chk",
      sql`${t.status} = 'draft' or ${t.number} is not null`,
    ),
  ],
);

export const billingRunItems = pgTable(
  "billing_run_items",
  {
    id: id(),
    billingRunId: uuid("billing_run_id")
      .notNull()
      .references(() => billingRuns.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    outcome: billingRunItemOutcome("outcome").notNull(),
    reason: text("reason"),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    retryOf: uuid("retry_of").references((): AnyPgColumn => billingRunItems.id, {
      onDelete: "set null",
    }),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("billing_run_items_billing_run_id_idx").on(t.billingRunId),
    index("billing_run_items_subscription_id_idx").on(t.subscriptionId),
    check(
      "billing_run_items_invoice_chk",
      sql`${t.outcome} <> 'invoiced' or ${t.invoiceId} is not null`,
    ),
    check("billing_run_items_retry_chk", sql`${t.retryOf} is null or ${t.retryOf} <> ${t.id}`),
  ],
);
