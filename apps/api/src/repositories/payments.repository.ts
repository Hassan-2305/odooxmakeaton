import type { ListResponse, Payment, PaymentAllocation, PaymentListQuery } from "@brightloop/shared";
import { and, asc, count, eq, gt, gte, lte, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { customers, invoices, paymentAllocations, payments } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

type PaymentRow = typeof payments.$inferSelect;

const allocatedSql = sql<number>`coalesce((
  select sum(${paymentAllocations.amountPaise}) from ${paymentAllocations}
  where ${paymentAllocations.paymentId} = ${payments.id}
), 0)::bigint`.mapWith(Number);

const summarySelect = { payment: payments, customerName: customers.name, allocatedPaise: allocatedSql };

function toPayment(row: { payment: PaymentRow; customerName: string; allocatedPaise: number }): Payment {
  const p = row.payment;
  return {
    id: p.id,
    customerId: p.customerId,
    customerName: row.customerName,
    method: p.method,
    currency: p.currency,
    amountPaise: p.amountPaise,
    allocatedPaise: row.allocatedPaise,
    unallocatedPaise: p.amountPaise - row.allocatedPaise,
    paidOn: p.paidOn,
    reference: p.reference,
    notes: p.notes,
    recordedBy: p.recordedBy,
    createdAt: p.createdAt.toISOString(),
  };
}

const sortColumns = { paidOn: payments.paidOn, amountPaise: payments.amountPaise, createdAt: payments.createdAt };

export function createPaymentsRepository(db: Db) {
  function summaryQuery(tx: DbOrTx) {
    return tx.select(summarySelect).from(payments).innerJoin(customers, eq(customers.id, payments.customerId));
  }

  return {
    async list(query: PaymentListQuery): Promise<ListResponse<Payment>> {
      const filters: SQL[] = [];
      if (query.customerId) filters.push(eq(payments.customerId, query.customerId));
      if (query.method) filters.push(eq(payments.method, query.method));
      if (query.from) filters.push(gte(payments.paidOn, query.from));
      if (query.to) filters.push(lte(payments.paidOn, query.to));
      if (query.unallocated !== undefined) {
        const open = gt(sql`${payments.amountPaise} - ${allocatedSql}`, 0);
        filters.push(query.unallocated ? open : sql`not (${open})`);
      }
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), payments.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          summaryQuery(db).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(payments).where(where),
        ]);
        return { rows: rows.map(toPayment), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, tx: DbOrTx = db): Promise<Payment | undefined> {
      const [row] = await summaryQuery(tx).where(eq(payments.id, id)).limit(1);
      return row && toPayment(row);
    },

    /** Locks the payment row (FOR UPDATE) and returns it with the amount already allocated. */
    async lock(tx: DbOrTx, id: string): Promise<(PaymentRow & { allocatedPaise: number }) | undefined> {
      const [row] = await tx.select().from(payments).where(eq(payments.id, id)).for("update");
      if (!row) return undefined;
      const [allocated] = await tx
        .select({ total: sql<number>`coalesce(sum(${paymentAllocations.amountPaise}), 0)::bigint`.mapWith(Number) })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, id));
      return { ...row, allocatedPaise: allocated?.total ?? 0 };
    },

    async insert(tx: DbOrTx, values: typeof payments.$inferInsert): Promise<PaymentRow> {
      const [row] = await tx.insert(payments).values(values).returning();
      return row!;
    },

    /** Adds to the allocation for (payment, invoice), creating it on first use. */
    async addAllocation(tx: DbOrTx, paymentId: string, invoiceId: string, amountPaise: number): Promise<string> {
      const [row] = await tx
        .insert(paymentAllocations)
        .values({ paymentId, invoiceId, amountPaise })
        .onConflictDoUpdate({
          target: [paymentAllocations.paymentId, paymentAllocations.invoiceId],
          set: { amountPaise: sql`${paymentAllocations.amountPaise} + excluded.amount_paise` },
        })
        .returning({ id: paymentAllocations.id });
      return row!.id;
    },

    async allocations(paymentId: string, tx: DbOrTx = db): Promise<PaymentAllocation[]> {
      const rows = await tx
        .select({
          id: paymentAllocations.id,
          invoiceId: paymentAllocations.invoiceId,
          invoiceNumber: invoices.number,
          amountPaise: paymentAllocations.amountPaise,
          createdAt: paymentAllocations.createdAt,
        })
        .from(paymentAllocations)
        .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
        .where(eq(paymentAllocations.paymentId, paymentId))
        .orderBy(asc(paymentAllocations.createdAt), asc(paymentAllocations.id));
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },

    async countForInvoice(tx: DbOrTx, invoiceId: string): Promise<number> {
      const [row] = await tx.select({ n: count() }).from(paymentAllocations).where(eq(paymentAllocations.invoiceId, invoiceId));
      return row?.n ?? 0;
    },

    transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => db.transaction(fn),
  };
}

export type PaymentsRepository = ReturnType<typeof createPaymentsRepository>;
