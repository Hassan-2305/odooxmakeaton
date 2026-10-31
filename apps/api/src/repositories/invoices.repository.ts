import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  customers,
  discountApplications,
  invoiceLines,
  invoiceLineTaxes,
  invoices,
} from "../db/schema/index.js";
import type { DbOrTx } from "./audit.repository.js";

export type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceValues = typeof invoices.$inferInsert;
type LineValues = Omit<typeof invoiceLines.$inferInsert, "invoiceId">;
type LineTaxValues = Omit<typeof invoiceLineTaxes.$inferInsert, "invoiceLineId">;

/** Customer details frozen onto the invoice when it is issued. */
export interface CustomerSnapshot {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
}

export function createInvoicesRepository(db: Db) {
  return {
    async customerSnapshot(tx: DbOrTx, customerId: string): Promise<CustomerSnapshot | undefined> {
      const [row] = await tx
        .select({
          id: customers.id,
          name: customers.name,
          email: customers.email,
          phone: customers.phone,
          gstin: customers.gstin,
          addressLine1: customers.addressLine1,
          addressLine2: customers.addressLine2,
          city: customers.city,
          state: customers.state,
          postalCode: customers.postalCode,
          country: customers.country,
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      return row;
    },

    /** Throws a unique violation (invoices_subscription_period_unique) if the period is billed. */
    async insertInvoice(tx: DbOrTx, values: InvoiceValues): Promise<InvoiceRow> {
      const [row] = await tx.insert(invoices).values(values).returning();
      return row!;
    },

    async insertLine(tx: DbOrTx, invoiceId: string, line: LineValues, taxes: LineTaxValues[] = []): Promise<string> {
      const [row] = await tx.insert(invoiceLines).values({ ...line, invoiceId }).returning({ id: invoiceLines.id });
      if (taxes.length) {
        await tx.insert(invoiceLineTaxes).values(taxes.map((t) => ({ ...t, invoiceLineId: row!.id })));
      }
      return row!.id;
    },

    async insertDiscountApplication(
      tx: DbOrTx,
      values: { discountRuleId: string; invoiceId: string; invoiceLineId: string; amountPaise: number },
    ) {
      await tx.insert(discountApplications).values(values);
    },

    async findBySubscriptionPeriod(subscriptionId: string, periodStart: string, tx: DbOrTx = db) {
      const [row] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.subscriptionId, subscriptionId), eq(invoices.periodStart, periodStart)))
        .limit(1);
      return row;
    },
  };
}

export type InvoicesRepository = ReturnType<typeof createInvoicesRepository>;
