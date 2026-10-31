import type {
  CreatePlanInput,
  CreateTaxInput,
  ListResponse,
  Plan,
  PlanListQuery,
  Tax,
  TaxListQuery,
  UpdatePlanInput,
  UpdateTaxInput,
} from "@brightloop/shared";
import { and, count, eq, gte, ilike, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { recurringPlans, taxes } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

type TaxRow = typeof taxes.$inferSelect;
type PlanRow = typeof recurringPlans.$inferSelect;

export function toTax(row: TaxRow): Tax {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function toPlan(row: PlanRow): Plan {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** Rows effective on `date`: from <= date and (no end or date <= end). Both bounds inclusive. */
function effectiveOn(date: string) {
  return and(
    lte(taxes.effectiveFrom, date),
    or(isNull(taxes.effectiveTo), gte(taxes.effectiveTo, date)),
  )!;
}

export function createTaxesRepository(db: Db) {
  const sortColumns = {
    name: taxes.name,
    rateBps: taxes.rateBps,
    effectiveFrom: taxes.effectiveFrom,
    createdAt: taxes.createdAt,
  };

  return {
    async list(query: TaxListQuery): Promise<ListResponse<Tax>> {
      const filters: SQL[] = [];
      if (query.isActive !== undefined) filters.push(eq(taxes.isActive, query.isActive));
      if (query.effectiveOn) filters.push(effectiveOn(query.effectiveOn));
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), taxes.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db.select().from(taxes).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(taxes).where(where),
        ]);
        return { rows: rows.map(toTax), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, tx: DbOrTx = db): Promise<Tax | undefined> {
      const [row] = await tx.select().from(taxes).where(eq(taxes.id, id)).limit(1);
      return row && toTax(row);
    },

    async findByIds(ids: string[], tx: DbOrTx = db): Promise<Tax[]> {
      if (!ids.length) return [];
      return (await tx.select().from(taxes).where(inArray(taxes.id, ids))).map(toTax);
    },

    /** Active taxes among `ids` that are in effect on `date`. */
    async findApplicable(ids: string[], date: string, tx: DbOrTx = db): Promise<Tax[]> {
      if (!ids.length) return [];
      const rows = await tx
        .select()
        .from(taxes)
        .where(and(inArray(taxes.id, ids), eq(taxes.isActive, true), effectiveOn(date)));
      return rows.map(toTax);
    },

    async create(input: CreateTaxInput): Promise<Tax> {
      const [row] = await db.insert(taxes).values(input).returning();
      return toTax(row!);
    },

    async update(id: string, input: UpdateTaxInput): Promise<Tax | undefined> {
      const [row] = await db
        .update(taxes)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(taxes.id, id))
        .returning();
      return row && toTax(row);
    },

    async delete(id: string): Promise<boolean> {
      const rows = await db.delete(taxes).where(eq(taxes.id, id)).returning({ id: taxes.id });
      return rows.length > 0;
    },
  };
}

export function createPlansRepository(db: Db) {
  const sortColumns = {
    name: recurringPlans.name,
    pricePaise: recurringPlans.pricePaise,
    createdAt: recurringPlans.createdAt,
  };

  return {
    async list(query: PlanListQuery): Promise<ListResponse<Plan>> {
      const filters: SQL[] = [];
      if (query.q) filters.push(ilike(recurringPlans.name, `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
      if (query.isActive !== undefined) filters.push(eq(recurringPlans.isActive, query.isActive));
      if (query.sellableOn) {
        const d = query.sellableOn;
        filters.push(
          eq(recurringPlans.isActive, true),
          or(isNull(recurringPlans.availableFrom), lte(recurringPlans.availableFrom, d))!,
          or(isNull(recurringPlans.availableTo), gte(recurringPlans.availableTo, d))!,
        );
      }
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), recurringPlans.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db.select().from(recurringPlans).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(recurringPlans).where(where),
        ]);
        return { rows: rows.map(toPlan), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, tx: DbOrTx = db): Promise<Plan | undefined> {
      const [row] = await tx.select().from(recurringPlans).where(eq(recurringPlans.id, id)).limit(1);
      return row && toPlan(row);
    },

    async create(input: CreatePlanInput): Promise<Plan> {
      const [row] = await db.insert(recurringPlans).values(input).returning();
      return toPlan(row!);
    },

    async update(id: string, input: UpdatePlanInput): Promise<Plan | undefined> {
      const [row] = await db
        .update(recurringPlans)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(recurringPlans.id, id))
        .returning();
      return row && toPlan(row);
    },

    async delete(id: string): Promise<boolean> {
      const rows = await db.delete(recurringPlans).where(eq(recurringPlans.id, id)).returning({ id: recurringPlans.id });
      return rows.length > 0;
    },
  };
}

export type TaxesRepository = ReturnType<typeof createTaxesRepository>;
export type PlansRepository = ReturnType<typeof createPlansRepository>;
