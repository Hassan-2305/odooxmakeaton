// Calendar dates as "YYYY-MM-DD" strings. Arithmetic is done on UTC midnights, which
// has no DST, so a date string means the same calendar day in any timezone.

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in `timeZone`, e.g. todayIn("Asia/Kolkata", now). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The UTC instant at which calendar day `date` starts in `timeZone`. */
export function startOfDayIn(date: string, timeZone: string): Date {
  const guess = parse(date);
  // Offset of the zone at that moment, from how the zone renders the UTC instant.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(guess.getTime() - (asIfUtc - guess.getTime()));
}

export function addDays(date: string, days: number): string {
  return format(new Date(parse(date).getTime() + days * DAY_MS));
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * Adds whole months, putting the result on `anchorDay` clamped to the month's length:
 * with anchor 31, Jan 31 → Feb 28 (29 in leap years) → Mar 31.
 */
export function addMonthsAnchored(date: string, months: number, anchorDay: number): string {
  const d = parse(date);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month1 = (total % 12) + 1;
  const day = Math.min(anchorDay, daysInMonth(year, month1));
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dayOfMonth(date: string): number {
  return parse(date).getUTCDate();
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS);
}
