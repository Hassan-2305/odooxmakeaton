import type { ListResponse } from "@brightloop/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
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

/** Page, page size, sort and filters stored in the URL, so lists survive reloads and back/forward. */
export function useListState(defaults: { pageSize?: number; sort?: string } = {}) {
  const [params, setParams] = useSearchParams();

  const state = useMemo<ListState>(() => {
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Number(params.get("pageSize")) || defaults.pageSize || DEFAULT_LIST_PAGE_SIZE;
    const filters: Record<string, string> = {};
    params.forEach((value, key) => {
      if (!RESERVED.has(key) && value !== "") filters[key] = value;
    });
    return { page, pageSize, sort: params.get("sort") ?? defaults.sort, filters };
  }, [params, defaults.pageSize, defaults.sort]);

  const update = useCallback(
    (patch: Partial<Record<string, string | number | undefined>>, resetPage = true) => {
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

  return {
    ...state,
    setPage: (page: number) => update({ page: page > 1 ? page : undefined }, false),
    setPageSize: (pageSize: number) => update({ pageSize }),
    setSort: (sort: string | undefined) => update({ sort }),
    setFilter: (key: string, value: string | undefined) => update({ [key]: value }),
    clearFilters: () => update(Object.fromEntries(Object.keys(state.filters).map((k) => [k, undefined]))),
  };
}

export type ListStateApi = ReturnType<typeof useListState>;

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
