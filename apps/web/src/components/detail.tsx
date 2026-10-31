import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-4" aria-hidden /> {children}
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
    <section className={cn("rounded-lg border bg-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          {title && <h2 className="font-medium">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
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
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-56 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

/** Totals block: right-aligned label/amount rows; `strong` rows are emphasised. */
export function TotalsList({ rows }: { rows: { label: ReactNode; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="ml-auto grid w-full max-w-xs gap-1.5 text-sm">
      {rows.map((r, i) => (
        <div key={i} className={cn("flex justify-between gap-4", r.strong && "border-t pt-1.5 font-semibold")}>
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
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn("py-2 pr-3 font-medium whitespace-nowrap", h.align === "right" ? "text-right" : "text-left")}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b align-top last:border-0">
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={cn("py-2 pr-3", head[i]?.align === "right" && "text-right tabular-nums whitespace-nowrap")}
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
