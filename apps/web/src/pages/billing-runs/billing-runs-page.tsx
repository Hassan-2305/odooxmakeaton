import { BILLING_RUN_STATUSES, type BillingRun, type BillingRunDetail } from "@brightloop/shared";
import { FlaskConicalIcon, PlayCircleIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ClearFilters, FilterSelect } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { formatCount, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useListQuery, useListState } from "@/lib/list";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { RunCounters } from "./run-counters";
import { RunItemsTable } from "./run-items-table";

const columns: DataTableColumn<BillingRun>[] = [
  { id: "startedAt", header: "Started", sortField: "startedAt", className: "whitespace-nowrap", cell: (r) => formatDateTime(r.startedAt) },
  { id: "businessDate", header: "Billing date", sortField: "businessDate", className: "whitespace-nowrap", cell: (r) => formatDate(r.businessDate) },
  { id: "mode", header: "Trigger", cell: (r) => (r.mode === "scheduled" ? "Scheduled" : "Manual") },
  { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  { id: "created", header: "Created", align: "right", className: "tabular-nums", cell: (r) => formatCount(r.invoicedCount) },
  { id: "already", header: "Already billed", align: "right", className: "tabular-nums", cell: (r) => formatCount(r.alreadyBilledCount) },
  { id: "skipped", header: "Skipped", align: "right", className: "tabular-nums", cell: (r) => formatCount(r.skippedCount) },
  {
    id: "failed",
    header: "Failed",
    align: "right",
    className: "tabular-nums",
    cell: (r) => (r.failedCount ? <span className="font-medium text-status-overdue">{formatCount(r.failedCount)}</span> : 0),
  },
];

const runBilling = (mode: "dry" | "live") =>
  api<{ run: BillingRunDetail }>("/api/billing/runs", { method: "POST", params: { mode }, body: {} });

/** Billing runs: preview with a dry run, then run for real. History refreshes live over SSE. */
export function BillingRunsPage() {
  const list = useListState({ sort: "-startedAt", pageSize: 20 });
  const query = useListQuery<BillingRun>("runs", "/api/billing/runs", list);
  const navigate = useNavigate();
  const [preview, setPreview] = useState<BillingRunDetail | null>(null);
  const [confirming, setConfirming] = useState(false);
  const dry = useApiMutation(() => runBilling("dry"), []);
  const live = useApiMutation(() => runBilling("live"), ["runs", "invoices", "subscriptions", "reports", "findings"]);

  const startDry = () =>
    dry.mutate(undefined, {
      onSuccess: ({ run }) => setPreview(run),
      onError: (error) => toast.error("Dry run failed", errorMessage(error)),
    });

  const runForReal = async () => {
    const { run } = await live.mutateAsync(undefined);
    setPreview(null);
    toast.success(
      "Billing run complete",
      `${formatCount(run.invoicedCount)} invoice${run.invoicedCount === 1 ? "" : "s"} created` +
        (run.failedCount ? ` · ${formatCount(run.failedCount)} failed` : ""),
    );
    navigate(`/billing-runs/${run.id}`);
  };

  const previewTotal = preview?.items.reduce((sum, i) => sum + (i.outcome === "created" ? (i.totalPaise ?? 0) : 0), 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Billing runs"
        description="Raise invoices for every active subscription that's due. Preview first with a dry run; nothing is saved."
        actions={
          <Button onClick={startDry} disabled={dry.isPending}>
            <FlaskConicalIcon className={dry.isPending ? "animate-pulse" : undefined} />
            {dry.isPending ? "Previewing…" : "Dry run"}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/billing-runs/${r.id}`)}
        filters={
          <>
            <FilterSelect label="Statuses" value={list.filters.status} options={BILLING_RUN_STATUSES} onChange={(v) => list.setFilter("status", v)} />
            <ClearFilters list={list} />
          </>
        }
        empty={
          <EmptyState
            icon={PlayCircleIcon}
            title="No billing runs yet"
            description="Runs happen on schedule, or start one with a dry run."
            action={
              <Button size="sm" variant="outline" onClick={startDry} disabled={dry.isPending}>
                Dry run
              </Button>
            }
          />
        }
      />

      <Dialog open={preview !== null} onOpenChange={(o) => !o && !live.isPending && setPreview(null)}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Dry run for {preview && formatDate(preview.businessDate)}</DialogTitle>
            <DialogDescription>
              Nothing was saved. {preview && preview.invoicedCount > 0 && `Running for real would invoice ${formatMoney(previewTotal)}.`}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <>
              <RunCounters run={preview} />
              <RunItemsTable items={preview.items} dryRun />
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={live.isPending}>
              Close
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={live.isPending || !preview || preview.consideredCount === 0}>
              <PlayIcon /> Run for real
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Run billing for real?"
        description="Invoices are created for every subscription that's due today. Re-running never bills a period twice."
        confirmLabel="Run billing"
        onConfirm={runForReal}
      />
    </>
  );
}
