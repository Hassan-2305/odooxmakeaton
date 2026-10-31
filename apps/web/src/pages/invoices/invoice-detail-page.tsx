import type { InvoiceDetail, InvoiceLine } from "@brightloop/shared";
import { CheckIcon, DownloadIcon, FileMinusIcon, MailIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BackLink, DetailCard, DetailList, DetailSkeleton, SimpleTable, TotalsList } from "@/components/detail";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { useIsAdmin } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, humanize } from "@/lib/format";
import { downloadBackOfficePdf } from "@/lib/invoices";
import { formatBps } from "@/lib/money-input";
import { useApiMutation, useRecord } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { CancelInvoiceDialog, CreditNoteDialog, SendInvoiceDialog } from "./invoice-action-dialogs";
import { InvoiceStatusBadge } from "./invoice-status-badge";

type Dialog = "confirm" | "cancel" | "send" | "credit" | null;

function taxText(l: InvoiceLine) {
  if (l.taxes.length === 0) return "—";
  return l.taxes.map((t) => `${t.name} ${formatBps(t.rateBps)}${t.inclusive ? " incl." : ""}: ${formatMoney(t.taxAmountPaise)}`).join(", ");
}

function Snapshot({ snap }: { snap: Record<string, unknown> }) {
  const s = (k: string) => (typeof snap[k] === "string" && snap[k] ? (snap[k] as string) : null);
  const address = [s("addressLine1"), s("addressLine2"), [s("city"), s("state"), s("postalCode")].filter(Boolean).join(", "), s("country")]
    .filter(Boolean)
    .join("\n");
  return (
    <DetailList
      className="sm:grid-cols-1"
      items={[
        ["Name", s("name")],
        ["Email", s("email")],
        ["GSTIN", s("gstin") && <span className="font-mono">{s("gstin")}</span>],
        ["Address", address && <span className="whitespace-pre-line">{address}</span>],
      ]}
    />
  );
}

