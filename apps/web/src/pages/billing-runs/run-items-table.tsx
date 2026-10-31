import type { BillingRunItem } from "@brightloop/shared";
import { Link } from "react-router";
import { SimpleTable } from "@/components/detail";
import { StatusBadge } from "@/components/status-badge";
import { OUTCOME_INFO, useSubscriptionCustomers } from "@/lib/billing-runs";
import { formatDate, formatMoney } from "@/lib/format";

/** Subscription, customer, period, amount, outcome and reason for each item of a run. */
export function RunItemsTable({ items, dryRun = false }: { items: BillingRunItem[]; dryRun?: boolean }) {
  const customers = useSubscriptionCustomers(items.map((i) => i.subscriptionId));
  return (
    <SimpleTable
      empty="No subscriptions were due."
      head={[
        { label: "Subscription" },
        { label: "Customer" },
        { label: "Period from" },
        { label: "Amount", align: "right" },
        { label: "Outcome" },
        { label: "Reason" },
      ]}
      rows={items.map((item) => {
        const customer = customers.get(item.subscriptionId);
        const info = OUTCOME_INFO[item.outcome];
        return {
          key: item.id,
          cells: [
            <Link to={`/subscriptions/${item.subscriptionId}`} className="font-medium hover:underline">
              {item.subscriptionNumber ?? item.subscriptionId.slice(0, 8)}
            </Link>,
            customer ? (
              <Link to={`/customers/${customer.id}`} className="hover:underline">
                {customer.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">…</span>
            ),
            <span className="whitespace-nowrap">{formatDate(item.periodStart)}</span>,
            item.totalPaise === null ? "—" : formatMoney(item.totalPaise),
            <StatusBadge status={item.outcome} tone={info.tone} label={dryRun && item.outcome === "created" ? "Will invoice" : info.label} />,
            <span className="text-muted-foreground">
              {item.reason ?? (item.invoiceId && !dryRun ? (
                <Link to={`/invoices/${item.invoiceId}`} className="hover:underline">
                  {item.invoiceNumber ?? "View invoice"}
                </Link>
              ) : (
                "—"
              ))}
            </span>,
          ],
        };
      })}
    />
  );
}
