import type { Paise } from "@brightloop/shared";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const count = new Intl.NumberFormat("en-IN");
const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

/**
 * Integer paise → "₹1,234.50". Division happens only here, for display; money stays
 * integer paise everywhere else.
 */
export function formatMoney(paise: Paise): string {
  return inr.format(paise / 100);
}

/** Axis labels and tiles: "₹1.2L". */
export function formatMoneyCompact(paise: Paise): string {
  return inrCompact.format(paise / 100);
}

export function formatCount(n: number): string {
  return count.format(n);
}

/** "YYYY-MM-DD" dates are calendar days; parse them at local midnight so they don't shift. */
function parse(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function formatDate(value: string | null | undefined): string {
  return value ? date.format(parse(value)) : "—";
}

export function formatShortDate(value: string): string {
  return shortDate.format(parse(value));
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(parse(value)) : "—";
}

/** "bank_transfer" → "Bank transfer". */
export function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Today as YYYY-MM-DD in the browser's timezone. */
export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** First day of the current month as YYYY-MM-DD. */
export function monthStartIso(): string {
  const d = new Date();
  return toIso(new Date(d.getFullYear(), d.getMonth(), 1));
}
