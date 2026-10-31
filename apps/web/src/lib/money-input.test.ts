import { describe, expect, it } from "vitest";
import { formatScaled, parseScaled } from "./money-input";

describe("parseScaled", () => {
  it("parses rupees into exact paise", () => {
    expect(parseScaled("0.29")).toBe(29);
    expect(parseScaled("1,234.5")).toBe(123450);
    expect(parseScaled("₹ 560")).toBe(56000);
    expect(parseScaled("18%")).toBe(1800);
  });
  it("rejects bad input", () => {
    expect(parseScaled("")).toBeNaN();
    expect(parseScaled("1.234")).toBeNaN();
    expect(parseScaled("-5")).toBeNaN();
    expect(parseScaled("abc")).toBeNaN();
  });
  it("round-trips", () => {
    for (const n of [0, 5, 100, 123450, 99999]) expect(parseScaled(formatScaled(n))).toBe(n);
  });
});
