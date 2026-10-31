import { AGING_BUCKETS, type AgingBucket, type ReportSummary } from "@brightloop/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  BadgeIndianRupeeIcon,
  FileTextIcon,
  PercentIcon,
  RefreshCwIcon,
  RepeatIcon,
  ShieldAlertIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CustomerSelect } from "@/components/customer-select";
import { ErrorState } from "@/components/error-state";
import { FormAlert } from "@/components/form-alert";
import { PageHeader } from "@/components/page-header";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withQuery } from "@/lib/api";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatShortDate,
} from "@/lib/format";
import { useAging, useCollections, useReportFilters, useSummary, type ReportFilters } from "@/lib/reports";
import { colors, statusColors } from "@/lib/theme";
import { ChartCard } from "./chart-card";
import { KpiCard } from "./kpi-card";

const money = (v: unknown) => formatMoney(Number(v));
const axisMoney = (v: number) => formatMoneyCompact(v);
const axisTick = { fontSize: 12, fill: colors["muted-foreground"] };
const tooltipStyle = {
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  boxShadow: "0 8px 24px -8px rgb(15 23 42 / 0.15)",
  fontSize: 12,
};

const AGING_COLORS: Record<AgingBucket, string> = {
  current: statusColors.paid.solid,
  "0-30": statusColors["due-soon"].solid,
  "31-60": "#ea580c",
  "61-90": statusColors.overdue.solid,
  "90+": "#7f1d1d",
};

const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Not yet due",
  "0-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

function KpiGrid({ filters, summary }: { filters: ReportFilters; summary: ReturnType<typeof useSummary> }) {
  const { from, to, customerId } = filters;
  const s: ReportSummary | undefined = summary.data;
  const loading = summary.isPending;
  // Each target list reads these filter names from its query string and sends them to its API.
  const link = (path: string, params: Record<string, string | undefined> = {}) =>
    withQuery(path, { ...params, customerId });

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Active subscriptions"
        icon={RepeatIcon}
        glossary="Subscriptions in the active state right now. Not limited to the date range."
        value={s && formatCount(s.activeSubscriptions)}
        sub="As of today"
        to={link("/subscriptions", { status: "active" })}
        loading={loading}
      />
      <KpiCard
        label="MRR"
        icon={TrendingUpIcon}
        glossary="Monthly recurring revenue: every active subscription's recurring amount converted to a monthly figure, before tax and discounts."
        value={s && formatMoneyCompact(s.mrrPaise)}
        exact={s && formatMoney(s.mrrPaise)}
        sub="Monthly, pre-tax"
        to={link("/subscriptions", { status: "active" })}
        loading={loading}
      />
      <KpiCard
        label="Invoiced"
        icon={FileTextIcon}
        glossary="Total of confirmed and paid invoices issued between the from and to dates."
        value={s && formatMoneyCompact(s.invoicedPaise)}
        exact={s && formatMoney(s.invoicedPaise)}
        sub={s && `${formatDate(s.from)} – ${formatDate(s.to)}`}
        to={link("/invoices", { from, to })}
        loading={loading}
      />
      <KpiCard
        label="Collected"
        icon={WalletIcon}
        glossary="Payment amounts applied to invoices, for payments received between the from and to dates."
        value={s && formatMoneyCompact(s.collectedPaise)}
        exact={s && formatMoney(s.collectedPaise)}
        sub={s && `${formatDate(s.from)} – ${formatDate(s.to)}`}
        to={link("/payments", { from, to })}
        loading={loading}
      />
      <KpiCard
        label="Outstanding"
        icon={BadgeIndianRupeeIcon}
        glossary="Unpaid balance of every confirmed invoice as of today, whether due or not."
        value={s && formatMoneyCompact(s.outstandingPaise)}
        exact={s && formatMoney(s.outstandingPaise)}
        sub="Confirmed, unpaid"
        to={link("/invoices", { status: "confirmed" })}
        loading={loading}
      />
      <KpiCard
        label="Overdue"
        icon={AlertTriangleIcon}
        glossary="Confirmed invoices past their due date with a balance left to pay. Shows the count and the unpaid amount."
        value={s && formatMoneyCompact(s.overdue.amountPaise)}
        exact={s && formatMoney(s.overdue.amountPaise)}
        sub={s && `${formatCount(s.overdue.count)} invoice${s.overdue.count === 1 ? "" : "s"}`}
        to={link("/invoices", { overdue: "true" })}
        loading={loading}
        tone={s && s.overdue.count > 0 ? "warning" : "default"}
      />
      <KpiCard
        label="Open findings"
        icon={ShieldAlertIcon}
        glossary="Revenue integrity findings still waiting for review: missing invoices, duplicate invoices and unallocated payments."
        value={s && formatCount(s.openFindings)}
        sub="Revenue integrity"
        to={link("/revenue-integrity", { status: "open" })}
        loading={loading}
        tone={s && s.openFindings > 0 ? "warning" : "default"}
      />
      <KpiCard
        label="Collection rate"
        icon={PercentIcon}
        glossary="Collected as a share of Invoiced for the selected date range."
        value={s && (s.invoicedPaise > 0 ? `${Math.round((s.collectedPaise / s.invoicedPaise) * 100)}%` : "—")}
        sub="Collected ÷ invoiced"
        to={link("/payments", { from, to })}
        loading={loading}
      />
    </div>
  );
}

