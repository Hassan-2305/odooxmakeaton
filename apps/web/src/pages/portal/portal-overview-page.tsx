import { ArrowRightIcon, MessageSquarePlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useRequiredUser } from "@/lib/auth";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import {
  billingCycle,
  invoiceDisplay,
  isOverdue,
  usePortalInvoices,
  usePortalPayments,
  usePortalSubscriptions,
} from "@/lib/portal";
import { cn } from "@/lib/utils";
import { PdfButton } from "./portal-invoices-page";
import { RequestDialog } from "./request-dialog";

function Tile({ label, value, sub, loading, tone }: { label: string; value: ReactNode; sub?: ReactNode; loading: boolean; tone?: "warning" }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "warning" && "text-status-overdue")}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </div>
  );
}

function Panel({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card" aria-label={title}>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-medium">{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          View all <ArrowRightIcon className="size-3.5" />
        </Link>
      </header>
      {children}
    </section>
  );
}

const skeletonRows = (
  <div className="space-y-3 p-4" role="status" aria-label="Loading">
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="h-5 animate-pulse rounded bg-muted" />
    ))}
  </div>
);

export function PortalOverviewPage() {
  const user = useRequiredUser();
  const subscriptions = usePortalSubscriptions();
  const invoices = usePortalInvoices();
  const payments = usePortalPayments();
  const [requestOpen, setRequestOpen] = useState(false);

  const active = subscriptions.data?.filter((s) => s.status === "active") ?? [];
  const unpaid = invoices.data?.filter((i) => i.status === "confirmed" && i.balancePaise > 0) ?? [];
  const overdue = unpaid.filter((i) => isOverdue(i));
  const balance = unpaid.reduce((sum, i) => sum + i.balancePaise, 0);
  const overdueAmount = overdue.reduce((sum, i) => sum + i.balancePaise, 0);
  const nextDates = active.map((s) => s.nextInvoiceDate).filter((d): d is string => d !== null).sort();
  const recentInvoices = [...(invoices.data ?? [])]
    .sort((a, b) => (b.issueDate ?? "").localeCompare(a.issueDate ?? ""))
    .slice(0, 5);
  const recentPayments = [...(payments.data ?? [])].sort((a, b) => b.paidOn.localeCompare(a.paidOn)).slice(0, 5);

  const failed = [subscriptions, invoices, payments].find((q) => q.isError);
  if (failed) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} />
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="Couldn't load your account"
            error={failed.error}
            onRetry={() => {
              void subscriptions.refetch();
              void invoices.refetch();
              void payments.refetch();
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Your subscriptions, bills and payments in one place."
        actions={
          <Button variant="outline" onClick={() => setRequestOpen(true)}>
            <MessageSquarePlusIcon /> Request a change
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Amount due"
          value={formatMoney(balance)}
          sub={`${formatCount(unpaid.length)} unpaid invoice${unpaid.length === 1 ? "" : "s"}`}
          loading={invoices.isPending}
        />
        <Tile
          label="Overdue"
          value={formatMoney(overdueAmount)}
          sub={overdue.length ? `${formatCount(overdue.length)} past the due date` : "Nothing overdue"}
          loading={invoices.isPending}
          tone={overdue.length ? "warning" : undefined}
        />
        <Tile label="Active subscriptions" value={formatCount(active.length)} loading={subscriptions.isPending} />
        <Tile
          label="Next invoice"
          value={nextDates[0] ? formatDate(nextDates[0]) : "—"}
          sub={nextDates[0] ? "Earliest across your subscriptions" : "No upcoming invoices"}
          loading={subscriptions.isPending}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent invoices" to="/portal/invoices">
          {invoices.isPending ? (
            skeletonRows
          ) : recentInvoices.length === 0 ? (
            <EmptyState className="py-8" title="No invoices yet" />
          ) : (
            <ul className="divide-y">
              {recentInvoices.map((inv) => {
                const d = invoiceDisplay(inv);
                return (
                  <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{inv.number ?? "Draft"}</p>
                      <p className="text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</p>
                    </div>
                    <StatusBadge status={d.status} label={d.label} />
                    <span className="w-28 text-right tabular-nums">{formatMoney(inv.totalPaise)}</span>
                    <PdfButton invoice={inv} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Recent payments" to="/portal/payments">
          {payments.isPending ? (
            skeletonRows
          ) : recentPayments.length === 0 ? (
            <EmptyState className="py-8" title="No payments yet" />
          ) : (
            <ul className="divide-y">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{formatDate(p.paidOn)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.allocations.map((a) => a.invoiceNumber).filter(Boolean).join(", ") || "Not yet applied"}
                    </p>
                  </div>
                  <span className="tabular-nums">{formatMoney(p.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Active subscriptions" to="/portal/subscriptions">
          {subscriptions.isPending ? (
            skeletonRows
          ) : active.length === 0 ? (
            <EmptyState className="py-8" title="No active subscriptions" />
          ) : (
            <ul className="divide-y">
              {active.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.planName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.number} · next invoice {formatDate(s.nextInvoiceDate)}
                    </p>
                  </div>
                  <span className="text-right">
                    <span className="tabular-nums">{formatMoney(s.recurringAmountPaise)}</span>
                    <span className="block text-xs text-muted-foreground">{billingCycle(s)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </>
  );
}
