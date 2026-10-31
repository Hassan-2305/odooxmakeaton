import type { BillingRunItemOutcome, SubscriptionDetail } from "@brightloop/shared";
import { useQueries } from "@tanstack/react-query";
import { api } from "./api";
import type { StatusTone } from "./theme";

export const OUTCOME_INFO: Record<BillingRunItemOutcome, { label: string; tone: StatusTone }> = {
  created: { label: "Invoiced", tone: "paid" },
  already_billed: { label: "Already billed", tone: "draft" },
  skipped: { label: "Skipped", tone: "due-soon" },
  failed: { label: "Failed", tone: "overdue" },
};

/**
 * Customer names for the subscriptions in a run (run items only carry the subscription).
 * Shares the cache with the subscription detail page.
 */
export function useSubscriptionCustomers(ids: string[]): Map<string, { id: string; name: string }> {
  const unique = [...new Set(ids)];
  const results = useQueries({
    queries: unique.map((id) => {
      const path = `/api/subscriptions/${id}`;
      return {
        queryKey: ["subscriptions", "detail", path],
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
          (await api<{ subscription: SubscriptionDetail }>(path, { signal })).subscription,
        staleTime: 5 * 60_000,
      };
    }),
  });
  const map = new Map<string, { id: string; name: string }>();
  results.forEach((r, i) => {
    if (r.data) map.set(unique[i]!, { id: r.data.customerId, name: r.data.customerName });
  });
  return map;
}
