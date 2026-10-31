import { INVOICE_STATUSES, type Invoice } from "@brightloop/shared";
import { ReceiptIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { CheckField } from "@/components/check-field";
import { CustomerSelect } from "@/components/customer-select";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ClearFilters, DateFilter, FilterSelect } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { useListQuery, useListState } from "@/lib/list";
import { invoiceColumns } from "./invoice-columns";

const columns = invoiceColumns();

/** Invoices with status, customer, issue-date range and overdue filters, all in the query string. */
export function InvoicesPage() {
  const list = useListState({ sort: "-createdAt" });
  const query = useListQuery<Invoice>("invoices", "/api/invoices", list);
  const navigate = useNavigate();
  const { status, customerId, from, to, overdue } = list.filters;
  const filtered = Object.keys(list.filters).length > 0;

  return (
    <>
      <PageHeader title="Invoices" description="Every invoice raised by billing runs, with what's paid and what's left." />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(i) => i.id}
        onRowClick={(i) => navigate(`/invoices/${i.id}`)}
        filters={
          <>
            <FilterSelect
              label="Statuses"
              value={status}
              options={INVOICE_STATUSES}
              onChange={(v) => list.setFilter("status", v)}
              className="self-end"
            />
            <CustomerSelect className="self-end" value={customerId} onChange={(id) => list.setFilter("customerId", id)} />
            <DateFilter label="Issued from" value={from} max={to} onChange={(v) => list.setFilter("from", v)} />
            <DateFilter label="Issued to" value={to} min={from} onChange={(v) => list.setFilter("to", v)} />
            <CheckField
              className="h-9 items-center self-end"
              label="Overdue only"
              checked={overdue === "true"}
              onChange={(e) => list.setFilter("overdue", e.target.checked ? "true" : undefined)}
            />
            <div className="self-end">
              <ClearFilters list={list} />
            </div>
          </>
        }
        empty={
          filtered ? (
            <EmptyState title="No matching invoices" description="Try changing or clearing the filters." />
          ) : (
            <EmptyState icon={ReceiptIcon} title="No invoices yet" description="Run billing to raise invoices for active subscriptions." />
          )
        }
      />
    </>
  );
}
