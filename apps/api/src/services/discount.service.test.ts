import type { DiscountRule } from "@brightloop/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, discountRules } from "../db/schema/index.js";
import { allocate, bpsOf, mulDivRound } from "../lib/money.js";
import { createDbTestApp, db, pool, uniq } from "../test/db-app.js";
import { computeDiscounts, isUsable } from "./discount.service.js";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";

function rule(overrides: Partial<DiscountRule> = {}): DiscountRule {
  return {
    id: uniq(),
    name: "Rule",
    code: null,
    type: "percent",
    value: 1000,
    minAmountPaise: 0,
    minQty: 1,
    validFrom: null,
    validTo: null,
    usageLimit: null,
    usedCount: 0,
    scope: "subscription",
    productId: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const lines = [
  { productId: P1, quantity: 2, amountPaise: 60_000 },
  { productId: P2, quantity: 1, amountPaise: 40_000 },
];
const input = { lines, subtotal: 100_000, qty: 3, date: "2026-06-15" };

describe("money helpers", () => {
  it("rounds half up and stays exact for large amounts", () => {
    expect(mulDivRound(5, 1, 2)).toBe(3);
    expect(mulDivRound(4, 1, 3)).toBe(1);
    expect(bpsOf(100_000, 1800)).toBe(18_000);
    expect(bpsOf(9_007_199_254_740, 9999)).toBe(9_006_298_534_815);
  });

  it("allocates so the parts always sum to the total", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10_001, [60_000, 40_000])).toEqual([6_001, 4_000]);
    expect(allocate(5, [0, 0])).toEqual([5, 0]);
  });
});

describe("computeDiscounts()", () => {
  it("ignores expired and not-yet-valid rules (validity is inclusive)", () => {
    const expired = rule({ validTo: "2026-06-14" });
    const lastDay = rule({ validTo: "2026-06-15" });
    const future = rule({ validFrom: "2026-06-16" });
    expect(isUsable(expired, input.date)).toBe(false);
    expect(computeDiscounts([expired, future], input)).toEqual([]);
    expect(computeDiscounts([lastDay], input).map((d) => d.amountPaise)).toEqual([10_000]);
  });

  it("ignores exhausted and inactive rules", () => {
    expect(computeDiscounts([rule({ usageLimit: 3, usedCount: 3 })], input)).toEqual([]);
    expect(computeDiscounts([rule({ isActive: false })], input)).toEqual([]);
    expect(computeDiscounts([rule({ usageLimit: 3, usedCount: 2 })], input)).toHaveLength(1);
  });

  it("applies min_qty at the boundary: equal passes, one below fails", () => {
    expect(computeDiscounts([rule({ minQty: 3 })], input)).toHaveLength(1);
    expect(computeDiscounts([rule({ minQty: 4 })], input)).toEqual([]);
    // Product scope counts only that product's quantity.
    expect(computeDiscounts([rule({ scope: "product", productId: P1, minQty: 2 })], input)).toHaveLength(1);
    expect(computeDiscounts([rule({ scope: "product", productId: P1, minQty: 3 })], input)).toEqual([]);
  });

  it("applies min_amount at the boundary", () => {
    expect(computeDiscounts([rule({ minAmountPaise: 100_000 })], input)).toHaveLength(1);
    expect(computeDiscounts([rule({ minAmountPaise: 100_001 })], input)).toEqual([]);
  });

  it("rounds percent discounts half up to the paise", () => {
    const one = { lines: [{ productId: P1, quantity: 1, amountPaise: 999 }], subtotal: 999, qty: 1, date: input.date };
    // 999 × 12.5% = 124.875 → 125; 999 × 5% = 49.95 → 50; 10 × 15% = 1.5 → 2.
    expect(computeDiscounts([rule({ value: 1250 })], one)[0]!.amountPaise).toBe(125);
    expect(computeDiscounts([rule({ value: 500 })], one)[0]!.amountPaise).toBe(50);
    const ten = { ...one, lines: [{ productId: P1, quantity: 1, amountPaise: 10 }], subtotal: 10 };
    expect(computeDiscounts([rule({ value: 1500 })], ten)[0]!.amountPaise).toBe(2);
  });

  it("caps fixed discounts at what is left and applies product rules first", () => {
    const productRule = rule({ scope: "product", productId: P2, type: "fixed", value: 50_000 });
    const orderRule = rule({ type: "percent", value: 1000 });
    const [first, second] = computeDiscounts([orderRule, productRule], input);
    expect(first!.rule).toBe(productRule);
    expect(first!.amountPaise).toBe(40_000);
    expect(first!.allocations).toEqual([0, 40_000]);
    // 10% of the remaining 60_000.
    expect(second!.amountPaise).toBe(6_000);
    expect(second!.allocations).toEqual([6_000, 0]);
  });

  it("only applies coded rules when the code is given", () => {
    const coded = rule({ code: "DIWALI10" });
    expect(computeDiscounts([coded], input)).toEqual([]);
    expect(computeDiscounts([coded], { ...input, codes: ["diwali10"] })).toHaveLength(1);
  });
});

