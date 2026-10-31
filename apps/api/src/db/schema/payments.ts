import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { invoices } from "./billing.js";
import { currencyCol, id, paise, timestamps, utc } from "./columns.js";
import { paymentMethod } from "./enums.js";
import { customers, users } from "./identity.js";

export const payments = pgTable(
  "payments",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    method: paymentMethod("method").notNull(),
    currency: currencyCol(),
    amountPaise: paise("amount_paise").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    reference: text("reference"),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("payments_customer_id_idx").on(t.customerId),
    check("payments_amount_chk", sql`${t.amountPaise} > 0`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: id(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    amountPaise: paise("amount_paise").notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("payment_allocations_payment_invoice_unique").on(t.paymentId, t.invoiceId),
    index("payment_allocations_invoice_id_idx").on(t.invoiceId),
    check("payment_allocations_amount_chk", sql`${t.amountPaise} > 0`),
  ],
);
