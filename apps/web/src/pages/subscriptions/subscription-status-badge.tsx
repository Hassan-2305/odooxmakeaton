import type { Subscription } from "@brightloop/shared";
import { StatusBadge } from "@/components/status-badge";

export function SubscriptionStatusBadge({ status }: { status: Subscription["status"] }) {
  return <StatusBadge status={status} outline={status === "cancelled"} />;
}
