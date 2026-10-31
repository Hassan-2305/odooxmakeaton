import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { products, productVariants, recurringPlans, taxes } from "./catalog.js";
import { currencyCol, id, paise, timestamps, utc } from "./columns.js";
import { subscriptionStatus } from "./enums.js";
import { customers, users } from "./identity.js";
import { quotationTemplates } from "./sales.js";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    number: text("number").notNull().unique("subscriptions_number_unique"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    recurringPlanId: uuid("recurring_plan_id")
      .notNull()
      .references(() => recurringPlans.id, { onDelete: "restrict" }),
    quotationTemplateId: uuid("quotation_template_id").references(() => quotationTemplates.id, {
      onDelete: "set null",
    }),
    status: subscriptionStatus("status").notNull().default("draft"),
    currency: currencyCol(),
    // Calendar dates in the business timezone.
    startDate: date("start_date", { mode: "string" }).notNull(),
    expiryDate: date("expiry_date", { mode: "string" }),
    nextInvoiceDate: date("next_invoice_date", { mode: "string" }),
    anchorDay: smallint("anchor_day").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    quotationExpiresAt: utc("quotation_expires_at"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("subscriptions_status_next_invoice_date_idx").on(t.status, t.nextInvoiceDate),
    index("subscriptions_customer_id_idx").on(t.customerId),
    check("subscriptions_anchor_day_chk", sql`${t.anchorDay} between 1 and 31`),
    check("subscriptions_payment_terms_chk", sql`${t.paymentTermsDays} >= 0`),
    check(
      "subscriptions_expiry_chk",
      sql`${t.expiryDate} is null or ${t.expiryDate} > ${t.startDate}`,
    ),
    check(
      "subscriptions_next_invoice_chk",
      sql`${t.nextInvoiceDate} is null or ${t.nextInvoiceDate} >= ${t.startDate}`,
    ),
  ],
);

export const subscriptionLines = pgTable(
  "subscription_lines",
  {
    id: id(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    // Snapshot of product base price + variant extras at the time the line was added.
    unitPricePaise: paise("unit_price_paise").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("subscription_lines_subscription_id_idx").on(t.subscriptionId),
    check("subscription_lines_quantity_chk", sql`${t.quantity} >= 1`),
    check("subscription_lines_unit_price_chk", sql`${t.unitPricePaise} >= 0`),
  ],
);

/** Tax rates snapshotted onto the line, so later edits to `taxes` don't change billing. */
export const subscriptionLineTaxes = pgTable(
  "subscription_line_taxes",
  {
    id: id(),
    subscriptionLineId: uuid("subscription_line_id")
      .notNull()
      .references(() => subscriptionLines.id, { onDelete: "cascade" }),
    taxId: uuid("tax_id").references(() => taxes.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    rateBps: integer("rate_bps").notNull(),
    inclusive: boolean("inclusive").notNull(),
  },
  (t) => [
    unique("subscription_line_taxes_line_tax_unique").on(t.subscriptionLineId, t.taxId),
    check("subscription_line_taxes_rate_chk", sql`${t.rateBps} between 0 and 10000`),
  ],
);

export const subscriptionEvents = pgTable(
  "subscription_events",
  {
    id: id(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fromStatus: subscriptionStatus("from_status"),
    toStatus: subscriptionStatus("to_status"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload"),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [index("subscription_events_subscription_id_idx").on(t.subscriptionId, t.createdAt)],
);
