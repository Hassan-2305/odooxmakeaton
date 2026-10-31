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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-live="polite">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className={cn("text-xl font-semibold tabular-nums", t.tone)}>{formatCount(t.value)}</p>
        </div>
      ))}
    </div>
  );
}
