import {
  reportSummaryQuerySchema,
  type ReportAging,
  type ReportCollections,
  type ReportSummary,
} from "@brightloop/shared";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api } from "./api";
import { monthStartIso, todayIso } from "./format";

/** Report filters in the URL: ?from&to&customerId. Empty dates use this month to today. */
export function useReportFilters() {
  const [params, setParams] = useSearchParams();
  const from = params.get("from") || monthStartIso();
  const to = params.get("to") || todayIso();
  const customerId = params.get("customerId") || undefined;

  // Same zod schema the API validates with, so a bad range never leaves the browser.
  const parsed = reportSummaryQuerySchema.safeParse({ from, to, customer_id: customerId });
  const rangeError = parsed.success ? undefined : parsed.error.issues[0]?.message;

  const set = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const isFiltered = params.has("from") || params.has("to") || params.has("customerId");
  const reset = () => setParams({}, { replace: true });

  return { from, to, customerId, rangeError, set, isFiltered, reset };
}

export type ReportFilters = ReturnType<typeof useReportFilters>;

// Query keys start with "reports" so live updates (invoice.created, payment.recorded) refresh them.

export function useSummary({ from, to, customerId, rangeError }: ReportFilters) {
  return useQuery({
    queryKey: ["reports", "summary", { from, to, customerId }],
    queryFn: ({ signal }) =>
      api<ReportSummary>("/api/reports/summary", { params: { from, to, customer_id: customerId }, signal }),
    enabled: !rangeError,
  });
}

export function useCollections({ from, to, customerId, rangeError }: ReportFilters) {
  return useQuery({
    queryKey: ["reports", "collections", { from, to, customerId }],
    queryFn: ({ signal }) =>
      api<ReportCollections>("/api/reports/collections", { params: { from, to, customer_id: customerId }, signal }),
    enabled: !rangeError,
  });
}

export function useAging({ customerId }: ReportFilters) {
  return useQuery({
    queryKey: ["reports", "aging", { customerId }],
    queryFn: ({ signal }) => api<ReportAging>("/api/reports/aging", { params: { customer_id: customerId }, signal }),
  });
}
