// Integer-paise arithmetic. Products are done in BigInt so a * b never loses precision.

/** round(a * b / c), halves rounded up. a, b >= 0 and c > 0. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c <= 0) throw new RangeError("divisor must be positive");
  const big = BigInt(a) * BigInt(b);
  const div = BigInt(c);
  return Number((big * 2n + div) / (div * 2n));
}

/** Basis-point share of `amount`, rounded half up: bps(100_000, 1800) = 18_000. */
export function bpsOf(amount: number, bps: number): number {
  return mulDivRound(amount, bps, 10_000);
}

/**
 * Splits `total` across `weights` in proportion, in whole paise, so the parts always
 * sum to `total` exactly (largest-remainder method; ties go to the earlier weight).
 * All-zero weights put everything on the first entry.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map((_, i) => (i === 0 ? total : 0));

  const bigTotal = BigInt(total);
  const bigSum = BigInt(sum);
  const parts = weights.map((w) => {
    const product = bigTotal * BigInt(w);
    return { floor: Number(product / bigSum), remainder: product % bigSum };
  });
  let left = total - parts.reduce((a, p) => a + p.floor, 0);
  const order = parts
    .map((p, i) => ({ i, r: p.remainder }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const result = parts.map((p) => p.floor);
  for (const { i } of order) {
    if (left <= 0) break;
    result[i]! += 1;
    left -= 1;
  }
  return result;
}