/** One invoice: customer snapshot, lines with per-line taxes, totals, allocations and actions. */
export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const isAdmin = useIsAdmin();
  const invoice = useRecord<InvoiceDetail>("invoices", `/api/invoices/${id}`, "invoice");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [downloading, setDownloading] = useState(false);
  const confirm = useApiMutation(() => api(`/api/invoices/${id}/confirm`, { method: "POST" }), ["invoices", "reports", "findings"]);

  if (invoice.isPending) return <DetailSkeleton />;
  if (invoice.isError)
    return (
      <>
        <BackLink to="/invoices">Invoices</BackLink>
        <ErrorState error={invoice.error} onRetry={() => void invoice.refetch()} />
      </>
    );

  const inv = invoice.data;
  const products = inv.lines.filter((l) => l.kind === "product");
  const discounts = inv.lines.filter((l) => l.kind === "discount");
  const close = (open: boolean) => !open && setDialog(null);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadBackOfficePdf(inv);
      toast.success("Invoice downloaded", inv.number ?? undefined);
    } catch (error) {
      toast.error("Couldn't download the PDF", errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const canCancel = (inv.status === "draft" || inv.status === "confirmed") && inv.amountPaidPaise === 0 && inv.creditedPaise === 0;
  const canCredit = isAdmin && inv.status === "confirmed" && inv.balancePaise > 0;

  return (
    <>
      <BackLink to="/invoices">Invoices</BackLink>
      <PageHeader
        title={inv.number ?? "Draft invoice"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge invoice={inv} />
            <Link to={`/customers/${inv.customerId}`} className="hover:underline">
              {inv.customerName}
            </Link>
            {inv.subscriptionId && (
              <Link to={`/subscriptions/${inv.subscriptionId}`} className="hover:underline">
                · View subscription
              </Link>
            )}
          </span>
        }
        actions={
          <>
            {inv.status === "draft" && (
              <Button onClick={() => setDialog("confirm")}>
                <CheckIcon /> Confirm
              </Button>
            )}
            {inv.status === "confirmed" && (
              <Button variant="outline" onClick={() => setDialog("send")}>
                <MailIcon /> Send
              </Button>
            )}
            <Button variant="outline" onClick={() => void download()} disabled={downloading || inv.number === null} title={inv.number === null ? "Confirm the invoice to get a PDF" : undefined}>
              <DownloadIcon className={downloading ? "animate-bounce" : undefined} /> PDF
            </Button>
            {canCredit && (
              <Button variant="outline" onClick={() => setDialog("credit")}>
                <FileMinusIcon /> Credit note
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" onClick={() => setDialog("cancel")}>
                <XIcon /> Cancel
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DetailCard title="Lines">
            <SimpleTable
              head={[
                { label: "Item" },
                { label: "Qty", align: "right" },
                { label: "Unit price", align: "right" },
                { label: "Taxes" },
                { label: "Amount", align: "right" },
              ]}
              rows={products.map((l) => ({
                key: l.id,
                cells: [l.description, l.quantity, formatMoney(l.unitPricePaise), <span className="text-muted-foreground">{taxText(l)}</span>, formatMoney(l.amountPaise)],
              }))}
            />
            {discounts.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-sm font-medium">Discounts</h3>
                <SimpleTable
                  head={[{ label: "Discount" }, { label: "Taxes" }, { label: "Amount", align: "right" }]}
                  rows={discounts.map((l) => ({
                    key: l.id,
                    cells: [l.description, <span className="text-muted-foreground">{taxText(l)}</span>, `−${formatMoney(l.amountPaise)}`],
                  }))}
                />
              </>
            )}
            <div className="mt-5">
              <TotalsList
                rows={[
                  { label: "Subtotal", value: formatMoney(inv.subtotalPaise) },
                  { label: "Discount", value: inv.discountTotalPaise ? `−${formatMoney(inv.discountTotalPaise)}` : formatMoney(0) },
                  { label: "Tax", value: formatMoney(inv.taxTotalPaise) },
                  { label: "Total", value: formatMoney(inv.totalPaise), strong: true },
                  ...(inv.creditedPaise ? [{ label: "Credited", value: `−${formatMoney(inv.creditedPaise)}` }] : []),
                  { label: "Amount paid", value: `−${formatMoney(inv.amountPaidPaise)}` },
                  { label: "Balance", value: formatMoney(inv.status === "cancelled" ? 0 : inv.balancePaise), strong: true },
                ]}
              />
            </div>
          </DetailCard>

          <DetailCard title="Payments allocated">
            <SimpleTable
              empty="No payments allocated yet."
              head={[{ label: "Paid on" }, { label: "Method" }, { label: "Reference" }, { label: "Amount", align: "right" }]}
              rows={inv.allocations.map((a) => ({
                key: a.id,
                cells: [formatDate(a.paidOn), humanize(a.method), a.reference ?? "—", formatMoney(a.amountPaise)],
              }))}
            />
          </DetailCard>

          {inv.creditNotes.length > 0 && (
            <DetailCard title="Credit notes">
              <SimpleTable
                head={[{ label: "Number" }, { label: "Issued" }, { label: "Reason" }, { label: "Status" }, { label: "Amount", align: "right" }]}
                rows={inv.creditNotes.map((c) => ({
                  key: c.id,
                  cells: [c.number ?? "Draft", formatDate(c.issueDate), c.reason, <StatusBadge status={c.status} />, formatMoney(c.totalPaise)],
                }))}
              />
            </DetailCard>
          )}
        </div>

        <div className="space-y-4">
          <DetailCard title="Billed to">
            <Snapshot snap={inv.customerSnapshot} />
          </DetailCard>
          <DetailCard title="Dates">
            <DetailList
              className="sm:grid-cols-1"
              items={[
                ["Period", `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`],
                ["Issued", formatDate(inv.issueDate)],
                ["Due", formatDate(inv.dueDate)],
                ...(inv.confirmedAt ? ([["Confirmed", formatDateTime(inv.confirmedAt)]] as [string, string][]) : []),
                ...(inv.cancelledAt ? ([["Cancelled", formatDateTime(inv.cancelledAt)]] as [string, string][]) : []),
                ...(inv.billingRunId
                  ? ([["Billing run", <Link to={`/billing-runs/${inv.billingRunId}`} className="hover:underline">View run</Link>]] as [string, ReactNode][])
                  : []),
              ]}
            />
          </DetailCard>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "confirm"}
        onOpenChange={close}
        title="Confirm this invoice?"
        description="It gets a number and becomes final. Changes after this need a credit note."
        confirmLabel="Confirm invoice"
        onConfirm={async () => {
          await confirm.mutateAsync(undefined);
          toast.success("Invoice confirmed");
        }}
      />
      <CancelInvoiceDialog invoice={inv} open={dialog === "cancel"} onOpenChange={close} />
      <SendInvoiceDialog invoice={inv} open={dialog === "send"} onOpenChange={close} />
      {isAdmin && <CreditNoteDialog invoice={inv} open={dialog === "credit"} onOpenChange={close} />}
    </>
  );
}
