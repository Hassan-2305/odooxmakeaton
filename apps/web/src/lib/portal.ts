import type {
  Customer,
  PortalInvoice,
  PortalPayment,
  PortalRequest,
  PortalRequestInput,
  PortalSubscription,
} from "@brightloop/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { todayIso } from "./format";
import type { StatusTone } from "./theme";

// Every /api/portal endpoint is scoped to the signed-in customer by the server.
// Invoice and payment keys start with "invoices"/"payments" so live updates refresh them.
export const portalKeys = {
  profile: ["portal", "profile"] as const,
  subscriptions: ["portal", "subscriptions"] as const,
  invoices: ["invoices", "portal"] as const,
  payments: ["payments", "portal"] as const,
};

export const portalPaths = {
  subscriptions: "/api/portal/subscriptions",
  invoices: "/api/portal/invoices",
  payments: "/api/portal/payments",
};

export function usePortalProfile() {
  return useQuery({
    queryKey: portalKeys.profile,
    queryFn: ({ signal }) => api<{ customer: Customer }>("/api/portal/profile", { signal }).then((r) => r.customer),
  });
}

/**
 * Unpaged lists, for the overview. Tables use useClientListQuery with the same key, so the
 * cached value must stay the raw { data } response; `select` unwraps it per component.
 */
function usePortalList<T>(key: readonly unknown[], path: string) {
  return useQuery({
    queryKey: [...key, {}],
    queryFn: ({ signal }) => api<{ data: T[]; tookMs?: number }>(path, { signal }),
    select: (r) => r.data,
  });
}

export const usePortalSubscriptions = () =>
  usePortalList<PortalSubscription>(portalKeys.subscriptions, portalPaths.subscriptions);
export const usePortalInvoices = () => usePortalList<PortalInvoice>(portalKeys.invoices, portalPaths.invoices);
export const usePortalPayments = () => usePortalList<PortalPayment>(portalKeys.payments, portalPaths.payments);

export function usePortalRequest() {
  return useMutation({
    mutationFn: (input: PortalRequestInput) =>
      api<{ request: PortalRequest }>("/api/portal/requests", { method: "POST", body: input }),
  });
}

/** "Every month", "Every 3 months". */
export function billingCycle(s: Pick<PortalSubscription, "interval" | "intervalCount">): string {
  return s.intervalCount === 1 ? `Every ${s.interval}` : `Every ${s.intervalCount} ${s.interval}s`;
}

/** Statuses the API accepts a cancel/change request for. */
export const REQUESTABLE_STATUSES = new Set(["quotation", "active", "paused"]);

export function isOverdue(inv: PortalInvoice, today = todayIso()): boolean {
  return inv.status === "confirmed" && inv.balancePaise > 0 && inv.dueDate !== null && inv.dueDate < today;
}

/** Status shown to the customer: a confirmed invoice is "due" or "overdue". */
export function invoiceDisplay(inv: PortalInvoice): { status: string; label: string; tone?: StatusTone } {
  if (isOverdue(inv)) return { status: "overdue", label: "Overdue" };
  if (inv.status === "confirmed") return { status: "due_soon", label: "Due" };
  return { status: inv.status, label: inv.status.charAt(0).toUpperCase() + inv.status.slice(1) };
}

/** Downloads the invoice PDF through the session cookie and saves it as a file. */
export async function downloadInvoicePdf(inv: Pick<PortalInvoice, "id" | "number">): Promise<void> {
  const res = await fetch(`/api/portal/invoices/${inv.id}/pdf`, { credentials: "same-origin" });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    let code = "http_error";
    try {
      const body = (await res.json()) as { error?: { code: string; message: string } };
      if (body.error) ({ message, code } = body.error);
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ApiError(res.status, { code, message });
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
