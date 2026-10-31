import type {
  ListResponse,
  QuotationTemplate,
  QuotationTemplateListQuery,
  TemplateLineInput,
} from "@brightloop/shared";
import { and, asc, count, eq, ilike, inArray, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { products, productVariants, quotationTemplates, templateLines } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

type TemplateRow = typeof quotationTemplates.$inferSelect;

export interface TemplateValues {
  name: string;
  validityDays: number;
  recurringPlanId?: string | null;
  notes?: string | null;
  isActive: boolean;
}

const sortColumns = {
  name: quotationTemplates.name,
  validityDays: quotationTemplates.validityDays,
  createdAt: quotationTemplates.createdAt,
};

export function createTemplatesRepository(db: Db) {
  async function linesFor(tx: DbOrTx, templateIds: string[]) {
    const map = new Map<string, QuotationTemplate["lines"]>();
    if (!templateIds.length) return map;
    const rows = await tx
      .select({
        templateId: templateLines.templateId,
        id: templateLines.id,
        productId: templateLines.productId,
        productName: products.name,
        variantId: templateLines.variantId,
        variantName: productVariants.name,
        description: templateLines.description,
        quantity: templateLines.quantity,
        sortOrder: templateLines.sortOrder,
      })
      .from(templateLines)
      .innerJoin(products, eq(products.id, templateLines.productId))
      .leftJoin(productVariants, eq(productVariants.id, templateLines.variantId))
      .where(inArray(templateLines.templateId, templateIds))
      .orderBy(asc(templateLines.sortOrder), asc(templateLines.id));
    for (const { templateId, ...line } of rows) {
      (map.get(templateId) ?? map.set(templateId, []).get(templateId)!).push(line);
    }
    return map;
  }

  function toTemplate(row: TemplateRow, lines: QuotationTemplate["lines"]): QuotationTemplate {
    return {
      id: row.id,
      name: row.name,
      validityDays: row.validityDays,
      recurringPlanId: row.recurringPlanId,
      notes: row.notes,
      isActive: row.isActive,
      lines,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  return {
    async list(query: QuotationTemplateListQuery): Promise<ListResponse<QuotationTemplate>> {
      const filters: SQL[] = [];
      if (query.q) filters.push(ilike(quotationTemplates.name, `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
      if (query.isActive !== undefined) filters.push(eq(quotationTemplates.isActive, query.isActive));
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), quotationTemplates.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db.select().from(quotationTemplates).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(quotationTemplates).where(where),
        ]);
        const lines = await linesFor(db, rows.map((r) => r.id));
        return { rows: rows.map((r) => toTemplate(r, lines.get(r.id) ?? [])), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, tx: DbOrTx = db): Promise<QuotationTemplate | undefined> {
      const [row] = await tx.select().from(quotationTemplates).where(eq(quotationTemplates.id, id)).limit(1);
      return row && toTemplate(row, (await linesFor(tx, [id])).get(id) ?? []);
    },

    async insert(tx: DbOrTx, values: TemplateValues): Promise<string> {
      const [row] = await tx.insert(quotationTemplates).values(values).returning({ id: quotationTemplates.id });
      return row!.id;
    },

    async update(tx: DbOrTx, id: string, values: Partial<TemplateValues>): Promise<boolean> {
      const rows = await tx
        .update(quotationTemplates)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(quotationTemplates.id, id))
        .returning({ id: quotationTemplates.id });
      return rows.length > 0;
    },

    async replaceLines(tx: DbOrTx, templateId: string, lines: TemplateLineInput[]) {
      await tx.delete(templateLines).where(eq(templateLines.templateId, templateId));
      if (!lines.length) return;
      await tx.insert(templateLines).values(
        lines.map((line, i) => ({
          templateId,
          productId: line.productId,
          variantId: line.variantId ?? null,
          description: line.description ?? null,
          quantity: line.quantity,
          sortOrder: line.sortOrder ?? i,
        })),
      );
    },

    async delete(id: string): Promise<boolean> {
      const rows = await db.delete(quotationTemplates).where(eq(quotationTemplates.id, id)).returning({ id: quotationTemplates.id });
      return rows.length > 0;
    },

    transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => db.transaction(fn),
  };
}

export type TemplatesRepository = ReturnType<typeof createTemplatesRepository>;
