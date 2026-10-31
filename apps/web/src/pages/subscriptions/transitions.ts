import type { Plan, SubscriptionDetail, SubscriptionTransitionTarget } from "@brightloop/shared";

export interface TransitionAction {
  to: SubscriptionTransitionTarget;
  label: string;
  /** Dialog copy explaining what happens. */
  description: string;
  destructive?: boolean;
  /** Shown but disabled, with the reason as a tooltip. */
  disabledReason?: string;
}

/**
 * The moves the API's transition map allows from the current status, filtered by the plan's
 * rules (pausable, closable early, renewable). The server re-checks every one.
 */
export function availableTransitions(sub: SubscriptionDetail, plan: Plan | undefined, today: string): TransitionAction[] {
  const closeBlocked =
    plan && !plan.closableEarly && sub.expiryDate && today < sub.expiryDate
      ? `The ${plan.name} plan can't be closed before its expiry date`
      : undefined;
  const close: TransitionAction = {
    to: "closed",
    label: "Close",
    description: "Ends the subscription. No further invoices will be raised.",
    destructive: true,
    disabledReason: closeBlocked,
  };
  const cancel: TransitionAction = {
    to: "cancelled",
    label: "Cancel",
    description: "Cancels it before it starts. This can't be undone.",
    destructive: true,
  };
  const quotationExpired =
    sub.quotationExpiresAt !== null && new Date(sub.quotationExpiresAt).getTime() <= Date.now()
      ? "This quotation has expired and can't be confirmed"
      : undefined;

  switch (sub.status) {
    case "draft":
      return [
        { to: "quotation", label: "Send as quotation", description: "Moves the draft to quotation so the customer can accept it." },
        cancel,
      ];
    case "quotation":
      return [
        {
          to: "confirmed",
          label: "Confirm",
          description: "Records that the customer accepted the quotation.",
          disabledReason: quotationExpired,
        },
        { to: "draft", label: "Back to draft", description: "Returns the quotation to draft for changes." },
        cancel,
      ];
    case "confirmed":
      return [
        {
          to: "active",
          label: "Activate",
          description: "Starts billing from the start date (or today, if that has passed).",
        },
        cancel,
      ];
    case "active":
      return [
        ...(plan?.pausable
          ? [{ to: "paused" as const, label: "Pause", description: "Stops billing until resumed. Periods while paused are not billed." }]
          : []),
        ...(plan?.renewable && sub.expiryDate
          ? [{ to: "renew" as const, label: "Renew", description: "Extends the expiry date, by one plan period unless you pick a date." }]
          : []),
        close,
      ];
    case "paused":
      return [{ to: "active", label: "Resume", description: "Restarts billing from the next period." }, close];
    default:
      return [];
  }
}
