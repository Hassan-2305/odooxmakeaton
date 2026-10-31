import type {
  DismissFindingInput,
  FindingRule,
  IntegrityFinding,
  IntegrityFindingEvent,
  IntegrityScanResult,
  ResolveFindingInput,
} from "@brightloop/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const RULE_INFO: Record<FindingRule, { label: string; description: string; resolutions: string[] }> = {
  missing_invoice: {
    label: "Missing invoice",
    description:
      "An active subscription whose next invoice date passed more than a day ago with no invoice raised for that period.",
    resolutions: ["Invoice raised manually", "Billing run re-triggered", "Period not billable"],
  },
  duplicate_invoice: {
    label: "Duplicate invoice",
    description:
      "More than one non-cancelled invoice for the same subscription and billing period. The earliest is treated as the original.",
    resolutions: ["Duplicate cancelled", "Credit note issued", "Separate charge, not a duplicate"],
  },
  unallocated_payment: {
    label: "Unallocated payment",
    description: "A payment whose allocations to invoices add up to less than the amount received.",
    resolutions: ["Allocated to invoice", "Refunded to customer", "Held as customer credit"],
  },
};

export function ruleLabel(rule: string): string {
  return RULE_INFO[rule as FindingRule]?.label ?? rule;
}

const invalidateAfterChange = (queryClient: ReturnType<typeof useQueryClient>) => {
  // The dashboard's open-findings tile reads from reports.
  void queryClient.invalidateQueries({ queryKey: ["findings"] });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
};

export function useFinding(id: string | null) {
  return useQuery({
    queryKey: ["findings", "detail", id],
    queryFn: ({ signal }) =>
      api<{ finding: IntegrityFinding; events: IntegrityFindingEvent[] }>(`/api/integrity/findings/${id}`, { signal }),
    enabled: id !== null,
  });
}

export function useScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<IntegrityScanResult>("/api/integrity/scan", { method: "POST" }),
    onSuccess: () => invalidateAfterChange(queryClient),
  });
}

export function useDismissFinding(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DismissFindingInput) =>
      api<{ finding: IntegrityFinding }>(`/api/integrity/findings/${id}/dismiss`, { method: "POST", body: input }),
    onSuccess: () => invalidateAfterChange(queryClient),
  });
}

export function useResolveFinding(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveFindingInput) =>
      api<{ finding: IntegrityFinding }>(`/api/integrity/findings/${id}/resolve`, { method: "POST", body: input }),
    onSuccess: () => invalidateAfterChange(queryClient),
  });
}
