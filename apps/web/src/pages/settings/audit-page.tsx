import type { AuditLogEntry } from "@brightloop/shared";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListQuery, useListState } from "@/lib/list";

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

const columns: DataTableColumn<AuditLogEntry>[] = [
  {
    id: "createdAt",
    header: "When",
    sortField: "createdAt",
    className: "whitespace-nowrap",
    cell: (row) => dateTime.format(new Date(row.createdAt)),
  },
  {
    id: "actor",
    header: "Who",
    cell: (row) => row.actor?.name ?? <span className="text-muted-foreground">System</span>,
  },
  { id: "action", header: "Action", sortField: "action", cell: (row) => <code className="text-xs">{row.action}</code> },
  { id: "entityType", header: "Entity", sortField: "entityType", cell: (row) => row.entityType },
  {
    id: "entityId",
    header: "Entity ID",
    cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.entityId.slice(0, 8)}</span>,
  },
];

/** Admin audit trail: the first screen built on DataTable (GET /api/audit). */
export function AuditPage() {
  const list = useListState({ sort: "-createdAt" });
  const query = useListQuery<AuditLogEntry>("audit", "/api/audit", list);

  return (
    <>
      <PageHeader title="Audit log" description="Every change to invoices, payments, credit notes, discounts and staff." />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(row) => row.id}
        filters={
          <>
            <Input
              key={list.filters.action ?? ""}
              className="w-56"
              placeholder="Action, e.g. invoice."
              aria-label="Filter by action"
              defaultValue={list.filters.action ?? ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") list.setFilter("action", e.currentTarget.value.trim() || undefined);
              }}
              onBlur={(e) => list.setFilter("action", e.currentTarget.value.trim() || undefined)}
            />
            <Input
              type="date"
              className="w-40"
              aria-label="From date"
              value={list.filters.from ?? ""}
              onChange={(e) => list.setFilter("from", e.target.value || undefined)}
            />
            <Input
              type="date"
              className="w-40"
              aria-label="To date"
              value={list.filters.to ?? ""}
              onChange={(e) => list.setFilter("to", e.target.value || undefined)}
            />
            {Object.keys(list.filters).length > 0 && (
              <Button variant="ghost" size="sm" onClick={list.clearFilters}>
                Clear filters
              </Button>
            )}
          </>
        }
      />
    </>
  );
}
