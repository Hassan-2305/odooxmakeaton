import type { ListResponse } from "@brightloop/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { api, type QueryParams } from "./api";

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_LIST_PAGE_SIZE = 50;

export interface ListState {
  page: number;
  pageSize: number;
  /** API sort string, e.g. "-createdAt". Undefined uses the endpoint's default. */
  sort?: string;
  /** Endpoint-specific filters, kept in the URL alongside page/pageSize/sort. */
  filters: Record<string, string>;
}

const RESERVED = new Set(["page", "pageSize", "sort"]);

type Patch = Partial<Record<string, string | number | undefined>>;

function listApi(state: ListState, update: (patch: Patch, resetPage?: boolean) => void) {
  return {
    ...state,
    setPage: (page: number) => update({ page: page > 1 ? page : undefined }, false),
    setPageSize: (pageSize: number) => update({ pageSize }),
    setSort: (sort: string | undefined) => update({ sort }),
    setFilter: (key: string, value: string | undefined) => update({ [key]: value }),
    setFilters: (patch: Record<string, string | undefined>) => update(patch),
    clearFilters: () => update(Object.fromEntries(Object.keys(state.filters).map((k) => [k, undefined]))),
  };
}

/**
 * Page, page size, sort and filters stored in the URL, so lists survive reloads and back/forward.
 * `exclude` names query params that belong to the page (e.g. "tab") rather than to the list.
 */
export function useListState(defaults: { pageSize?: number; sort?: string; exclude?: readonly string[] } = {}) {
  const [params, setParams] = useSearchParams();
  const excludeKey = defaults.exclude?.join(",") ?? "";

  const state = useMemo<ListState>(() => {
    const excluded = new Set(excludeKey ? excludeKey.split(",") : []);
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Number(params.get("pageSize")) || defaults.pageSize || DEFAULT_LIST_PAGE_SIZE;
    const filters: Record<string, string> = {};
    params.forEach((value, key) => {
      if (!RESERVED.has(key) && !excluded.has(key) && value !== "") filters[key] = value;
    });
    return { page, pageSize, sort: params.get("sort") ?? defaults.sort, filters };
  }, [params, defaults.pageSize, defaults.sort, excludeKey]);

  const update = useCallback(
    (patch: Patch, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === "") next.delete(key);
            else next.set(key, String(value));
          }
          if (resetPage && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return listApi(state, update);
}

/**
 * Same API as useListState but kept in component state, for secondary lists embedded in a
 * detail page (a customer's invoices) so they don't fight over the page's query string.
 */
export function useLocalListState(defaults: { pageSize?: number; sort?: string; filters?: Record<string, string> } = {}) {
  const [state, setState] = useState<ListState>(() => ({
    page: 1,
    pageSize: defaults.pageSize ?? 10,
    sort: defaults.sort,
    filters: defaults.filters ?? {},
  }));

  const update = useCallback(
    (patch: Patch, resetPage = true) =>
      setState((prev) => {
        const next: ListState = { ...prev, filters: { ...prev.filters } };
        for (const [key, raw] of Object.entries(patch)) {
          const value = raw === undefined || raw === "" ? undefined : String(raw);
          if (key === "page") next.page = Number(value) || 1;
          else if (key === "pageSize") next.pageSize = Number(value) || prev.pageSize;
          else if (key === "sort") next.sort = value ?? defaults.sort;
          else if (value === undefined) delete next.filters[key];
          else next.filters[key] = value;
        }
        if (resetPage && !("page" in patch)) next.page = 1;
        return next;
      }),
    [defaults.sort],
  );

  return listApi(state, update);
}

export type ListStateApi = ReturnType<typeof listApi>;

/**
 * Fetches one page of a list endpoint. `key` is the TanStack query key root (e.g. "invoices")
 * so live updates can invalidate every page of that list at once.
 */
export function useListQuery<T>(key: string, path: string, list: ListState) {
  const params: QueryParams = { page: list.page, pageSize: list.pageSize, sort: list.sort, ...list.filters };
  return useQuery({
    queryKey: [key, "list", params],
    queryFn: ({ signal }) => api<ListResponse<T>>(path, { params, signal }),
    placeholderData: keepPreviousData,
  });
}

type SortValue = string | number | boolean | null | undefined;

/**
 * For endpoints that return every row at once ({ data, tookMs? }, no paging): fetches once,
 * then sorts and pages in the browser so the result plugs into <DataTable> like a server list.
 * `sortBy` maps each sortable column's field to the value to compare.
 */
export function useClientListQuery<T>(
  queryKey: readonly unknown[],
  path: string,
  list: ListState,
  options: {
    params?: QueryParams;
    sortBy?: Record<string, (row: T) => SortValue>;
    /** Applied before sorting, e.g. a status filter the endpoint doesn't support. */
    filter?: (row: T) => boolean;
  } = {},
) {
  const { params, sortBy = {}, filter } = options;
  return useQuery({
    queryKey: [...queryKey, params ?? {}],
    queryFn: ({ signal }) => api<{ data: T[]; tookMs?: number }>(path, { params, signal }),
    select: (res): ListResponse<T> => {
      let rows = filter ? res.data.filter(filter) : res.data;
      const sort = list.sort?.split(",")[0];
      const field = sort?.replace(/^-/, "");
      const get = field ? sortBy[field] : undefined;
      if (get) {
        const dir = sort!.startsWith("-") ? -1 : 1;
        rows = [...rows].sort((a, b) => dir * compare(get(a), get(b)));
      }
      const start = (list.page - 1) * list.pageSize;
      return { data: rows.slice(start, start + list.pageSize), total: rows.length, tookMs: res.tookMs ?? 0 };
    },
  });
}

function compare(a: SortValue, b: SortValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
