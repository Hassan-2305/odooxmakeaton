/**
 * Text ↔ integer hundredths, for rupee (paise) and percent (basis points) inputs.
 * Parses the digits directly so "0.29" is exactly 29, never a float rounding error.
 */
export function parseScaled(text: string): number {
  const t = text.replace(/[,\s₹%]/g, "");
  if (t === "") return Number.NaN;
  const m = /^(\d{1,13})(?:\.(\d{0,2}))?$/.exec(t);
  if (!m) return Number.NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function formatScaled(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const whole = Math.floor(value / 100);
  const frac = value % 100;
  return frac ? `${whole}.${String(frac).padStart(2, "0")}` : String(whole);
}

/** 1800 bps → "18%". */
export function formatBps(bps: number): string {
  return `${formatScaled(bps)}%`;
}