describe("discount rules API and consume()", () => {
  let ctx: Awaited<ReturnType<typeof createDbTestApp>>;
  let admin: Awaited<ReturnType<typeof ctx.signIn>>;

  beforeAll(async () => {
    ctx = await createDbTestApp();
    admin = await ctx.signIn("admin");
  });

  afterAll(() => pool.end());

  const newRule = (overrides: object = {}) => ({
    name: `Rule ${uniq()}`,
    // Coded, so these test rules are never auto-applied by other tests' billing runs.
    code: `T${uniq().toUpperCase()}`,
    type: "percent",
    value: 1000,
    ...overrides,
  });

  it("is admin-only, including reads", async () => {
    const staff = await ctx.signIn("staff");
    expect((await staff.get("/api/discounts")).status).toBe(403);
    expect((await staff.post("/api/discounts", newRule())).status).toBe(403);
    expect((await admin.get("/api/discounts")).status).toBe(200);
  });

  it("creates, updates and deletes with an audit row for each write", async () => {
    const created = await admin.post("/api/discounts", newRule({ usageLimit: 5 }));
    expect(created.status).toBe(201);
    expect(created.body.discount).toMatchObject({ type: "percent", scope: "subscription", usedCount: 0, usageLimit: 5 });
    const id = created.body.discount.id;

    expect((await admin.patch(`/api/discounts/${id}`, { value: 1500 })).body.discount.value).toBe(1500);
    expect((await admin.patch(`/api/discounts/${id}`, { value: 20_000 })).status).toBe(400);
    expect((await admin.delete(`/api/discounts/${id}`)).status).toBe(204);

    const actions = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "discount_rule"), eq(auditLog.entityId, id)));
    expect(actions.map((a) => a.action).sort()).toEqual([
      "discount_rule.created",
      "discount_rule.deleted",
      "discount_rule.updated",
    ]);
  });

  it("requires a product for product scope", async () => {
    const res = await admin.post("/api/discounts", newRule({ scope: "product" }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.productId).toBeDefined();
  });

  it("consume() increments used_count and throws once exhausted", async () => {
    const { discountService } = ctx.domain;
    const id = (await admin.post("/api/discounts", newRule({ usageLimit: 2 }))).body.discount.id;

    await db.transaction((tx) => discountService.consume(id, tx));
    await db.transaction((tx) => discountService.consume(id, tx));
    await expect(db.transaction((tx) => discountService.consume(id, tx))).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("no uses left"),
    });
    const [row] = await db.select().from(discountRules).where(eq(discountRules.id, id));
    expect(row!.usedCount).toBe(2);
  });

  it("consume() holds the limit under concurrency (SELECT ... FOR UPDATE)", async () => {
    const { discountService } = ctx.domain;
    const id = (await admin.post("/api/discounts", newRule({ usageLimit: 3 }))).body.discount.id;

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => db.transaction((tx) => discountService.consume(id, tx))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
    const [row] = await db.select().from(discountRules).where(eq(discountRules.id, id));
    expect(row!.usedCount).toBe(3);
  });

  it("eligible() reads usable rules from the database", async () => {
    const product = (await admin.post("/api/products", { name: `Disc ${uniq()}`, basePricePaise: 10_000 })).body.product;
    const code = `E${uniq().toUpperCase()}`;
    await admin.post("/api/discounts", {
      name: "Product 5%",
      code,
      type: "percent",
      value: 500,
      scope: "product",
      productId: product.id,
      minQty: 2,
    });
    const lines = [{ productId: product.id, quantity: 2, amountPaise: 20_000 }];
    const base = { lines, subtotal: 20_000, qty: 2, date: "2026-06-15" };

    const found = await ctx.domain.discountService.eligible({ ...base, codes: [code] });
    const mine = found.filter((d) => d.rule.code === code);
    expect(mine.map((d) => d.amountPaise)).toEqual([1_000]);
    expect(
      (await ctx.domain.discountService.eligible({ ...base, lines: [{ ...lines[0]!, quantity: 1 }], qty: 1, codes: [code] }))
        .filter((d) => d.rule.code === code),
    ).toEqual([]);
  });
});
