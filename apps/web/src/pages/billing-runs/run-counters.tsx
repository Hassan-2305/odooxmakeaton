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
        <div key={t.label} className="card-surface relative overflow-hidden p-4">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-400 to-orange-600 opacity-70" aria-hidden />
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.label}</p>
          <p className={cn("mt-1 text-2xl font-bold tabular-nums", t.tone)}>{formatCount(t.value)}</p>
        </div>
      ))}
    </div>
  );
}
