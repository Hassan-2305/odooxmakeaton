import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { GlossaryTip } from "@/components/glossary-tip";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  /** Explains the metric in the glossary tooltip. */
  glossary: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** List route with matching filters in the query string. */
  to: string;
  loading?: boolean;
  tone?: "default" | "warning";
}

export function KpiCard({ label, glossary, value, sub, to, loading, tone = "default" }: KpiCardProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>{label}</span>
        <GlossaryTip term={label}>{glossary}</GlossaryTip>
        <ArrowRightIcon
          className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
      {loading ? (
        <>
          <div className="h-7 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </>
      ) : (
        <>
          <p
            className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              tone === "warning" && "text-status-overdue",
            )}
          >
            {value}
          </p>
          <p className="min-h-4 text-xs text-muted-foreground">{sub}</p>
        </>
      )}
    </Link>
  );
}
