import type { MouseEvent } from "react";
import type { Subscription } from "@brightloop/shared";
import { Link } from "react-router";
import type { DataTableColumn } from "@/components/data-table";
import { SubscriptionStatusBadge } from "./subscription-status-badge";
import { formatDate, formatMoney } from "@/lib/format";

const stop = (e: MouseEvent) => e.stopPropagation();

/** Subscription list columns; `customer: false` drops the customer column. */
export function subscriptionColumns({ customer = true } = {}): DataTableColumn<Subscription>[] {
  const cols: (DataTableColumn<Subscription> | false)[] = [
    {
      id: "number",
      header: "Subscription",
      sortField: "number",
      cell: (s) => (
        <Link to={`/subscriptions/${s.id}`} onClick={stop} className="font-medium hover:underline">
          {s.number}
        </Link>
      ),
    },
    customer && {
      id: "customer",
      header: "Customer",
      cell: (s) => (
        <Link to={`/customers/${s.customerId}`} onClick={stop} className="hover:underline">
          {s.customerName}
        </Link>
      ),
    },
    { id: "plan", header: "Plan", cell: (s) => s.planName },
    { id: "status", header: "Status", cell: (s) => <SubscriptionStatusBadge status={s.status} /> },
    { id: "startDate", header: "Start", sortField: "startDate", className: "whitespace-nowrap", cell: (s) => formatDate(s.startDate) },
    { id: "expiryDate", header: "Expires", sortField: "expiryDate", className: "whitespace-nowrap", cell: (s) => formatDate(s.expiryDate) },
    {
      id: "nextInvoiceDate",
      header: "Next invoice",
      sortField: "nextInvoiceDate",
      className: "whitespace-nowrap",
      cell: (s) => formatDate(s.nextInvoiceDate),
    },
    {
      id: "amount",
      header: "Recurring",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      cell: (s) => formatMoney(s.recurringAmountPaise),
    },
  ];
  return cols.filter((c): c is DataTableColumn<Subscription> => c !== false);
}
