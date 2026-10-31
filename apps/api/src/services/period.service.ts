import type { Plan } from "@brightloop/shared";
import { addDays, addMonthsAnchored } from "../lib/dates.js";

export type PeriodPlan = Pick<Plan, "interval" | "intervalCount">;

/**
 * The start of the period after the one starting on `date`. Day and week intervals
 * add days; month and year intervals land on `anchorDay`, clamped to the month's
 * length (anchor 31: Jan 31 → Feb 28/29 → Mar 31).
 */
export function nextPeriodStart(date: string, plan: PeriodPlan, anchorDay: number): string {
  switch (plan.interval) {
    case "day":
      return addDays(date, plan.intervalCount);
    case "week":
      return addDays(date, 7 * plan.intervalCount);
    case "month":
      return addMonthsAnchored(date, plan.intervalCount, anchorDay);
    case "year":
      return addMonthsAnchored(date, 12 * plan.intervalCount, anchorDay);
  }
}
