import { describe, expect, it } from "vitest";
import { addMonthsAnchored, startOfDayIn, todayIn } from "../lib/dates.js";
import { computeInvoice, type PricedLine } from "./invoice-math.js";
import { nextPeriodStart } from "./period.service.js";

const monthly = { interval: "month", intervalCount: 1 } as const;

function chain(start: string, plan: Parameters<typeof nextPeriodStart>[1], anchor: number, n: number) {
  const dates = [start];
  for (let i = 0; i < n; i++) dates.push(nextPeriodStart(dates.at(-1)!, plan, anchor));
  return dates;
}

describe("nextPeriodStart()", () => {
  it("clamps month ends to the anchor day: Jan 31 → Feb 28 → Mar 31 → Apr 30", () => {
    expect(chain("2026-01-31", monthly, 31, 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("uses Feb 29 in leap years", () => {
    expect(chain("2028-01-31", monthly, 31, 2)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
    expect(chain("2024-01-30", monthly, 30, 2)).toEqual(["2024-01-30", "2024-02-29", "2024-03-30"]);
  });

  it("keeps a Feb 29 yearly anchor across non-leap years", () => {
    const yearly = { interval: "year", intervalCount: 1 } as const;
    expect(chain("2024-02-29", yearly, 29, 4)).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("handles quarterly, weekly and daily intervals and year boundaries", () => {
    expect(chain("2026-11-30", { interval: "month", intervalCount: 3 }, 30, 2)).toEqual(["2026-11-30", "2027-02-28", "2027-05-30"]);
    expect(chain("2026-12-29", { interval: "week", intervalCount: 1 }, 29, 1)).toEqual(["2026-12-29", "2027-01-05"]);
    expect(chain("2028-02-28", { interval: "day", intervalCount: 1 }, 28, 2)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("addMonthsAnchored() works backwards too", () => {
    expect(addMonthsAnchored("2026-03-31", -1, 31)).toBe("2026-02-28");
  });
});

describe("business timezone", () => {
  it("todayIn() uses the business day, not the UTC day", () => {
    // 20:00 UTC on Jun 14 is 01:30 on Jun 15 in India.
    expect(todayIn("Asia/Kolkata", new Date("2026-06-14T20:00:00Z"))).toBe("2026-06-15");
    expect(todayIn("UTC", new Date("2026-06-14T20:00:00Z"))).toBe("2026-06-14");
  });

  it("startOfDayIn() gives the UTC instant of local midnight", () => {
    expect(startOfDayIn("2026-06-15", "Asia/Kolkata").toISOString()).toBe("2026-06-14T18:30:00.000Z");
  });
});

describe("computeInvoice()", () => {
  const line = (overrides: Partial<PricedLine>): PricedLine => ({
    subscriptionLineId: null,
    productId: "p",
    variantId: null,
    description: "Line",
    quantity: 1,
    unitPricePaise: 100_000,
    rates: [],
    ...overrides,
  });
  const gst18 = { taxId: "t18", name: "GST 18%", rateBps: 1800, inclusive: false };
  const gst12incl = { taxId: "t12", name: "GST 12% incl", rateBps: 1200, inclusive: true };

  it("adds exclusive tax on top", () => {
    const inv = computeInvoice([line({ quantity: 2, unitPricePaise: 156_000, rates: [gst18] })], []);
    expect(inv).toMatchObject({ subtotalPaise: 312_000, taxTotalPaise: 56_160, totalPaise: 368_160 });
  });

  it("extracts inclusive tax so the total equals the gross price", () => {
    for (const price of [112_000, 99_999, 1, 12_345_678]) {
      const inv = computeInvoice([line({ unitPricePaise: price, rates: [gst12incl] })], []);
      expect(inv.totalPaise).toBe(price);
      expect(inv.subtotalPaise + inv.taxTotalPaise).toBe(price);
    }
    expect(computeInvoice([line({ unitPricePaise: 112_000, rates: [gst12incl] })], []).taxTotalPaise).toBe(12_000);
  });

  it("taxes the discounted amount and splits discounts per rule in net terms", () => {
    const lines = [
      line({ quantity: 2, unitPricePaise: 156_000, rates: [gst18] }),
      line({ unitPricePaise: 112_000, rates: [gst12incl] }),
    ];
    const inv = computeInvoice(lines, [
      { rule: { id: "a", name: "A" }, allocations: [31_200, 0] },
      { rule: { id: "b", name: "B" }, allocations: [0, 11_200] },
    ]);
    // Line 2: base 100_800 incl. 12% → net 90_000, tax 10_800; net discount 10_000.
    expect(inv.lines[1]).toMatchObject({ netBeforePaise: 100_000, netAfterPaise: 90_000, discountPaise: 10_000 });
    expect(inv.discounts).toEqual([
      { rule: { id: "a", name: "A" }, amountPaise: 31_200 },
      { rule: { id: "b", name: "B" }, amountPaise: 10_000 },
    ]);
    expect(inv).toMatchObject({ subtotalPaise: 412_000, discountTotalPaise: 41_200, taxTotalPaise: 61_344, totalPaise: 432_144 });
    expect(inv.totalPaise).toBe(inv.subtotalPaise - inv.discountTotalPaise + inv.taxTotalPaise);
  });
});
