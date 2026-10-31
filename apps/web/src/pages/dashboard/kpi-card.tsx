import { ArrowUpRightIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { GlossaryTip } from "@/components/glossary-tip";
import { cn } from "@/lib/utils";

export type KpiAccent = "orange" | "blue" | "green" | "violet" | "red" | "amber" | "cyan";

const ACCENTS: Record<KpiAccent, string> = {
  orange: "bg-orange-50 text-orange-600 ring-orange-100",
  blue: "bg-blue-50 text-blue-600 ring-blue-100",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  red: "bg-red-50 text-red-600 ring-red-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  cyan: "bg-cyan-50 text-cyan-600 ring-cyan-100",
};

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
  icon: LucideIcon;
  accent?: KpiAccent;
}

export function KpiCard({ label, glossary, value, sub, to, loading, tone = "default", icon: Icon, accent = "blue" }: KpiCardProps) {
  const warn = tone === "warning";
  return (
    <Link
      to={to}
      className={cn(
        "group card-surface relative flex gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        warn && "border-red-100 bg-gradient-to-br from-red-50/70 to-white",
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1",
          ACCENTS[warn ? "red" : accent],
        )}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <span className="truncate">{label}</span>
          <GlossaryTip term={label}>{glossary}</GlossaryTip>
          <ArrowUpRightIcon
            className="ml-auto size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </div>
        {loading ? (
          <>
            <div className="mt-2 h-7 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-20 animate-pulse rounded bg-muted" />
          </>
        ) : (
          <>
            <p
              className={cn(
                "mt-1 truncate text-[1.6rem] leading-tight font-bold tracking-tight tabular-nums",
                warn && "text-status-overdue",
              )}
            >
              {value}
            </p>
            <p className={cn("mt-1 min-h-4 text-xs", warn ? "font-medium text-red-600" : "text-muted-foreground")}>{sub}</p>
          </>
        )}
      </div>
    </Link>
  );
}
