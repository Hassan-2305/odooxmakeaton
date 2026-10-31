import type { PortalRequestInput, PortalSubscription } from "@brightloop/shared";
import { MessageSquarePlusIcon, RepeatIcon } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { useClientListQuery, useListState } from "@/lib/list";
import { billingCycle, portalKeys, portalPaths, REQUESTABLE_STATUSES } from "@/lib/portal";
import { RequestDialog } from "./request-dialog";

const sortBy = {
  number: (s: PortalSubscription) => s.number,
  planName: (s: PortalSubscription) => s.planName,
  recurringAmountPaise: (s: PortalSubscription) => s.recurringAmountPaise,
  nextInvoiceDate: (s: PortalSubscription) => s.nextInvoiceDate,
  expiryDate: (s: PortalSubscription) => s.expiryDate,
};

export function PortalSubscriptionsPage() {
  const list = useListState({ sort: "number", pageSize: 20 });
  const query = useClientListQuery<PortalSubscription>(portalKeys.subscriptions, portalPaths.subscriptions, list, {
    sortBy,
  });
  const [dialog, setDialog] = useState<{ subscriptionId?: string; type: PortalRequestInput["type"] } | null>(null);

  const columns: DataTableColumn<PortalSubscription>[] = [
    { id: "number", header: "Subscription", sortField: "number", cell: (s) => <span className="font-medium">{s.number}</span> },
    { id: "plan", header: "Plan", sortField: "planName", cell: (s) => s.planName },
    { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    {
      id: "amount",
      header: "Amount",
      sortField: "recurringAmountPaise",
      align: "right",
      className: "whitespace-nowrap",
      cell: (s) => (
        <span>
          <span className="tabular-nums">{formatMoney(s.recurringAmountPaise)}</span>
          <span className="block text-xs text-muted-foreground">{billingCycle(s)}, before tax</span>
        </span>
      ),
    },
    {
      id: "next",
      header: "Next invoice",
      sortField: "nextInvoiceDate",
      className: "whitespace-nowrap",
      cell: (s) => formatDate(s.nextInvoiceDate),
    },
    { id: "expiry", header: "Ends", sortField: "expiryDate", className: "whitespace-nowrap", cell: (s) => formatDate(s.expiryDate) },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (s) =>
        REQUESTABLE_STATUSES.has(s.status) ? (
          <div className="flex justify-end gap-1">
            <Button variant="outline" size="sm" onClick={() => setDialog({ subscriptionId: s.id, type: "change" })}>
              Change
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDialog({ subscriptionId: s.id, type: "cancel" })}
            >
              Cancel
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Your plans and when they next bill."
        actions={
          <Button onClick={() => setDialog({ type: "change" })}>
            <MessageSquarePlusIcon /> Request a change
          </Button>
        }
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(s) => s.id}
        empty={<EmptyState icon={RepeatIcon} title="No subscriptions" description="You don't have any subscriptions yet." />}
      />
      <RequestDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        subscriptionId={dialog?.subscriptionId}
        type={dialog?.type}
      />
    </>
  );
}
