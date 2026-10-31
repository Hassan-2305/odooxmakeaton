import type { Invoice, Plan, SubscriptionDetail, SubscriptionEvent } from "@brightloop/shared";
import { ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { DataTable } from "@/components/data-table";
import { BackLink, DetailCard, DetailList, DetailSkeleton, SimpleTable, TotalsList } from "@/components/detail";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { planCycle } from "@/lib/catalog";
import { formatDate, formatDateTime, formatMoney, humanize, todayIso } from "@/lib/format";
import { useListQuery, useLocalListState } from "@/lib/list";
import { formatBps } from "@/lib/money-input";
import { useRecord } from "@/lib/resources";
import { cn } from "@/lib/utils";
import { invoiceColumns } from "@/pages/invoices/invoice-columns";
import { SubscriptionStatusBadge } from "./subscription-status-badge";
import { TransitionDialog } from "./transition-dialog";
import { availableTransitions, type TransitionAction } from "./transitions";

const invCols = invoiceColumns({ customer: false });

function eventText(e: SubscriptionEvent): { title: string; note?: string } {
  const payload = (e.payload ?? {}) as { note?: string | null; expiryDate?: string; previousExpiryDate?: string };
  if (e.type === "renewed") {
    return {
      title: `Renewed: expiry ${formatDate(payload.previousExpiryDate)} → ${formatDate(payload.expiryDate)}`,
      note: payload.note ?? undefined,
    };
  }
  if (e.type === "status_changed" && e.toStatus) {
    return {
      title: e.fromStatus ? `${humanize(e.fromStatus)} → ${humanize(e.toStatus)}` : `Created as ${e.toStatus}`,
      note: payload.note ?? undefined,
    };
  }
  return { title: humanize(e.type), note: payload.note ?? undefined };
}

function Timeline({ events }: { events: SubscriptionEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ol className="relative ml-2 space-y-4 border-l pl-5">
      {sorted.map((e, i) => {
        const { title, note } = eventText(e);
        return (
          <li key={e.id} className="relative">
            <span
              className={cn(
                "absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-background",
                i === 0 ? "bg-primary" : "bg-status-draft",
              )}
              aria-hidden
            />
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(e.createdAt)} · {e.actorUserId ? "By a team member" : "Automatic"}
            </p>
            {note && <p className="mt-1 rounded-md bg-surface px-2 py-1 text-sm">{note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** One subscription: lines, totals, invoices, timeline and the moves its plan allows. */
export function SubscriptionDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const sub = useRecord<SubscriptionDetail>("subscriptions", `/api/subscriptions/${id}`, "subscription");
  const plan = useRecord<Plan>("plans", `/api/plans/${sub.data?.recurringPlanId}`, "plan", !!sub.data);
  const invList = useLocalListState({ sort: "-createdAt" });
  const invoices = useListQuery<Invoice>("invoices", "/api/invoices", {
    ...invList,
    filters: { ...invList.filters, subscriptionId: id },
  });
  const [action, setAction] = useState<TransitionAction | null>(null);

  if (sub.isPending) return <DetailSkeleton />;
  if (sub.isError)
    return (
      <>
        <BackLink to="/subscriptions">Subscriptions</BackLink>
        <ErrorState error={sub.error} onRetry={() => void sub.refetch()} />
      </>
    );

  const s = sub.data;
  const actions = availableTransitions(s, plan.data, todayIso());

  return (
    <>
      <BackLink to="/subscriptions">Subscriptions</BackLink>
      <PageHeader
        title={s.number}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <SubscriptionStatusBadge status={s.status} />
            <Link to={`/customers/${s.customerId}`} className="hover:underline">
              {s.customerName}
            </Link>
            <span>· {s.planName}</span>
          </span>
        }
        actions={actions.map((a) => (
          <Button
            key={a.to}
            variant={a.destructive ? "outline" : "default"}
            onClick={() => setAction(a)}
            disabled={!!a.disabledReason || plan.isPending}
            title={a.disabledReason}
          >
            {a.label}
          </Button>
        ))}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DetailCard title="Details">
            <DetailList
              items={[
                ["Plan", plan.data ? `${s.planName} · ${planCycle(plan.data)}` : s.planName],
                ["Start date", formatDate(s.startDate)],
                ["Expiry date", s.expiryDate ? formatDate(s.expiryDate) : "No end date"],
                ["Next invoice", formatDate(s.nextInvoiceDate)],
                ["Payment terms", `${s.paymentTermsDays} days`],
                ...(s.quotationExpiresAt
                  ? ([["Quotation valid until", formatDateTime(s.quotationExpiresAt)]] as [string, string][])
                  : []),
                ["Notes", s.notes && <span className="whitespace-pre-line">{s.notes}</span>],
              ]}
            />
          </DetailCard>

          <DetailCard title="Lines">
            <SimpleTable
              head={[
                { label: "Item" },
                { label: "Qty", align: "right" },
                { label: "Unit price", align: "right" },
                { label: "Taxes" },
                { label: "Amount", align: "right" },
              ]}
              rows={[...s.lines]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((l) => ({
                  key: l.id,
                  cells: [
                    l.description,
                    l.quantity,
                    formatMoney(l.unitPricePaise),
                    <span className="text-muted-foreground">
                      {l.taxes.map((t) => `${t.name} ${formatBps(t.rateBps)}${t.inclusive ? " incl." : ""}`).join(", ") || "—"}
                    </span>,
                    // Integer paise × quantity: exact, display only.
                    formatMoney(l.quantity * l.unitPricePaise),
                  ],
                }))}
            />
            <div className="mt-4">
              <TotalsList
                rows={[
                  { label: "Recurring subtotal", value: formatMoney(s.recurringAmountPaise), strong: true },
                ]}
              />
              <p className="mt-2 text-right text-xs text-muted-foreground">
                Before tax and discounts. Each invoice calculates tax and discounts for its period.
              </p>
            </div>
          </DetailCard>

          <DetailCard title="Invoices" bodyClassName="p-0">
            <DataTable
              className="[&>div]:rounded-none [&>div]:border-0"
              columns={invCols}
              query={invoices}
              list={invList}
              rowKey={(i) => i.id}
              onRowClick={(i) => navigate(`/invoices/${i.id}`)}
              empty={<EmptyState icon={ReceiptIcon} title="No invoices yet" description="Billing runs raise invoices once the subscription is active." />}
            />
          </DetailCard>
        </div>

        <DetailCard title="Timeline" className="self-start">
          <Timeline events={s.events} />
        </DetailCard>
      </div>

      <TransitionDialog subscription={s} action={action} onOpenChange={(o) => !o && setAction(null)} />
    </>
  );
}
