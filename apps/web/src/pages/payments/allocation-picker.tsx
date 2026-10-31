import type { Invoice, PaymentAllocationInput } from "@brightloop/shared";
import { summarize, useOpenInvoices } from "@/lib/payments";
import type { FieldErrors } from "react-hook-form";
import { ScaledInput } from "@/components/scaled-input";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { isInvoiceOverdue } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { InvoiceStatusBadge } from "@/pages/invoices/invoice-status-badge";

interface Props {
  customerId: string | undefined;
  /** Payment amount (new payment) or unallocated amount (existing payment), in paise. */
  available: number;
  value: PaymentAllocationInput[];
  onChange: (value: PaymentAllocationInput[]) => void;
  errors?: FieldErrors<{ allocations: PaymentAllocationInput[] }>["allocations"];
}

/**
 * The customer's open invoices with an amount box each, a live "remaining to allocate" figure,
 * and red highlights when a line exceeds its balance or the total exceeds the payment.
 */
export function AllocationPicker({ customerId, available, value, onChange, errors }: Props) {
  const invoices = useOpenInvoices(customerId);
  const sum = summarize(available, value, invoices.open);
  const amountFor = (id: string) => value.find((a) => a.invoiceId === id)?.amountPaise;

  const set = (invoiceId: string, amountPaise: number | undefined) => {
    const rest = value.filter((a) => a.invoiceId !== invoiceId);
    // 0 or empty means "don't allocate"; NaN stays so the schema can flag it.
    onChange(amountPaise === undefined || amountPaise === 0 ? rest : [...rest, { invoiceId, amountPaise }]);
  };

  const fill = (inv: Invoice) => {
    const others = sum.allocated - (amountFor(inv.id) ?? 0);
    const free = Number.isNaN(available) ? 0 : Math.max(0, available - others);
    set(inv.id, Math.min(inv.balancePaise, free) || undefined);
  };

  if (!customerId) return <p className="text-sm text-muted-foreground">Pick a customer to see their open invoices.</p>;
  if (invoices.isPending) return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  if (invoices.isError) return <p className="text-sm text-destructive">Couldn't load open invoices.</p>;

  return (
    <div className="grid gap-2">
      {invoices.open.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground">
          No open invoices. The payment will be recorded as unallocated credit.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {invoices.open.map((inv) => {
            const idx = value.findIndex((a) => a.invoiceId === inv.id);
            const amount = amountFor(inv.id);
            const lineOver = amount !== undefined && amount > inv.balancePaise;
            const err = idx >= 0 ? errors?.[idx]?.amountPaise?.message : undefined;
            return (
              <li key={inv.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_auto_9rem] sm:items-center">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {inv.number} <InvoiceStatusBadge invoice={inv} />
                  </p>
                  <p className={cn("text-xs text-muted-foreground", isInvoiceOverdue(inv) && "text-status-overdue")}>
                    Due {formatDate(inv.dueDate)} · balance {formatMoney(inv.balancePaise)}
                  </p>
                </div>
                <Button type="button" size="xs" variant="ghost" onClick={() => fill(inv)}>
                  Fill
                </Button>
                <div>
                  <ScaledInput
                    unit="rupees"
                    aria-label={`Allocate to ${inv.number}`}
                    aria-invalid={lineOver || !!err || undefined}
                    value={amount ?? 0}
                    onChange={(n) => set(inv.id, n)}
                  />
                  {(lineOver || err) && (
                    <p className="mt-1 text-xs font-medium text-destructive">{lineOver ? "More than the balance" : "Enter an amount"}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div
        className={cn(
          "flex items-center justify-between rounded-md px-3 py-2 text-sm",
          sum.over ? "bg-status-overdue-bg text-status-overdue-fg" : "bg-surface",
        )}
        aria-live="polite"
      >
        <span>Remaining to allocate</span>
        <span className="font-semibold tabular-nums">
          {Number.isNaN(sum.remaining) ? "—" : sum.remaining < 0 ? `−${formatMoney(-sum.remaining)}` : formatMoney(sum.remaining)}
        </span>
      </div>
      {sum.remaining < 0 && <p className="text-xs font-medium text-destructive">Allocations are more than the payment amount.</p>}
      {typeof errors?.message === "string" && <p className="text-xs font-medium text-destructive">{errors.message}</p>}
      {typeof errors?.root?.message === "string" && <p className="text-xs font-medium text-destructive">{errors.root.message}</p>}
    </div>
  );
}
