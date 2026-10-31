import type { ListResponse, SortField } from "@brightloop/shared";
import { asc, desc, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageWindow {
  limit: number;
  offset: number;
}

export function pageWindow({ page, pageSize }: PageRequest): PageWindow {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

/**
 * Runs a page query and its count, and wraps them in the list response shape.
 * `fetch` receives limit/offset and returns the rows plus the unpaged total.
 *
 *   return paginate(query, async ({ limit, offset }) => {
 *     const [rows, [{ total }]] = await Promise.all([
 *       db.select().from(invoices).where(where).orderBy(...order).limit(limit).offset(offset),
 *       db.select({ total: count() }).from(invoices).where(where),
 *     ]);
 *     return { rows, total };
 *   });
 */
export async function paginate<T>(
  request: PageRequest,
  fetch: (window: PageWindow) => Promise<{ rows: T[]; total: number }>,
): Promise<ListResponse<T>> {
  const start = performance.now();
  const { rows, total } = await fetch(pageWindow(request));
  return {
    data: rows,
    total: Number(total),
    tookMs: Math.round((performance.now() - start) * 100) / 100,
  };
}

/**
 * Maps parsed sort fields to Drizzle order-by clauses. `columns` is the allowlist:
 * sort fields are already restricted by `createListQuerySchema`, so a field missing
 * here is a programming error and throws.
 */
export function orderByFromSort<F extends string>(
  sort: SortField<F>[] | undefined,
  columns: Record<F, AnyPgColumn>,
): SQL[] {
  return (sort ?? []).map(({ field, direction }) => {
    const column = columns[field];
    if (!column) throw new Error(`No column mapped for sort field "${field}"`);
    return direction === "desc" ? desc(column) : asc(column);
  });
}
