import type { Customer } from "@brightloop/shared";
import { PlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ClearFilters, SearchFilter } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useListQuery, useListState } from "@/lib/list";
import { CustomerFormDialog } from "./customer-form-dialog";

const columns: DataTableColumn<Customer>[] = [
  {
    id: "name",
    header: "Name",
    sortField: "name",
    cell: (c) => (
      <Link to={`/customers/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
        {c.name}
      </Link>
    ),
  },
  { id: "email", header: "Email", sortField: "email", cell: (c) => c.email },
  { id: "phone", header: "Phone", cell: (c) => c.phone ?? "—" },
  { id: "gstin", header: "GSTIN", cell: (c) => <span className="font-mono text-xs">{c.gstin ?? "—"}</span> },
  { id: "city", header: "City", sortField: "city", cell: (c) => [c.city, c.state].filter(Boolean).join(", ") || "—" },
  { id: "createdAt", header: "Added", sortField: "createdAt", className: "whitespace-nowrap", cell: (c) => formatDate(c.createdAt) },
];

export function CustomersPage() {
  const list = useListState({ sort: "name" });
  const query = useListQuery<Customer>("customers", "/api/customers", list);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const filtered = Object.keys(list.filters).length > 0;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you bill: contact details, GSTIN and billing address."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> New customer
          </Button>
        }
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        filters={
          <>
            <SearchFilter list={list} placeholder="Search name, email, phone or GSTIN" className="w-80" />
            <ClearFilters list={list} />
          </>
        }
        empty={
          filtered ? (
            <EmptyState title="No matching customers" description="Try a different search." />
          ) : (
            <EmptyState
              icon={UsersIcon}
              title="No customers yet"
              description="Add your first customer to start quoting and billing."
              action={
                <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                  New customer
                </Button>
              }
            />
          )
        }
      />
      <CustomerFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(c) => navigate(`/customers/${c.id}`)}
      />
    </>
  );
}