function CollectionsChart({ filters }: { filters: ReportFilters }) {
  const query = useCollections(filters);
  return (
    <ChartCard
      className="lg:col-span-2"
      title="Collections over time"
      glossary="Per day: Received is the total of payments recorded; Collected is the part of them applied to invoices. A gap between the two means unallocated money."
      query={query}
      isEmpty={(d) => d.series.length === 0 || d.series.every((p) => p.receivedPaise === 0 && p.collectedPaise === 0)}
      emptyText="No payments were received in this date range."
      aside={(d) => `Collected ${formatMoney(d.totalCollectedPaise)} of ${formatMoney(d.totalReceivedPaise)} received`}
    >
      {(d) => (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={d.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCollected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillReceived" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke={colors.border} vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatShortDate} tick={axisTick} minTickGap={24} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={axisMoney} tick={axisTick} width={64} axisLine={false} tickLine={false} />
            <Tooltip formatter={money} labelFormatter={(l) => formatDate(String(l))} contentStyle={tooltipStyle} />
            <Legend iconType="circle" verticalAlign="top" align="right" height={28} wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="receivedPaise"
              name="Received"
              stroke="#3b82f6"
              fill="url(#fillReceived)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="collectedPaise"
              name="Collected"
              stroke={colors.primary}
              fill="url(#fillCollected)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function StatusMixChart({ summary }: { summary: ReturnType<typeof useSummary> }) {
  return (
    <ChartCard
      title="Invoice status mix"
      glossary="How invoice money splits today: Collected in the date range, Outstanding not yet due, and Overdue. Built from the summary figures."
      query={summary}
      isEmpty={(s) => s.collectedPaise + s.outstandingPaise === 0}
      emptyText="No collected or outstanding invoice amounts yet."
    >
      {(s) => {
        const notDue = Math.max(0, s.outstandingPaise - s.overdue.amountPaise);
        const slices = [
          { name: "Collected", value: s.collectedPaise, color: statusColors.paid.solid },
          { name: "Outstanding, not due", value: notDue, color: statusColors["due-soon"].solid },
          { name: "Overdue", value: s.overdue.amountPaise, color: statusColors.overdue.solid },
        ].filter((x) => x.value > 0);
        const total = slices.reduce((sum, x) => sum + x.value, 0);
        return (
          <div className="flex h-full flex-col">
            <div className="relative min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="68%"
                    outerRadius="92%"
                    paddingAngle={2}
                    cornerRadius={4}
                    stroke="none"
                  >
                    {slices.map((x) => (
                      <Cell key={x.name} fill={x.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={money} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold tabular-nums">{formatMoneyCompact(total)}</span>
                <span className="text-xs text-muted-foreground">tracked</span>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs">
              {slices.map((x) => (
                <li key={x.name} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: x.color }} aria-hidden />
                  <span className="text-muted-foreground">{x.name}</span>
                  <span className="ml-auto font-medium tabular-nums">
                    {formatMoney(x.value)}{" "}
                    <span className="text-muted-foreground">({Math.round((x.value / total) * 100)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </ChartCard>
  );
}

function AgingChart({ filters }: { filters: ReportFilters }) {
  const query = useAging(filters);
  return (
    <ChartCard
      className="lg:col-span-3"
      title="Receivables aging"
      glossary="Unpaid confirmed invoices grouped by how many days past their due date they are, as of today. Not limited to the date range."
      query={query}
      isEmpty={(d) => d.totalPaise === 0}
      emptyText="Nothing is outstanding. Every confirmed invoice is paid."
      aside={(d) => `${formatMoney(d.totalPaise)} outstanding as of ${formatDate(d.asOf)}`}
    >
      {(d) => {
        const rows = AGING_BUCKETS.map((bucket) => {
          const found = d.buckets.find((b) => b.bucket === bucket);
          return { bucket, label: AGING_LABELS[bucket], amountPaise: found?.amountPaise ?? 0, count: found?.count ?? 0 };
        });
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke={colors.border} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={axisMoney} tick={axisTick} width={64} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: colors.muted }}
                formatter={(v, _n, item) => [
                  `${money(v)} · ${formatCount((item.payload as { count: number }).count)} invoices`,
                  "Unpaid",
                ]}
              />
              <Bar dataKey="amountPaise" name="Unpaid" radius={[8, 8, 0, 0]} maxBarSize={56}>
                {rows.map((r) => (
                  <Cell key={r.bucket} fill={AGING_COLORS[r.bucket]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      }}
    </ChartCard>
  );
}

/** Finance overview: KPI tiles and charts from /api/reports/*, filtered by date range and customer. */
export function DashboardPage() {
  const filters = useReportFilters();
  const summary = useSummary(filters);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ queryKey: ["reports"], type: "active" }, { throwOnError: true });
      toast.success("Dashboard refreshed");
    } catch {
      toast.error("Couldn't refresh the dashboard", "Some figures may be out of date.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Account health, revenue and collections at a glance."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing || !!filters.rangeError}>
            <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} /> Refresh
          </Button>
        }
      />

      <div className="glass-surface mb-5 flex flex-wrap items-end gap-3 p-4">
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            className="w-40"
            value={filters.from}
            max={filters.to}
            onChange={(e) => filters.set("from", e.target.value || undefined)}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          To
          <Input
            type="date"
            className="w-40"
            value={filters.to}
            min={filters.from}
            onChange={(e) => filters.set("to", e.target.value || undefined)}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Customer
          <CustomerSelect value={filters.customerId} onChange={(id) => filters.set("customerId", id)} />
        </label>
        {filters.isFiltered && (
          <Button variant="ghost" size="sm" onClick={filters.reset}>
            Reset filters
          </Button>
        )}
      </div>

      {filters.rangeError ? (
        <FormAlert className="mb-4">{filters.rangeError}</FormAlert>
      ) : summary.isError ? (
        <div className="card-surface">
          <ErrorState title="Couldn't load the dashboard" error={summary.error} onRetry={() => void summary.refetch()} />
        </div>
      ) : (
        <div className="space-y-4">
          <KpiGrid filters={filters} summary={summary} />
          <div className="grid gap-4 lg:grid-cols-3">
            <CollectionsChart filters={filters} />
            <StatusMixChart summary={summary} />
            <AgingChart filters={filters} />
          </div>
          {summary.data && (
            <p className="text-right text-xs text-muted-foreground">
              Summary computed in {formatCount(Math.round(summary.data.tookMs))} ms
            </p>
          )}
        </div>
      )}
    </>
  );
}
