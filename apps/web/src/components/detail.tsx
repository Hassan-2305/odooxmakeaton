import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back-link group mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeftIcon className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden /> {children}
    </Link>
  );
}

/** Bordered section of a detail page. */
export function DetailCard({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card-surface", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
          {title && <h2 className="font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Label/value pairs, two columns from 640px. */
export function DetailList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2", className)}>
      {items.map(([label, value], i) => (
        <div key={i} className="grid gap-0.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Placeholder for a detail page while it loads. */
export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

/** Totals block: right-aligned label/amount rows; `strong` rows are emphasised. */
export function TotalsList({ rows }: { rows: { label: ReactNode; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="ml-auto grid w-full max-w-xs gap-1.5 text-sm">
      {rows.map((r, i) => (
        <div key={i} className={cn("flex justify-between gap-4", r.strong && "mt-1 border-t pt-2 font-semibold text-foreground")}>
          <dt className={r.strong ? undefined : "text-muted-foreground"}>{r.label}</dt>
          <dd className="tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Simple static table for detail sections (lines, allocations); scrolls sideways on phones. */
export function SimpleTable({
  head,
  rows,
  empty = "None",
}: {
  head: { label: ReactNode; align?: "right" }[];
  rows: { key: string | number; cells: ReactNode[] }[];
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b bg-surface">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn("px-3 py-2.5 font-semibold whitespace-nowrap first:rounded-l-lg last:rounded-r-lg", h.align === "right" ? "text-right" : "text-left")}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/70 align-top last:border-0">
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={cn("px-3 py-3", head[i]?.align === "right" && "text-right tabular-nums whitespace-nowrap")}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
