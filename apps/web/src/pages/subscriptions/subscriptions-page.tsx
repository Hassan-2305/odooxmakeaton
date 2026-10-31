import { SUBSCRIPTION_STATUSES, type Subscription } from "@brightloop/shared";
import { RepeatIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { CustomerSelect } from "@/components/customer-select";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ClearFilters, FilterSelect } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { usePlanOptions } from "@/lib/catalog";
import { useListQuery, useListState } from "@/lib/list";
import { subscriptionColumns } from "./subscription-columns";

const columns = subscriptionColumns();
const WINDOWS = [7, 14, 30, 60, 90] as const;

/** Subscriptions with status, customer, plan and "expiring within" filters, all in the query string. */
export function SubscriptionsPage() {
  const list = useListState({ sort: "-createdAt" });
  const query = useListQuery<Subscription>("subscriptions", "/api/subscriptions", list);
  const plans = usePlanOptions();
  const navigate = useNavigate();
  const filtered = Object.keys(list.filters).length > 0;

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Quotations, active and paused subscriptions, and their billing dates."
        actions={
          <Button variant="outline" asChild>
            <Link to="/quotations">
              <RepeatIcon /> New from template
            </Link>
          </Button>
        }
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(`/subscriptions/${s.id}`)}
        filters={
          <>
            <FilterSelect
              label="Statuses"
              value={list.filters.status}
              options={SUBSCRIPTION_STATUSES}
              onChange={(v) => list.setFilter("status", v)}
            />
            <CustomerSelect value={list.filters.customerId} onChange={(id) => list.setFilter("customerId", id)} />
            <Select
              aria-label="Plan"
              className="w-44"
              value={list.filters.planId ?? ""}
              onChange={(e) => list.setFilter("planId", e.target.value || undefined)}
            >
              <option value="">All plans</option>
              {plans.data?.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Expiring within"
              className="w-48"
              value={list.filters.expiringWithinDays ?? ""}
              onChange={(e) => list.setFilter("expiringWithinDays", e.target.value || undefined)}
            >
              <option value="">Any expiry</option>
              {WINDOWS.map((d) => (
                <option key={d} value={d}>
                  Expiring within {d} days
                </option>
              ))}
            </Select>
            <ClearFilters list={list} />
          </>
        }
        empty={
          filtered ? (
            <EmptyState title="No matching subscriptions" description="Try changing or clearing the filters." />
          ) : (
            <EmptyState
              icon={RepeatIcon}
              title="No subscriptions yet"
              description="Create one from a quotation template."
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link to="/quotations">Go to quotations</Link>
                </Button>
              }
            />
          )
        }
      />
    </>
  );
}
