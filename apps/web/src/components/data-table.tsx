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
  /** Label in the mobile card when `header` isn't plain text. */
  cardLabel?: string;
  /** Leave this column out of the mobile card (e.g. it is already the card title). */
  hideOnCard?: boolean;
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
  /** Card heading under 640px; defaults to the first column's cell. */
  cardTitle?: (row: T) => ReactNode;
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
  cardTitle,
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

  const emptyNode = empty ?? <EmptyState title="Nothing here yet" description="Try changing the filters." />;
  const [firstCol, ...restCols] = columns;
  const titleOf = cardTitle ?? ((row: T) => firstCol?.cell(row));
  const cardCols = (cardTitle ? columns : restCols).filter((c) => !c.hideOnCard);

  return (
    <div className={cn("space-y-3", className)}>
      {filters && <div className="glass-surface flex flex-wrap items-end gap-2 p-3 [&>*]:max-sm:w-full">{filters}</div>}

      <div className="card-surface overflow-hidden">
        {/* Under 640px each row becomes a card. */}
        <div className={cn("sm:hidden", isFetching && isPlaceholderData && "opacity-60")}>
          {isPending ? (
            <ul className="divide-y">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="space-y-2 p-3">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                </li>
              ))}
            </ul>
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : rows.length === 0 ? (
            emptyNode
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn("space-y-2 p-3", onRowClick && "cursor-pointer active:bg-surface/60")}
                >
                  <div className="font-medium">{titleOf(row)}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {cardCols.map((col) => (
                      <div key={col.id} className="contents">
                        <dt className="text-muted-foreground">
                          {col.cardLabel ?? (typeof col.header === "string" ? col.header : col.id)}
                        </dt>
                        <dd className="min-w-0 text-right break-words">{col.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className={cn("w-full text-sm", isFetching && isPlaceholderData && "opacity-60")}>
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr className="border-b">
                {columns.map((col) => {
                  const sorted = col.sortField && current?.field === col.sortField ? current.dir : null;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn("h-11 px-4 font-semibold whitespace-nowrap", alignClass(col.align), col.className)}
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
                      <td key={col.id} className="px-4 py-3.5">
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
                  <td colSpan={columns.length}>{emptyNode}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-border/70 transition-colors last:border-0 hover:bg-orange-50/40",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.id} className={cn("px-4 py-3", alignClass(col.align), col.className)}>
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t bg-white px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
                className="h-8 rounded-lg border border-input bg-white px-2 text-foreground"
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
