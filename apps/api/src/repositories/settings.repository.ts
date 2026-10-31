import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { settings } from "../db/schema/index.js";
import type { DbOrTx } from "./audit.repository.js";

export type NumberKind = "subscription" | "invoice" | "credit_note";

const columns = {
  subscription: { prefix: settings.subscriptionPrefix, seq: settings.nextSubscriptionSeq, key: "nextSubscriptionSeq" },
  invoice: { prefix: settings.invoicePrefix, seq: settings.nextInvoiceSeq, key: "nextInvoiceSeq" },
  credit_note: { prefix: settings.creditNotePrefix, seq: settings.nextCreditNoteSeq, key: "nextCreditNoteSeq" },
} as const;

/** Format of document numbers: prefix + zero-padded sequence, e.g. INV-000042. */
export function formatNumber(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

export function createSettingsRepository(db: Db) {
  return {
    /**
     * Takes the next number of `kind` from the settings row inside `tx`. The row is
     * locked by the UPDATE, so concurrent transactions get distinct numbers, and a
     * rolled-back transaction gives its number back.
     */
    async nextNumber(tx: DbOrTx, kind: NumberKind): Promise<string> {
      const col = columns[kind];
      const [row] = await tx
        .update(settings)
        .set({ [col.key]: sql`${col.seq} + 1`, updatedAt: new Date() })
        .where(eq(settings.id, 1))
        .returning({ prefix: col.prefix, next: col.seq });
      if (!row) throw new Error("settings row is missing; run the seed");
      return formatNumber(row.prefix, row.next - 1);
    },

    async get(tx: DbOrTx = db) {
      const [row] = await tx.select().from(settings).where(eq(settings.id, 1)).limit(1);
      if (!row) throw new Error("settings row is missing; run the seed");
      return row;
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
