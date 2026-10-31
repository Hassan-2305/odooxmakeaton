import type { ListResponse } from "@brightloop/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type QueryParams } from "./api";

/**
 * Query key roots. Live updates invalidate "invoices", "payments", "runs" and "reports",
 * so pages that show those records use the same roots.
 */
export type ResourceKey =
  | "customers"
  | "products"
  | "variants"
  | "attributes"
  | "plans"
  | "taxes"
  | "discounts"
  | "templates"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "runs"
  | "reports"
  | "findings";

/** Up to 100 rows for a picker (the API's max page size). */
export function useOptions<T>(key: ResourceKey, path: string, params: QueryParams = {}, enabled = true) {
  return useQuery({
    queryKey: [key, "options", params],
    queryFn: ({ signal }) => api<ListResponse<T>>(path, { params: { pageSize: 100, ...params }, signal }),
    staleTime: 60_000,
    enabled,
  });
}

/** GET one record and unwrap `{ [field]: record }`. */
export function useRecord<T>(key: ResourceKey, path: string, field: string, enabled = true) {
  return useQuery({
    queryKey: [key, "detail", path],
    queryFn: async ({ signal }) => (await api<Record<string, T>>(path, { signal }))[field]!,
    enabled,
  });
}

/** A mutation that marks the given query roots stale when it succeeds. */
export function useApiMutation<I, O = unknown>(fn: (input: I) => Promise<O>, invalidate: readonly ResourceKey[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}
