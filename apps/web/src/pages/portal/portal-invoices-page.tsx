import type { PortalInvoice } from "@brightloop/shared";
import { DownloadIcon, ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useClientListQuery, useListState } from "@/lib/list";
import { downloadInvoicePdf, invoiceDisplay, isOverdue, portalKeys, portalPaths } from "@/lib/portal";
import { toast } from "@/lib/toast";

/** Download button with its own pending state. */
export function PdfButton({ invoice }: { invoice: PortalInvoice }) {
  const [pending, setPending] = useState(false);
  const download = async () => {
    setPending(true);
    try {
      await downloadInvoicePdf(invoice);
      toast.success("Invoice downloaded", invoice.number ?? undefined);
    } catch (error) {
      toast.error("Couldn't download the PDF", errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void download()}
      disabled={pending || invoice.number === null}
      aria-label={`Download invoice ${invoice.number ?? ""} as PDF`}
    >
      <DownloadIcon className={pending ? "animate-bounce" : undefined} /> PDF
    </Button>
  );
}

const columns: DataTableColumn<PortalInvoice>[] = [
  {
    id: "number",
    header: "Invoice",
    sortField: "number",
    cell: (i) => <span className="font-medium">{i.number ?? "Draft"}</span>,
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
    sortField: "balancePaise",
    align: "right",
    className: "tabular-nums whitespace-nowrap",
    cell: (i) => (i.balancePaise > 0 ? <span className="font-medium">{formatMoney(i.balancePaise)}</span> : formatMoney(0)),
  },
  {
    id: "status",
    header: "Status",
    cell: (i) => {
      const d = invoiceDisplay(i);
      return <StatusBadge status={d.status} label={d.label} />;
    },
  },
  { id: "pdf", header: <span className="sr-only">Download</span>, align: "right", cell: (i) => <PdfButton invoice={i} /> },
];

const sortBy = {
  number: (i: PortalInvoice) => i.number,
  issueDate: (i: PortalInvoice) => i.issueDate,
  dueDate: (i: PortalInvoice) => i.dueDate,
  totalPaise: (i: PortalInvoice) => i.totalPaise,
  balancePaise: (i: PortalInvoice) => i.balancePaise,
};

const FILTERS: Record<string, { label: string; match: (i: PortalInvoice) => boolean }> = {
  unpaid: { label: "Unpaid", match: (i) => i.status === "confirmed" && i.balancePaise > 0 },
  overdue: { label: "Overdue", match: (i) => isOverdue(i) },
  paid: { label: "Paid", match: (i) => i.status === "paid" },
};

export function PortalInvoicesPage() {
  const list = useListState({ sort: "-issueDate", pageSize: 20 });
  const show = list.filters.show;
  const query = useClientListQuery<PortalInvoice>(portalKeys.invoices, portalPaths.invoices, list, {
    sortBy,
    filter: show && FILTERS[show] ? FILTERS[show].match : undefined,
  });

  return (
    <>
      <PageHeader title="Invoices" description="Your bills, what's been paid and what's still due." />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(i) => i.id}
        empty={
          show ? (
            <EmptyState title={`No ${FILTERS[show]?.label.toLowerCase() ?? ""} invoices`} description="Try showing all invoices." />
          ) : (
            <EmptyState icon={ReceiptIcon} title="No invoices yet" description="Invoices appear here once they're issued." />
          )
        }
        filters={
          <Select
            aria-label="Show"
            className="w-40"
            value={show ?? ""}
            onChange={(e) => list.setFilter("show", e.target.value || undefined)}
          >
            <option value="">All invoices</option>
            {Object.entries(FILTERS).map(([key, f]) => (
              <option key={key} value={key}>
                {f.label}
              </option>
            ))}
          </Select>
        }
      />
    </>
  );
}
