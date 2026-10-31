import { ArrowUpRightIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { GlossaryTip } from "@/components/glossary-tip";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  /** Explains the metric in the glossary tooltip. */
  glossary: ReactNode;
  /** Headline figure; money is shown compact (₹4.6Cr) so it never truncates. */
  value: ReactNode;
  /** Exact amount, shown under the headline when `value` is compact. */
  exact?: string;
  sub?: ReactNode;
  /** List route with matching filters in the query string. */
  to: string;
  loading?: boolean;
  tone?: "default" | "warning";
  icon: LucideIcon;
}

export function KpiCard({ label, glossary, value, exact, sub, to, loading, tone = "default", icon: Icon }: KpiCardProps) {
  const warn = tone === "warning";
  return (
    <Link
      to={to}
      title={exact}
      className="group card-surface relative flex flex-col p-5 transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={cn("size-4 shrink-0", warn ? "text-status-overdue" : "text-foreground/40")} aria-hidden />
        <span className="truncate">{label}</span>
        <GlossaryTip term={label}>{glossary}</GlossaryTip>
        <ArrowUpRightIcon
          className="ml-auto size-4 shrink-0 text-foreground/30 transition-colors group-hover:text-primary"
          aria-hidden
        />
      </div>
      {loading ? (
        <>
          <div className="mt-4 h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-36 animate-pulse rounded bg-muted" />
        </>
      ) : (
        <>
          <p
            className={cn(
              "mt-3 text-[1.85rem] leading-none font-semibold tracking-[-0.03em] tabular-nums",
              warn && "text-status-overdue",
            )}
          >
            {value}
          </p>
          <p className="mt-2.5 min-h-4 truncate text-xs tabular-nums text-foreground/70">{exact ?? " "}</p>
          <p className={cn("mt-0.5 min-h-4 truncate text-xs text-muted-foreground", warn && "font-medium text-status-overdue")}>
            {sub}
          </p>
        </>
      )}
    </Link>
  );
}
