import type { ListResponse } from "@brightloop/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE_OPTIONS, type ListStateApi } from "@/lib/list";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** API sort field; makes the header clickable. */
  sortField?: string;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  query: UseQueryResult<ListResponse<T>>;
  list: ListStateApi;
  rowKey: (row: T) => string | number;
  /** Filter controls rendered above the table. */
  filters?: ReactNode;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

const nf = new Intl.NumberFormat("en-IN");

/** "-createdAt" → { field: "createdAt", dir: "desc" }. Only the first sort key is shown. */
function parseSort(sort?: string) {
  const first = sort?.split(",")[0];
  if (!first) return null;
  return first.startsWith("-") ? { field: first.slice(1), dir: "desc" as const } : { field: first, dir: "asc" as const };
}

export function DataTable<T>({
  columns,
  query,
  list,
  rowKey,
  filters,
  empty,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = query;
  const current = parseSort(list.sort);
  const total = data?.total ?? 0;
  const rows = data?.data ?? [];
  const from = total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(total, (list.page - 1) * list.pageSize + rows.length);
  const lastPage = Math.max(1, Math.ceil(total / list.pageSize));

  // Click cycles ascending → descending → endpoint default.
  const toggleSort = (field: string) => {
    if (current?.field !== field) list.setSort(field);
    else if (current.dir === "asc") list.setSort(`-${field}`);
    else list.setSort(undefined);
  };

  const alignClass = (align?: DataTableColumn<T>["align"]) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <div className={cn("space-y-3", className)}>
      {filters && <div className="flex flex-wrap items-end gap-2">{filters}</div>}

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className={cn("w-full text-sm", isFetching && isPlaceholderData && "opacity-60")}>
            <thead className="bg-surface text-muted-foreground">
              <tr className="border-b">
                {columns.map((col) => {
                  const sorted = col.sortField && current?.field === col.sortField ? current.dir : null;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn("h-10 px-3 font-medium whitespace-nowrap", alignClass(col.align), col.className)}
                    >
                      {col.sortField ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.sortField!)}
                          className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {col.header}
                          {sorted === "asc" ? (
                            <ArrowUpIcon className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon className="size-3.5" />
                          ) : (
                            <ArrowUpDownIcon className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns.map((col) => (
                      <td key={col.id} className="px-3 py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={columns.length}>
                    <ErrorState error={error} onRetry={() => void refetch()} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    {empty ?? <EmptyState title="Nothing here yet" description="Try changing the filters." />}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b transition-colors last:border-0 hover:bg-surface/60",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.id} className={cn("px-3 py-2.5", alignClass(col.align), col.className)}>
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t bg-surface px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite">
            {data ? (
              <>
                {nf.format(from)}–{nf.format(to)} of {nf.format(total)}
                <span className="mx-1.5">·</span>
                {nf.format(Math.round(data.tookMs))} ms
              </>
            ) : (
              " "
            )}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5">
              <span>Rows</span>
              <select
                value={list.pageSize}
                onChange={(e) => list.setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-foreground"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span>
              Page {list.page} of {lastPage}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={list.page <= 1}
                onClick={() => list.setPage(list.page - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                disabled={list.page >= lastPage}
                onClick={() => list.setPage(list.page + 1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
