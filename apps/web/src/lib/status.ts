import type { StatusTone } from "./theme";

/** Default tone for the status values used across the app. Unknown values render as draft. */
const STATUS_TONES: Record<string, StatusTone> = {
  // Settled / healthy
  paid: "paid",
  active: "paid",
  completed: "paid",
  invoiced: "paid",
  resolved: "paid",
  // Waiting on something
  due_soon: "due-soon",
  confirmed: "due-soon",
  paused: "due-soon",
  running: "due-soon",
  open: "due-soon",
  // Needs attention
  overdue: "overdue",
  failed: "overdue",
  critical: "overdue",
  high: "overdue",
  // Not started / ended
  draft: "draft",
  quotation: "draft",
  closed: "draft",
  cancelled: "draft",
  skipped: "draft",
  dismissed: "draft",
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONES[status] ?? "draft";
}
