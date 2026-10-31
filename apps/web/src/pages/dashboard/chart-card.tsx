import type { UseQueryResult } from "@tanstack/react-query";
import { BarChart3Icon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { GlossaryTip } from "@/components/glossary-tip";
import { cn } from "@/lib/utils";

interface ChartCardProps<T> {
  title: string;
  glossary: ReactNode;
  query: Pick<UseQueryResult<T>, "data" | "isPending" | "isError" | "error" | "refetch">;
  /** True when the loaded data has nothing to plot. */
  isEmpty: (data: T) => boolean;
  emptyText: string;
  aside?: (data: T) => ReactNode;
  children: (data: T) => ReactNode;
  className?: string;
}

/** Card wrapper giving every chart the same loading, error and empty states. */
export function ChartCard<T>({ title, glossary, query, isEmpty, emptyText, aside, children, className }: ChartCardProps<T>) {
  const { data, isPending, isError, error, refetch } = query;
  return (
    <section className={cn("flex flex-col rounded-lg border bg-card p-4", className)} aria-label={title}>
      <header className="mb-3 flex items-center gap-1.5">
        <h2 className="text-sm font-medium">{title}</h2>
        <GlossaryTip term={title}>{glossary}</GlossaryTip>
        {data !== undefined && aside && <div className="ml-auto text-xs text-muted-foreground">{aside(data)}</div>}
      </header>
      <div className="h-64">
        {isPending ? (
          <div className="h-full animate-pulse rounded-md bg-muted" role="status" aria-label={`Loading ${title}`} />
        ) : isError ? (
          <ErrorState className="h-full py-4" error={error} onRetry={() => void refetch()} />
        ) : data === undefined || isEmpty(data) ? (
          <EmptyState className="h-full py-4" icon={BarChart3Icon} title="No data" description={emptyText} />
        ) : (
          children(data)
        )}
      </div>
    </section>
  );
}
