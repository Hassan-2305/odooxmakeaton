import type { Invoice } from "@brightloop/shared";
import { todayIso } from "./format";
import type { StatusTone } from "./theme";

/** Confirmed, not fully paid and past its due date: the same rule as the API's overdue filter. */
export function isInvoiceOverdue(
  inv: Pick<Invoice, "status" | "balancePaise" | "dueDate">,
  today = todayIso(),
): boolean {
  return inv.status === "confirmed" && inv.balancePaise > 0 && inv.dueDate !== null && inv.dueDate < today;
}

/**
 * Badge for an invoice: paid green, overdue red, confirmed/due amber, draft grey,
 * cancelled grey outline.
 */
export function invoiceBadge(inv: Pick<Invoice, "status" | "balancePaise" | "dueDate">): {
  status: string;
  label: string;
  tone: StatusTone;
  outline?: boolean;
} {
  if (isInvoiceOverdue(inv)) return { status: "overdue", label: "Overdue", tone: "overdue" };
  switch (inv.status) {
    case "paid":
      return { status: "paid", label: "Paid", tone: "paid" };
    case "confirmed":
      return { status: "confirmed", label: "Due", tone: "due-soon" };
    case "cancelled":
      return { status: "cancelled", label: "Cancelled", tone: "draft", outline: true };
    default:
      return { status: "draft", label: "Draft", tone: "draft" };
  }
}

/** Saves the PDF from GET /api/invoices/:id/pdf through the session cookie. */
export async function downloadBackOfficePdf(inv: Pick<Invoice, "id" | "number">): Promise<void> {
  const res = await fetch(`/api/invoices/${inv.id}/pdf`, { credentials: "same-origin" });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message: string } };
      if (body.error) message = body.error.message;
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new Error(message);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${inv.number ?? inv.id.slice(0, 8)}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
