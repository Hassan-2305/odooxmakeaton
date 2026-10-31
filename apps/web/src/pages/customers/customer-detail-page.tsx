import type { Customer, Invoice, ReportSummary, Subscription } from "@brightloop/shared";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon, ReceiptIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { BackLink, DetailCard, DetailList, DetailSkeleton } from "@/components/detail";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { useListQuery, useLocalListState } from "@/lib/list";
import { useApiMutation, useRecord } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { invoiceColumns } from "@/pages/invoices/invoice-columns";
import { subscriptionColumns } from "@/pages/subscriptions/subscription-columns";
import { CustomerFormDialog } from "./customer-form-dialog";

const subCols = subscriptionColumns({ customer: false });
const invCols = invoiceColumns({ customer: false });

function Balance({ customerId }: { customerId: string }) {
  // Outstanding and overdue are "as of today" in the summary, whatever the date range.
  const summary = useQuery({
    queryKey: ["reports", "summary", { customerId }],
    queryFn: ({ signal }) => api<ReportSummary>("/api/reports/summary", { params: { customer_id: customerId }, signal }),
  });
  const s = summary.data;
  const tile = (label: string, value: string | undefined, sub?: string, warn?: boolean) => (
    <div className="card-surface relative overflow-hidden p-5">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-400 to-orange-600 opacity-70" aria-hidden />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      {summary.isPending ? (
        <div className="mt-2 h-7 w-28 animate-pulse rounded bg-muted" />
      ) : (
        <p className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${warn ? "text-status-overdue" : ""}`}>{value ?? "—"}</p>
      )}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tile("Outstanding balance", s && formatMoney(s.outstandingPaise), "Confirmed, unpaid")}
      {tile(
        "Overdue",
        s && formatMoney(s.overdue.amountPaise),
        s && `${formatCount(s.overdue.count)} invoice${s.overdue.count === 1 ? "" : "s"}`,
        !!s && s.overdue.count > 0,
      )}
      {tile("Active subscriptions", s && formatCount(s.activeSubscriptions), s && `MRR ${formatMoney(s.mrrPaise)}`)}
    </div>
  );
}

/** One customer: contact details, balance, their subscriptions and invoices. */
export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const customer = useRecord<Customer>("customers", `/api/customers/${id}`, "customer");
  const subList = useLocalListState({ sort: "-createdAt" });
  const invList = useLocalListState({ sort: "-createdAt" });
  const subs = useListQuery<Subscription>("subscriptions", "/api/subscriptions", {
    ...subList,
    filters: { ...subList.filters, customerId: id },
  });
  const invoices = useListQuery<Invoice>("invoices", "/api/invoices", {
    ...invList,
    filters: { ...invList.filters, customerId: id },
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useApiMutation(() => api(`/api/customers/${id}`, { method: "DELETE" }), ["customers", "reports"]);

  if (customer.isPending) return <DetailSkeleton />;
  if (customer.isError)
    return (
      <>
        <BackLink to="/customers">Customers</BackLink>
        <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />
      </>
    );

  const c = customer.data;
  const address = [c.addressLine1, c.addressLine2, [c.city, c.state, c.postalCode].filter(Boolean).join(", "), c.country]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <BackLink to="/customers">Customers</BackLink>
      <PageHeader
        title={c.name}
        description={c.email}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
            <Button variant="outline" onClick={() => setDeleting(true)}>
              <Trash2Icon /> Delete
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <Balance customerId={id} />
        <DetailCard title="Details">
          <DetailList
            items={[
              ["Email", c.email],
              ["Phone", c.phone],
              ["GSTIN", c.gstin && <span className="font-mono">{c.gstin}</span>],
              ["Address", address && <span className="whitespace-pre-line">{address}</span>],
              ["Customer since", formatDate(c.createdAt)],
            ]}
          />
        </DetailCard>
        <DetailCard title="Subscriptions" bodyClassName="p-0">
          <DataTable
            className="[&>div]:rounded-none [&>div]:border-0"
            columns={subCols}
            query={subs}
            list={subList}
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/subscriptions/${s.id}`)}
            empty={<EmptyState icon={RepeatIcon} title="No subscriptions" description="Create one from a quotation template." />}
          />
        </DetailCard>
        <DetailCard title="Invoices" bodyClassName="p-0">
          <DataTable
            className="[&>div]:rounded-none [&>div]:border-0"
            columns={invCols}
            query={invoices}
            list={invList}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/invoices/${i.id}`)}
            empty={<EmptyState icon={ReceiptIcon} title="No invoices yet" />}
          />
        </DetailCard>
      </div>
      <CustomerFormDialog open={editing} onOpenChange={setEditing} customer={c} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        destructive
        title={`Delete ${c.name}?`}
        description="This removes the customer record. Customers with subscriptions, invoices or payments can't be deleted."
        confirmLabel="Delete customer"
        onConfirm={async () => {
          await remove.mutateAsync(undefined);
          toast.success("Customer deleted", c.name);
          navigate("/customers");
        }}
      />
    </>
  );
}
