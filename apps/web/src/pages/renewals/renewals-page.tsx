import type { ReportRenewal } from "@brightloop/shared";
import { CalendarCheckIcon, RefreshCwIcon } from "lucide-react";
import { Link } from "react-router";
import { CustomerSelect } from "@/components/customer-select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { GlossaryTip } from "@/components/glossary-tip";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import { useClientListQuery, useListState } from "@/lib/list";

const WINDOWS = [7, 14, 30, 60, 90] as const;

const columns: DataTableColumn<ReportRenewal>[] = [
  {
    id: "number",
    header: "Subscription",
    sortField: "number",
    cell: (r) => (
      <Link to={`/subscriptions/${r.subscriptionId}`} className="font-medium hover:underline">
        {r.number}
      </Link>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    sortField: "customer",
    cell: (r) => (
      <Link to={`/customers/${r.customer.id}`} className="hover:underline">
        {r.customer.name}
      </Link>
    ),
  },
  { id: "plan", header: "Plan", sortField: "planName", cell: (r) => r.planName },
  {
    id: "expiryDate",
    header: "Expires",
    sortField: "expiryDate",
    className: "whitespace-nowrap",
    cell: (r) => formatDate(r.expiryDate),
  },
  {
    id: "daysLeft",
    header: "Days left",
    sortField: "daysLeft",
    align: "right",
    cell: (r) => (
      <StatusBadge
        status="days_left"
        tone={r.daysLeft <= 7 ? "overdue" : r.daysLeft <= 30 ? "due-soon" : "paid"}
        label={r.daysLeft === 0 ? "Today" : `${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`}
      />
    ),
  },
  {
    id: "renewable",
    header: (
      <span className="inline-flex items-center gap-1">
        Renewable
        <GlossaryTip term="Renewable">Whether the plan allows renewing this subscription when it expires.</GlossaryTip>
      </span>
    ),
    cell: (r) =>
      r.renewable ? <StatusBadge status="active" label="Yes" /> : <StatusBadge status="closed" label="No" />,
  },
  {
    id: "mrr",
    header: (
      <span className="inline-flex items-center gap-1">
        MRR
        <GlossaryTip term="MRR">Monthly recurring revenue at risk if this subscription doesn't renew, pre-tax.</GlossaryTip>
      </span>
    ),
    sortField: "mrrPaise",
    align: "right",
    className: "tabular-nums whitespace-nowrap",
    cell: (r) => formatMoney(r.mrrPaise),
  },
];

const sortBy = {
  number: (r: ReportRenewal) => r.number,
  customer: (r: ReportRenewal) => r.customer.name,
  planName: (r: ReportRenewal) => r.planName,
  expiryDate: (r: ReportRenewal) => r.expiryDate,
  daysLeft: (r: ReportRenewal) => r.daysLeft,
  mrrPaise: (r: ReportRenewal) => r.mrrPaise,
};

/** Subscriptions expiring within the chosen window (GET /api/reports/renewals). */
export function RenewalsPage() {
  const list = useListState({ sort: "daysLeft", pageSize: 20 });
  const days = Number(list.filters.days) || 30;
  const customerId = list.filters.customerId;
  const query = useClientListQuery<ReportRenewal>(["reports", "renewals"], "/api/reports/renewals", list, {
    params: { days, customer_id: customerId },
    sortBy,
  });

  const refresh = async () => {
    const res = await query.refetch();
    if (res.isError) toast.error("Couldn't refresh renewals", res.error.message);
    else toast.success("Renewals refreshed");
  };

  return (
    <>
      <PageHeader
        title="Renewals"
        description="Subscriptions coming up for renewal, soonest first."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={query.isFetching}>
            <RefreshCwIcon className={query.isFetching ? "animate-spin" : undefined} /> Refresh
          </Button>
        }
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(r) => r.subscriptionId}
        empty={
          <EmptyState
            icon={CalendarCheckIcon}
            title="No renewals due"
            description={`No active subscriptions expire in the next ${days} days.`}
          />
        }
        filters={
          <>
            <Select
              aria-label="Renewal window"
              className="w-44"
              value={days}
              onChange={(e) => list.setFilter("days", e.target.value === "30" ? undefined : e.target.value)}
            >
              {WINDOWS.map((d) => (
                <option key={d} value={d}>
                  Next {d} days
                </option>
              ))}
            </Select>
            <CustomerSelect value={customerId} onChange={(id) => list.setFilter("customerId", id)} />
            {Object.keys(list.filters).length > 0 && (
              <Button variant="ghost" size="sm" onClick={list.clearFilters}>
                Clear filters
              </Button>
            )}
          </>
        }
      />
    </>
  );
}
