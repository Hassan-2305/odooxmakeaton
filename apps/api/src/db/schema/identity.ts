import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCol, id, timestamps, utc } from "./columns.js";
import { userRole } from "./enums.js";

export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    gstin: text("gstin"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("IN"),
    ...timestamps(),
  },
  (t) => [index("customers_email_idx").on(t.email)],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull(),
    // Set only for portal users; all customer-facing queries scope by this.
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: utc("last_login_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    index("users_customer_id_idx").on(t.customerId),
    check("users_customer_role_chk", sql`(${t.role} = 'customer') = (${t.customerId} is not null)`),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique("password_resets_token_hash_unique"),
    expiresAt: utc("expires_at").notNull(),
    usedAt: utc("used_at"),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("password_resets_user_id_idx").on(t.userId),
    check("password_resets_expiry_chk", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

/** Single-row table (id is always 1). Sequence counters are bumped under a row lock. */
export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    businessName: text("business_name").notNull().default("Brightloop One"),
    businessTimezone: text("business_timezone").notNull().default("Asia/Kolkata"),
    currency: currencyCol(),
    invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
    nextInvoiceSeq: bigint("next_invoice_seq", { mode: "number" }).notNull().default(1),
    subscriptionPrefix: text("subscription_prefix").notNull().default("SUB-"),
    nextSubscriptionSeq: bigint("next_subscription_seq", { mode: "number" }).notNull().default(1),
    creditNotePrefix: text("credit_note_prefix").notNull().default("CN-"),
    nextCreditNoteSeq: bigint("next_credit_note_seq", { mode: "number" }).notNull().default(1),
    defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(15),
    updatedAt: utc("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("settings_singleton_chk", sql`${t.id} = 1`),
    check(
      "settings_seq_chk",
      sql`${t.nextInvoiceSeq} >= 1 and ${t.nextSubscriptionSeq} >= 1 and ${t.nextCreditNoteSeq} >= 1`,
    ),
    check("settings_payment_terms_chk", sql`${t.defaultPaymentTermsDays} >= 0`),
  ],
);
