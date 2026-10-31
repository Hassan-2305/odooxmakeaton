import type {
  CreateDiscountRuleInput,
  DiscountRule,
  DiscountRuleListQuery,
  ListResponse,
  UpdateDiscountRuleInput,
} from "@brightloop/shared";
import { and, asc, count, eq, gte, ilike, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { discountRules } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

type Row = typeof discountRules.$inferSelect;

export function toDiscountRule(row: Row): DiscountRule {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** Active, valid on `date` (both ends inclusive) and not used up. */
function usableOn(date: string): SQL {
  return and(
    eq(discountRules.isActive, true),
    or(isNull(discountRules.validFrom), lte(discountRules.validFrom, date)),
    or(isNull(discountRules.validTo), gte(discountRules.validTo, date)),
    or(isNull(discountRules.usageLimit), lt(discountRules.usedCount, discountRules.usageLimit)),
  )!;
}

const sortColumns = {
  name: discountRules.name,
  validFrom: discountRules.validFrom,
  validTo: discountRules.validTo,
  createdAt: discountRules.createdAt,
};

export function createDiscountsRepository(db: Db) {
  return {
    async list(query: DiscountRuleListQuery): Promise<ListResponse<DiscountRule>> {
      const filters: SQL[] = [];
      if (query.q) {
        const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        filters.push(or(ilike(discountRules.name, pattern), ilike(discountRules.code, pattern))!);
      }
      if (query.isActive !== undefined) filters.push(eq(discountRules.isActive, query.isActive));
      if (query.scope) filters.push(eq(discountRules.scope, query.scope));
      if (query.productId) filters.push(eq(discountRules.productId, query.productId));
      if (query.usableOn) filters.push(usableOn(query.usableOn));
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), discountRules.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db.select().from(discountRules).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(discountRules).where(where),
        ]);
        return { rows: rows.map(toDiscountRule), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, tx: DbOrTx = db): Promise<DiscountRule | undefined> {
      const [row] = await tx.select().from(discountRules).where(eq(discountRules.id, id)).limit(1);
      return row && toDiscountRule(row);
    },

    /** Rules that could apply on `date`, product rules first, oldest first. */
    async findUsable(date: string, tx: DbOrTx = db): Promise<DiscountRule[]> {
      const rows = await tx
        .select()
        .from(discountRules)
        .where(usableOn(date))
        .orderBy(sql`${discountRules.scope} = 'subscription'`, asc(discountRules.createdAt), asc(discountRules.id));
      return rows.map(toDiscountRule);
    },

    /** SELECT ... FOR UPDATE: holds the row until `tx` ends, so concurrent consumers queue. */
    async lockById(tx: DbOrTx, id: string): Promise<DiscountRule | undefined> {
      const [row] = await tx.select().from(discountRules).where(eq(discountRules.id, id)).for("update");
      return row && toDiscountRule(row);
    },

    async incrementUsed(tx: DbOrTx, id: string): Promise<DiscountRule> {
      const [row] = await tx
        .update(discountRules)
        .set({ usedCount: sql`${discountRules.usedCount} + 1`, updatedAt: new Date() })
        .where(eq(discountRules.id, id))
        .returning();
      return toDiscountRule(row!);
    },

    async create(tx: DbOrTx, input: CreateDiscountRuleInput): Promise<DiscountRule> {
      const [row] = await tx.insert(discountRules).values(input).returning();
      return toDiscountRule(row!);
    },

    async update(tx: DbOrTx, id: string, input: UpdateDiscountRuleInput): Promise<DiscountRule | undefined> {
      const [row] = await tx
        .update(discountRules)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(discountRules.id, id))
        .returning();
      return row && toDiscountRule(row);
    },

    async delete(tx: DbOrTx, id: string): Promise<boolean> {
      const rows = await tx.delete(discountRules).where(eq(discountRules.id, id)).returning({ id: discountRules.id });
      return rows.length > 0;
    },

    transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => db.transaction(fn),
  };
}

export type DiscountsRepository = ReturnType<typeof createDiscountsRepository>;
