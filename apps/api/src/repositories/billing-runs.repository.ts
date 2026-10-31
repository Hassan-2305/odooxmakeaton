import type { BillingRun, BillingRunItem, BillingRunListQuery, ListResponse } from "@brightloop/shared";
import { and, asc, count, eq, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { billingRunItems, billingRuns, invoices, subscriptions } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

type RunRow = typeof billingRuns.$inferSelect;
type ItemValues = Omit<typeof billingRunItems.$inferInsert, "id" | "createdAt">;

export function toBillingRun(row: RunRow, dryRun = false): BillingRun {
  return {
    ...row,
    dryRun,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

const sortColumns = { startedAt: billingRuns.startedAt, businessDate: billingRuns.businessDate };

export function createBillingRunsRepository(db: Db) {
  return {
    /** Active subscriptions with a period due on or before `date`, oldest first. */
    async dueSubscriptionIds(tx: DbOrTx, date: string, onlyIds?: string[]): Promise<string[]> {
      const filters: SQL[] = [eq(subscriptions.status, "active"), lte(subscriptions.nextInvoiceDate, date)];
      if (onlyIds) filters.push(inArray(subscriptions.id, onlyIds));
      const rows = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(...filters))
        .orderBy(asc(subscriptions.nextInvoiceDate), asc(subscriptions.id));
      return rows.map((r) => r.id);
    },

    async insertRun(tx: DbOrTx, values: typeof billingRuns.$inferInsert): Promise<RunRow> {
      const [row] = await tx.insert(billingRuns).values(values).returning();
      return row!;
    },

    /** Stamps finished_at with the database clock, the same clock as started_at. */
    async finishRun(tx: DbOrTx, id: string, values: Partial<typeof billingRuns.$inferInsert>): Promise<RunRow> {
      const [row] = await tx
        .update(billingRuns)
        .set({ ...values, finishedAt: sql`greatest(clock_timestamp(), ${billingRuns.startedAt})` })
        .where(eq(billingRuns.id, id))
        .returning();
      return row!;
    },

    async insertItem(tx: DbOrTx, values: ItemValues): Promise<void> {
      await tx.insert(billingRunItems).values(values);
    },

    async list(query: BillingRunListQuery): Promise<ListResponse<BillingRun>> {
      const where = query.status ? eq(billingRuns.status, query.status) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), billingRuns.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db.select().from(billingRuns).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(billingRuns).where(where),
        ]);
        return { rows: rows.map((r) => toBillingRun(r)), total: totalRow?.total ?? 0 };
      });
    },

    async findRun(id: string, tx: DbOrTx = db): Promise<RunRow | undefined> {
      const [row] = await tx.select().from(billingRuns).where(eq(billingRuns.id, id)).limit(1);
      return row;
    },

    async items(runId: string, tx: DbOrTx = db): Promise<BillingRunItem[]> {
      const rows = await tx
        .select({
          item: billingRunItems,
          subscriptionNumber: subscriptions.number,
          invoiceNumber: invoices.number,
          totalPaise: invoices.totalPaise,
        })
        .from(billingRunItems)
        .leftJoin(subscriptions, eq(subscriptions.id, billingRunItems.subscriptionId))
        .leftJoin(invoices, eq(invoices.id, billingRunItems.invoiceId))
        .where(eq(billingRunItems.billingRunId, runId))
        .orderBy(asc(billingRunItems.createdAt), asc(billingRunItems.id));
      return rows.map(({ item, subscriptionNumber, invoiceNumber, totalPaise }) => ({
        id: item.id,
        subscriptionId: item.subscriptionId,
        subscriptionNumber,
        outcome: item.outcome,
        periodStart: item.periodStart,
        reason: item.reason,
        invoiceId: item.invoiceId,
        invoiceNumber,
        totalPaise,
        createdAt: item.createdAt.toISOString(),
      }));
    },

    transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => db.transaction(fn),

    /** The plain connection: each `conn.transaction` call is its own top-level transaction. */
    conn: db as DbOrTx,
  };
}

export type BillingRunsRepository = ReturnType<typeof createBillingRunsRepository>;
