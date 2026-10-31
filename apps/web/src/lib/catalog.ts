import type { Plan, PlanInterval, Product, Tax, Variant } from "@brightloop/shared";
import { formatMoney } from "./format";
import { useOptions } from "./resources";

export const INTERVAL_LABELS: Record<PlanInterval, { single: string; plural: string; adverb: string }> = {
  day: { single: "day", plural: "days", adverb: "Daily" },
  week: { single: "week", plural: "weeks", adverb: "Weekly" },
  month: { single: "month", plural: "months", adverb: "Monthly" },
  year: { single: "year", plural: "years", adverb: "Yearly" },
};

/** "Monthly" or "Every 3 months". */
export function planCycle(p: Pick<Plan, "interval" | "intervalCount">): string {
  const l = INTERVAL_LABELS[p.interval];
  return p.intervalCount === 1 ? l.adverb : `Every ${p.intervalCount} ${l.plural}`;
}

/** "₹999.00 / month". */
export function planPrice(p: Pick<Plan, "pricePaise" | "interval" | "intervalCount">): string {
  const l = INTERVAL_LABELS[p.interval];
  return `${formatMoney(p.pricePaise)} / ${p.intervalCount === 1 ? l.single : `${p.intervalCount} ${l.plural}`}`;
}

export const useProductOptions = (params = {}) =>
  useOptions<Product>("products", "/api/products", { sort: "name", ...params });
export const useVariantOptions = (productId: string | undefined) =>
  useOptions<Variant>("variants", "/api/variants", { productId, sort: "name" }, !!productId);
export const useAllVariantOptions = () => useOptions<Variant>("variants", "/api/variants", { sort: "name" });
export const usePlanOptions = (params = {}) => useOptions<Plan>("plans", "/api/plans", { sort: "name", ...params });
export const useTaxOptions = () => useOptions<Tax>("taxes", "/api/taxes", { sort: "name" });
