import type { BillingRun } from "@brightloop/shared";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Considered / created / already billed / skipped / failed tiles. */
export function RunCounters({ run }: { run: BillingRun }) {
  const tiles = [
    { label: "Considered", value: run.consideredCount },
    { label: "Created", value: run.invoicedCount, tone: "text-status-paid" },
    { label: "Already billed", value: run.alreadyBilledCount },
    { label: "Skipped", value: run.skippedCount, tone: run.skippedCount ? "text-status-due-soon" : undefined },
    { label: "Failed", value: run.failedCount, tone: run.failedCount ? "text-status-overdue" : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-live="polite">
      {tiles.map((t) => (
        <div key={t.label} className="card-surface p-4">
          <p className="text-sm text-muted-foreground">{t.label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", t.tone)}>{formatCount(t.value)}</p>
        </div>
      ))}
    </div>
  );
}
