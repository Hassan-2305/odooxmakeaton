import type { Invoice } from "@brightloop/shared";
import { StatusBadge } from "@/components/status-badge";
import { invoiceBadge } from "@/lib/invoices";

export function InvoiceStatusBadge({ invoice }: { invoice: Pick<Invoice, "status" | "balancePaise" | "dueDate"> }) {
  const b = invoiceBadge(invoice);
  return <StatusBadge status={b.status} tone={b.tone} label={b.label} outline={b.outline} />;
}
