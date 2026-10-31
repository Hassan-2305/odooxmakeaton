/**
 * True if Intl can format dates in `tz`. Unlike Intl.supportedValuesOf("timeZone"),
 * this accepts aliases such as Asia/Kolkata, which that list leaves out.
 */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
