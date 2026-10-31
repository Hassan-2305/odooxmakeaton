import { PAYMENT_METHODS, type Payment } from "@brightloop/shared";
import { PlusIcon, WalletIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CustomerSelect } from "@/components/customer-select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ClearFilters, DateFilter, FilterSelect } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Tabs } from "@/components/tabs";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { useListQuery, useListState } from "@/lib/list";
import { AllocatePaymentDialog, RecordPaymentDialog } from "./payment-dialogs";

const methodLabel = (m: string) => (m === "upi" ? "UPI" : humanize(m));

/** Payments received; the Unallocated tab is the `unallocated=true` filter. */
export function PaymentsPage() {
  const list = useListState({ sort: "-paidOn" });
  const query = useListQuery<Payment>("payments", "/api/payments", list);
  const [recording, setRecording] = useState(false);
  const [allocating, setAllocating] = useState<Payment | null>(null);
  const { customerId, method, from, to, unallocated } = list.filters;
  const tab = unallocated === "true" ? "unallocated" : "all";

  const columns: DataTableColumn<Payment>[] = [
    { id: "paidOn", header: "Paid on", sortField: "paidOn", className: "whitespace-nowrap", cell: (p) => formatDate(p.paidOn) },
    {
      id: "customer",
      header: "Customer",
      cell: (p) => (
        <Link to={`/customers/${p.customerId}`} className="font-medium hover:underline">
          {p.customerName}
        </Link>
      ),
    },
    { id: "method", header: "Method", cell: (p) => methodLabel(p.method) },
    { id: "reference", header: "Reference", cell: (p) => <span className="font-mono text-xs">{p.reference ?? "—"}</span> },
    {
      id: "amount",
      header: "Amount",
      sortField: "amountPaise",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      cell: (p) => formatMoney(p.amountPaise),
    },
    {
      id: "allocated",
      header: "Allocated",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      cell: (p) => formatMoney(p.allocatedPaise),
    },
    {
      id: "unallocated",
      header: "Unallocated",
      align: "right",
      className: "whitespace-nowrap",
      cell: (p) =>
        p.unallocatedPaise > 0 ? (
          <StatusBadge status="due_soon" label={formatMoney(p.unallocatedPaise)} />
        ) : (
          <span className="text-muted-foreground tabular-nums">{formatMoney(0)}</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cardLabel: "Actions",
      align: "right",
      cell: (p) =>
        p.unallocatedPaise > 0 ? (
          <Button size="xs" variant="outline" onClick={() => setAllocating(p)}>
            Allocate
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received and how it's applied to invoices."
        actions={
          <Button onClick={() => setRecording(true)}>
            <PlusIcon /> Record payment
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => list.setFilter("unallocated", t === "unallocated" ? "true" : undefined)}
        tabs={[
          { value: "all", label: "All payments" },
          { value: "unallocated", label: "Unallocated" },
        ]}
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(p) => p.id}
        filters={
          <>
            <CustomerSelect className="self-end" value={customerId} onChange={(id) => list.setFilter("customerId", id)} />
            <FilterSelect
              className="self-end"
              label="Methods"
              value={method}
              options={PAYMENT_METHODS}
              format={methodLabel}
              onChange={(v) => list.setFilter("method", v)}
            />
            <DateFilter label="Paid from" value={from} max={to} onChange={(v) => list.setFilter("from", v)} />
            <DateFilter label="Paid to" value={to} min={from} onChange={(v) => list.setFilter("to", v)} />
            <div className="self-end">
              <ClearFilters list={list} keep={["unallocated"]} />
            </div>
          </>
        }
        empty={
          tab === "unallocated" ? (
            <EmptyState icon={WalletIcon} title="Nothing unallocated" description="Every payment is fully applied to invoices." />
          ) : (
            <EmptyState
              icon={WalletIcon}
              title={Object.keys(list.filters).length ? "No matching payments" : "No payments yet"}
              action={
                <Button size="sm" variant="outline" onClick={() => setRecording(true)}>
                  Record payment
                </Button>
              }
            />
          )
        }
      />
      <RecordPaymentDialog open={recording} onOpenChange={setRecording} />
      <AllocatePaymentDialog payment={allocating} onOpenChange={(o) => !o && setAllocating(null)} />
    </>
  );
}
