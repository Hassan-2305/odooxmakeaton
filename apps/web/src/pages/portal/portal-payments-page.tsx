import type { PortalPayment } from "@brightloop/shared";
import { WalletIcon } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { useClientListQuery, useListState } from "@/lib/list";
import { portalKeys, portalPaths } from "@/lib/portal";

const columns: DataTableColumn<PortalPayment>[] = [
  { id: "paidOn", header: "Date", sortField: "paidOn", className: "whitespace-nowrap", cell: (p) => formatDate(p.paidOn) },
  { id: "method", header: "Method", sortField: "method", cell: (p) => humanize(p.method) },
  {
    id: "reference",
    header: "Reference",
    cell: (p) => (p.reference ? <span className="font-mono text-xs">{p.reference}</span> : <span className="text-muted-foreground">—</span>),
  },
  {
    id: "appliedTo",
    header: "Applied to",
    cell: (p) =>
      p.allocations.length === 0 ? (
        <span className="text-muted-foreground">Not yet applied</span>
      ) : (
        <ul className="space-y-0.5">
          {p.allocations.map((a) => (
            <li key={a.invoiceId} className="text-sm">
              {a.invoiceNumber ?? "Invoice"} <span className="text-muted-foreground tabular-nums">· {formatMoney(a.amountPaise)}</span>
            </li>
          ))}
        </ul>
      ),
  },
  {
    id: "amount",
    header: "Amount",
    sortField: "amountPaise",
    align: "right",
    className: "tabular-nums whitespace-nowrap font-medium",
    cell: (p) => formatMoney(p.amountPaise),
  },
];

const sortBy = {
  paidOn: (p: PortalPayment) => p.paidOn,
  method: (p: PortalPayment) => p.method,
  amountPaise: (p: PortalPayment) => p.amountPaise,
};

export function PortalPaymentsPage() {
  const list = useListState({ sort: "-paidOn", pageSize: 20 });
  const query = useClientListQuery<PortalPayment>(portalKeys.payments, portalPaths.payments, list, { sortBy });

  return (
    <>
      <PageHeader title="Payments" description="Payments we've received from you and the invoices they paid." />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={WalletIcon} title="No payments yet" description="Payments appear here once we record them." />}
      />
    </>
  );
}
