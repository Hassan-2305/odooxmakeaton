import path from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { TransactionRollbackError } from "drizzle-orm";
import { Pool } from "pg";
import type { DbOrTx } from "../repositories/audit.repository.js";
import * as schema from "../db/schema/index.js";

/**
 * Integration tests run against the Postgres in DATABASE_URL (repo-root .env).
 * Every test runs inside a transaction that is rolled back, so nothing persists.
 * When the database can't be reached the suites are skipped, not failed.
 */
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // No .env; rely on the environment.
}

const url = process.env.DATABASE_URL;
const pool = url ? new Pool({ connectionString: url, connectionTimeoutMillis: 2000, max: 2 }) : undefined;
pool?.on("error", () => {});

export const testDb = pool ? drizzle(pool, { schema }) : undefined;

async function ping(): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query("select 1 from integrity_findings limit 1");
    return true;
  } catch {
    return false;
  }
}

export const dbAvailable = await ping();

/** Runs `fn` in a transaction and always rolls it back. */
export async function inRollback(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  if (!testDb) throw new Error("No test database");
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (err) {
    if (!(err instanceof TransactionRollbackError)) throw err;
  }
}

export async function closeTestDb() {
  await pool?.end();
}

const suffix = () => randomUUID().slice(0, 8);

/** Minimal valid rows for the billing tables. Amounts are paise. */
export function fixtures(tx: DbOrTx) {
  return {
    async customer(name = `Customer ${suffix()}`) {
      const [row] = await tx
        .insert(schema.customers)
        .values({ name, email: `${suffix()}@example.in` })
        .returning();
      return row!;
    },

    async plan(interval: "day" | "week" | "month" | "year" = "month", intervalCount = 1) {
      const [row] = await tx
        .insert(schema.recurringPlans)
        .values({ name: `Plan ${interval} ${suffix()}`, interval, intervalCount })
        .returning();
      return row!;
    },

    async subscription(opts: {
      customerId: string;
      planId: string;
      status?: "draft" | "quotation" | "active" | "paused" | "closed" | "cancelled";
      startDate?: string;
      expiryDate?: string | null;
      nextInvoiceDate?: string | null;
      /** Each line is quantity × unitPricePaise. */
      lines?: { quantity: number; unitPricePaise: number }[];
    }) {
      const [sub] = await tx
        .insert(schema.subscriptions)
        .values({
          number: `SUB-T-${suffix()}`,
          customerId: opts.customerId,
          recurringPlanId: opts.planId,
          status: opts.status ?? "active",
          startDate: opts.startDate ?? "2026-01-01",
          expiryDate: opts.expiryDate ?? null,
          nextInvoiceDate: opts.nextInvoiceDate ?? null,
          anchorDay: 1,
        })
        .returning();
      const lines = opts.lines ?? [];
      if (lines.length) {
        const [product] = await tx
          .insert(schema.products)
          .values({ name: `Product ${suffix()}`, basePricePaise: 0 })
          .returning();
        await tx.insert(schema.subscriptionLines).values(
          lines.map((l, i) => ({
            subscriptionId: sub!.id,
            productId: product!.id,
            description: `Line ${i + 1}`,
            quantity: l.quantity,
            unitPricePaise: l.unitPricePaise,
            sortOrder: i,
          })),
        );
      }
      return sub!;
    },

    async invoice(opts: {
      customerId: string;
      subscriptionId?: string | null;
      status?: "draft" | "confirmed" | "paid" | "cancelled";
      totalPaise: number;
      amountPaidPaise?: number;
      periodStart?: string;
      periodEnd?: string;
      issueDate?: string | null;
      dueDate?: string | null;
    }) {
      const status = opts.status ?? "confirmed";
      const [row] = await tx
        .insert(schema.invoices)
        .values({
          number: status === "draft" ? null : `INV-T-${suffix()}`,
          customerId: opts.customerId,
          subscriptionId: opts.subscriptionId ?? null,
          status,
          periodStart: opts.periodStart ?? "2026-10-01",
          periodEnd: opts.periodEnd ?? "2026-11-01",
          issueDate: opts.issueDate === undefined ? "2026-10-01" : opts.issueDate,
          dueDate: opts.dueDate === undefined ? "2026-10-15" : opts.dueDate,
          customerSnapshot: { name: "Snapshot" },
          subtotalPaise: opts.totalPaise,
          totalPaise: opts.totalPaise,
          amountPaidPaise: opts.amountPaidPaise ?? 0,
        })
        .returning();
      return row!;
    },

    async payment(opts: {
      customerId: string;
      amountPaise: number;
      paidOn?: string;
      /** Allocations of this payment to invoices. */
      allocations?: { invoiceId: string; amountPaise: number }[];
    }) {
      const [row] = await tx
        .insert(schema.payments)
        .values({
          customerId: opts.customerId,
          method: "upi",
          amountPaise: opts.amountPaise,
          paidOn: opts.paidOn ?? "2026-10-10",
        })
        .returning();
      if (opts.allocations?.length) {
        await tx
          .insert(schema.paymentAllocations)
          .values(opts.allocations.map((a) => ({ paymentId: row!.id, ...a })));
      }
      return row!;
    },
  };
}
