import { describe, expect, it } from "vitest";
import { updateDiscountRuleSchema, updateProductSchema } from "./catalog.js";

describe("toPatchSchema", () => {
  it("does not fill in defaults, so a PATCH only touches the fields sent", () => {
    expect(updateProductSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
    expect(updateDiscountRuleSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });

  it("still validates the fields that are sent", () => {
    expect(updateProductSchema.safeParse({ basePricePaise: 10.5 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ basePricePaise: -1 }).success).toBe(false);
  });
});
