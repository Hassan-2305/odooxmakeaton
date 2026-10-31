import type { Invoice, PaymentAllocationInput } from "@brightloop/shared";
import { useOptions } from "./resources";

/** A customer's confirmed invoices with a balance left: the only ones a payment can go to. */
export function useOpenInvoices(customerId: string | undefined) {
  const query = useOptions<Invoice>(
    "invoices",
    "/api/invoices",
    { customerId, status: "confirmed", sort: "dueDate" },
    !!customerId,
  );
  return { ...query, open: (query.data?.data ?? []).filter((i) => i.balancePaise > 0) };
}

export interface AllocationSummary {
  allocated: number;
  /** Amount still free; negative when over-allocated. NaN while the amount is invalid. */
  remaining: number;
  /** Any line above its invoice balance, or the total above the payment. */
  over: boolean;
}

/** Sums the picked allocations against the payment amount. Integer paise; display and gating only. */
export function summarize(
  available: number,
  allocations: PaymentAllocationInput[],
  invoices: Pick<Invoice, "id" | "balancePaise">[],
): AllocationSummary {
  const allocated = allocations.reduce((sum, a) => sum + (Number.isNaN(a.amountPaise) ? 0 : a.amountPaise), 0);
  const remaining = available - allocated;
  const lineOver = allocations.some((a) => {
    const inv = invoices.find((i) => i.id === a.invoiceId);
    return inv !== undefined && a.amountPaise > inv.balancePaise;
  });
  return { allocated, remaining, over: lineOver || remaining < 0 };
}
