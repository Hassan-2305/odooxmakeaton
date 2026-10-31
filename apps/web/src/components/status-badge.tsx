import { toneForStatus } from "@/lib/status";
import type { StatusTone } from "@/lib/theme";
import { cn } from "@/lib/utils";

const toneClasses: Record<StatusTone, string> = {
  paid: "bg-status-paid-bg text-status-paid-fg",
  "due-soon": "bg-status-due-soon-bg text-status-due-soon-fg",
  overdue: "bg-status-overdue-bg text-status-overdue-fg",
  draft: "bg-status-draft-bg text-status-draft-fg",
};

const dotClasses: Record<StatusTone, string> = {
  paid: "bg-status-paid",
  "due-soon": "bg-status-due-soon",
  overdue: "bg-status-overdue",
  draft: "bg-status-draft",
};

function humanize(status: string) {
  const words = status.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface StatusBadgeProps {
  status: string;
  /** Override the tone derived from `status`, e.g. a confirmed invoice past its due date. */
  tone?: StatusTone;
  /** Text to show instead of the humanized status. */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, tone, label, className }: StatusBadgeProps) {
  const resolved = tone ?? toneForStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[resolved],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotClasses[resolved])} aria-hidden />
      {label ?? humanize(status)}
    </span>
  );
}
