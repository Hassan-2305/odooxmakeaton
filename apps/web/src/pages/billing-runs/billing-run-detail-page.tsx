import { BILLING_RUN_ITEM_OUTCOMES, type BillingRunDetail } from "@brightloop/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { BackLink, DetailCard, DetailList, DetailSkeleton } from "@/components/detail";
import { ErrorState } from "@/components/error-state";
import { FilterSelect } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import { OUTCOME_INFO } from "@/lib/billing-runs";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";
import { RunCounters } from "./run-counters";
import { RunItemsTable } from "./run-items-table";

/** One run: counters (live while it runs, and on billing_run.finished) and every item. */
export function BillingRunDetailPage() {
  const { id = "" } = useParams();
  const [outcome, setOutcome] = useState<string | undefined>();
  // Key root "runs": the SSE hook invalidates it when a run finishes.
  const run = useQuery({
    queryKey: ["runs", "detail", id],
    queryFn: async ({ signal }) => (await api<{ run: BillingRunDetail }>(`/api/billing/runs/${id}`, { signal })).run,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
  });

  if (run.isPending) return <DetailSkeleton />;
  if (run.isError)
    return (
      <>
        <BackLink to="/billing-runs">Billing runs</BackLink>
        <ErrorState error={run.error} onRetry={() => void run.refetch()} />
      </>
    );

  const r = run.data;
  const items = outcome ? r.items.filter((i) => i.outcome === outcome) : r.items;

  return (
    <>
      <BackLink to="/billing-runs">Billing runs</BackLink>
      <PageHeader
        title={`Billing run · ${formatDate(r.businessDate)}`}
        description={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={r.status} />
            {r.mode === "scheduled" ? "Scheduled" : "Manual"} run
          </span>
        }
      />
      <div className="space-y-4">
        <RunCounters run={r} />
        <DetailCard title="Run">
          <DetailList
            items={[
              ["Started", formatDateTime(r.startedAt)],
              ["Finished", r.finishedAt ? formatDateTime(r.finishedAt) : "Still running…"],
              ["Billing date", formatDate(r.businessDate)],
              [
                "Integrity scan",
                r.integrityScan
                  ? `${formatCount(r.integrityScan.detected)} issue${r.integrityScan.detected === 1 ? "" : "s"} detected`
                  : "Not run",
              ],
            ]}
          />
        </DetailCard>
        <DetailCard
          title={`Items (${formatCount(items.length)})`}
          actions={
            <FilterSelect
              label="Outcomes"
              value={outcome}
              options={BILLING_RUN_ITEM_OUTCOMES}
              format={(o) => OUTCOME_INFO[o as keyof typeof OUTCOME_INFO].label}
              onChange={setOutcome}
            />
          }
        >
          <RunItemsTable items={items} />
        </DetailCard>
      </div>
    </>
  );
}
