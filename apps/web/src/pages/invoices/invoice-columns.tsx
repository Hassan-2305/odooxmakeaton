import type { MouseEvent } from "react";
import type { Invoice } from "@brightloop/shared";
import { Link } from "react-router";
import type { DataTableColumn } from "@/components/data-table";
import { formatDate, formatMoney } from "@/lib/format";
import { InvoiceStatusBadge } from "./invoice-status-badge";

const stop = (e: MouseEvent) => e.stopPropagation();

/** Invoice list columns; `customer: false` drops the customer column (e.g. on a customer's page). */
export function invoiceColumns({ customer = true } = {}): DataTableColumn<Invoice>[] {
  const cols: (DataTableColumn<Invoice> | false)[] = [
    {
      id: "number",
      header: "Invoice",
      sortField: "number",
      cell: (i) => (
        <Link to={`/invoices/${i.id}`} onClick={stop} className="font-medium hover:underline">
          {i.number ?? "Draft"}
        </Link>
      ),
    },
    customer && {
      id: "customer",
      header: "Customer",
      cell: (i) => (
        <Link to={`/customers/${i.customerId}`} onClick={stop} className="hover:underline">
          {i.customerName}
        </Link>
      ),
    },
    {
      id: "period",
      header: "Period",
      className: "whitespace-nowrap text-muted-foreground",
      cell: (i) => `${formatDate(i.periodStart)} – ${formatDate(i.periodEnd)}`,
    },
    { id: "issueDate", header: "Issued", sortField: "issueDate", className: "whitespace-nowrap", cell: (i) => formatDate(i.issueDate) },
    { id: "dueDate", header: "Due", sortField: "dueDate", className: "whitespace-nowrap", cell: (i) => formatDate(i.dueDate) },
    {
      id: "total",
      header: "Total",
      sortField: "totalPaise",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      cell: (i) => formatMoney(i.totalPaise),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      cell: (i) =>
        i.status === "cancelled" ? "—" : <span className={i.balancePaise > 0 ? "font-medium" : undefined}>{formatMoney(i.balancePaise)}</span>,
    },
    { id: "status", header: "Status", cell: (i) => <InvoiceStatusBadge invoice={i} /> },
  ];
  return cols.filter((c): c is DataTableColumn<Invoice> => c !== false);
}
