import type {
  CreditNote,
  Invoice,
  InvoiceAllocation,
  InvoiceLine,
  InvoiceListQuery,
  ListResponse,
} from "@brightloop/shared";
import { and, asc, count, eq, gt, gte, inArray, lt, lte, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  creditNotes,
  customers,
  discountApplications,
  invoiceLines,
  invoiceLineTaxes,
  invoices,
  paymentAllocations,
  payments,
} from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
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

/** Sum of confirmed credit notes against the invoice, in paise. */
const creditedSql = sql<number>`coalesce((
  select sum(${creditNotes.totalPaise}) from ${creditNotes}
  where ${creditNotes.invoiceId} = ${invoices.id} and ${creditNotes.status} = 'confirmed'
), 0)::bigint`.mapWith(Number);

const balanceSql = sql<number>`(${invoices.totalPaise} - ${invoices.amountPaidPaise} - ${creditedSql})`;

const summarySelect = { invoice: invoices, customerName: customers.name, creditedPaise: creditedSql };

function toInvoice(row: { invoice: InvoiceRow; customerName: string; creditedPaise: number }): Invoice {
  const i = row.invoice;
  return {
    id: i.id,
    number: i.number,
    subscriptionId: i.subscriptionId,
    customerId: i.customerId,
    customerName: row.customerName,
    billingRunId: i.billingRunId,
    status: i.status,
    currency: i.currency,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    subtotalPaise: i.subtotalPaise,
    discountTotalPaise: i.discountTotalPaise,
    taxTotalPaise: i.taxTotalPaise,
    totalPaise: i.totalPaise,
    amountPaidPaise: i.amountPaidPaise,
    creditedPaise: row.creditedPaise,
    balancePaise: i.totalPaise - i.amountPaidPaise - row.creditedPaise,
    confirmedAt: i.confirmedAt?.toISOString() ?? null,
    cancelledAt: i.cancelledAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

function toCreditNote(row: typeof creditNotes.$inferSelect): CreditNote {
  return {
    id: row.id,
    number: row.number,
    invoiceId: row.invoiceId,
    customerId: row.customerId,
    status: row.status,
    reason: row.reason,
    subtotalPaise: row.subtotalPaise,
    taxTotalPaise: row.taxTotalPaise,
    totalPaise: row.totalPaise,
    issueDate: row.issueDate,
    createdAt: row.createdAt.toISOString(),
  };
}

const sortColumns = {
  number: invoices.number,
  issueDate: invoices.issueDate,
  dueDate: invoices.dueDate,
  totalPaise: invoices.totalPaise,
  createdAt: invoices.createdAt,
};

export function createInvoicesRepository(db: Db) {
  function summaryQuery(tx: DbOrTx) {
    return tx.select(summarySelect).from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId));
  }

  return {
    /** `today` (business timezone) decides what is overdue. */
    async list(query: InvoiceListQuery, today: string): Promise<ListResponse<Invoice>> {
      const filters: SQL[] = [];
      if (query.status) filters.push(eq(invoices.status, query.status));
      if (query.customerId) filters.push(eq(invoices.customerId, query.customerId));
      if (query.subscriptionId) filters.push(eq(invoices.subscriptionId, query.subscriptionId));
      if (query.from) filters.push(gte(invoices.issueDate, query.from));
      if (query.to) filters.push(lte(invoices.issueDate, query.to));
      if (query.overdue !== undefined) {
        const overdue = and(eq(invoices.status, "confirmed"), gt(balanceSql, 0), lt(invoices.dueDate, today))!;
        filters.push(query.overdue ? overdue : sql`not (${overdue})`);
      }
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), invoices.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          summaryQuery(db).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(invoices).where(where),
        ]);
        return { rows: rows.map(toInvoice), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, tx: DbOrTx = db): Promise<Invoice | undefined> {
      const [row] = await summaryQuery(tx).where(eq(invoices.id, id)).limit(1);
      return row && toInvoice(row);
    },

    /** Locks the invoice row (FOR UPDATE) and returns it with its credited amount. */
    async lock(tx: DbOrTx, id: string): Promise<(InvoiceRow & { creditedPaise: number }) | undefined> {
      const [row] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
      if (!row) return undefined;
      const [credited] = await tx
        .select({ total: sql<number>`coalesce(sum(${creditNotes.totalPaise}), 0)::bigint`.mapWith(Number) })
        .from(creditNotes)
        .where(and(eq(creditNotes.invoiceId, id), eq(creditNotes.status, "confirmed")));
      return { ...row, creditedPaise: credited?.total ?? 0 };
    },

    async update(tx: DbOrTx, id: string, values: Partial<InvoiceValues>): Promise<void> {
      await tx.update(invoices).set({ ...values, updatedAt: new Date() }).where(eq(invoices.id, id));
    },

    async lines(id: string, tx: DbOrTx = db): Promise<InvoiceLine[]> {
      const rows = await tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, id))
        .orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.id));
      const taxes = rows.length
        ? await tx
            .select()
            .from(invoiceLineTaxes)
            .where(inArray(invoiceLineTaxes.invoiceLineId, rows.map((r) => r.id)))
            .orderBy(asc(invoiceLineTaxes.name))
        : [];
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        productId: r.productId,
        variantId: r.variantId,
        description: r.description,
        quantity: r.quantity,
        unitPricePaise: r.unitPricePaise,
        amountPaise: r.amountPaise,
        taxes: taxes
          .filter((t) => t.invoiceLineId === r.id)
          .map(({ taxId, name, rateBps, inclusive, taxableAmountPaise, taxAmountPaise }) => ({
            taxId,
            name,
            rateBps,
            inclusive,
            taxableAmountPaise,
            taxAmountPaise,
          })),
      }));
    },

    async allocations(id: string, tx: DbOrTx = db): Promise<InvoiceAllocation[]> {
      const rows = await tx
        .select({
          id: paymentAllocations.id,
          paymentId: paymentAllocations.paymentId,
          amountPaise: paymentAllocations.amountPaise,
          method: payments.method,
          paidOn: payments.paidOn,
          reference: payments.reference,
          createdAt: paymentAllocations.createdAt,
        })
        .from(paymentAllocations)
        .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
        .where(eq(paymentAllocations.invoiceId, id))
        .orderBy(asc(paymentAllocations.createdAt), asc(paymentAllocations.id));
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },

    async creditNotes(invoiceId: string, tx: DbOrTx = db): Promise<CreditNote[]> {
      const rows = await tx
        .select()
        .from(creditNotes)
        .where(eq(creditNotes.invoiceId, invoiceId))
        .orderBy(asc(creditNotes.createdAt), asc(creditNotes.id));
      return rows.map(toCreditNote);
    },

    async insertCreditNote(tx: DbOrTx, values: typeof creditNotes.$inferInsert): Promise<CreditNote> {
      const [row] = await tx.insert(creditNotes).values(values).returning();
      return toCreditNote(row!);
    },

    async customerSnapshotOf(id: string, tx: DbOrTx = db): Promise<Record<string, unknown> | undefined> {
      const [row] = await tx.select({ s: invoices.customerSnapshot }).from(invoices).where(eq(invoices.id, id));
      return row?.s as Record<string, unknown> | undefined;
    },

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

    transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => db.transaction(fn),
  };
}

export type InvoicesRepository = ReturnType<typeof createInvoicesRepository>;
