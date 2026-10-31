import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  MessageSquarePlusIcon,
  RepeatIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
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

function Tile({
  label,
  value,
  sub,
  loading,
  tone,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  loading: boolean;
  tone?: "warning";
  icon: LucideIcon;
}) {
  return (
    <div className={cn("card-surface p-5", tone === "warning" && "border-red-100 bg-gradient-to-br from-red-50/70 to-white")}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-xl ring-1",
            tone === "warning" ? "bg-red-50 text-red-600 ring-red-100" : "bg-orange-50 text-orange-600 ring-orange-100",
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <>
          <p className={cn("mt-3 text-2xl font-bold tracking-tight tabular-nums", tone === "warning" && "text-status-overdue")}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </div>
  );
}

function Panel({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  return (
    <section className="card-surface" aria-label={title}>
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
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
        <div className="card-surface">
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
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#131d36] via-[#1c2747] to-[#3a2a2f] px-6 py-8 text-white shadow-card sm:px-8">
        <div className="pointer-events-none absolute -top-24 right-10 size-72 rounded-full bg-orange-500/30 blur-3xl" />
        <svg
          className="pointer-events-none absolute right-0 bottom-0 h-32 w-[32rem] max-w-full text-white/10"
          viewBox="0 0 512 128"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0 128 L90 60 L150 95 L240 20 L330 85 L400 45 L512 100 L512 128 Z" fill="currentColor" />
        </svg>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[1.7rem] leading-tight font-bold">Welcome back, {user.name.split(" ")[0]}</h1>
            <p className="mt-1 text-sm text-slate-300">Your subscriptions, bills and payments in one place.</p>
          </div>
          <Button variant="outline" className="border-white/20 bg-white text-foreground" onClick={() => setRequestOpen(true)}>
            <MessageSquarePlusIcon /> Request a change
          </Button>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Amount due"
          icon={WalletIcon}
          value={formatMoney(balance)}
          sub={`${formatCount(unpaid.length)} unpaid invoice${unpaid.length === 1 ? "" : "s"}`}
          loading={invoices.isPending}
        />
        <Tile
          label="Overdue"
          icon={AlertTriangleIcon}
          value={formatMoney(overdueAmount)}
          sub={overdue.length ? `${formatCount(overdue.length)} past the due date` : "Nothing overdue"}
          loading={invoices.isPending}
          tone={overdue.length ? "warning" : undefined}
        />
        <Tile label="Active subscriptions" icon={RepeatIcon} value={formatCount(active.length)} loading={subscriptions.isPending} />
        <Tile
          label="Next invoice"
          icon={CalendarClockIcon}
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
                  <li key={inv.id} className="flex items-center gap-3 px-5 py-3 text-sm">
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
                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
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
                <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
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
