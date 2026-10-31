import type { LiveStatus } from "@/lib/live-updates";
import { cn } from "@/lib/utils";

const LABELS: Record<LiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  polling: "Refreshing every 30s",
};

/** Small dot showing whether data updates arrive live or by polling. */
export function LiveIndicator({ status, className }: { status: LiveStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)} title={LABELS[status]}>
      <span
        className={cn(
          "size-2 rounded-full",
          status === "live" ? "bg-status-paid" : status === "polling" ? "bg-status-due-soon" : "bg-status-draft animate-pulse",
        )}
        aria-hidden
      />
      {LABELS[status]}
    </span>
  );
}
