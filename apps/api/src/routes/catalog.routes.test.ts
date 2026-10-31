import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSellable } from "../services/plan.service.js";
import { isTaxEffective } from "../services/tax.service.js";
import { variantPrice } from "../services/catalog.service.js";
import { createDbTestApp, pool, uniq } from "../test/db-app.js";

let ctx: Awaited<ReturnType<typeof createDbTestApp>>;
let admin: Awaited<ReturnType<typeof ctx.signIn>>;
let staff: Awaited<ReturnType<typeof ctx.signIn>>;

beforeAll(async () => {
  ctx = await createDbTestApp();
  admin = await ctx.signIn("admin");
  staff = await ctx.signIn("staff");
});

afterAll(() => pool.end());

describe("variantPrice()", () => {
  it("adds every price extra to the product sales price", () => {
    expect(variantPrice(100_000, [56_000])).toBe(156_000);
    expect(variantPrice(100_000, [56_000, 25_000, 0])).toBe(181_000);
    expect(variantPrice(100_000, [])).toBe(100_000);
  });
});

describe("products, attributes and variants", () => {
  it("prices the Odoo variant of a 100000 paise product at 156000 and recomputes on change", async () => {
    const product = (await admin.post("/api/products", { name: `ERP ${uniq()}`, basePricePaise: 100_000 })).body
      .product;
    const attr = await admin.post(`/api/products/${product.id}/attributes`, {
      name: "Brand",
      values: [
        { value: "Odoo", priceExtraPaise: 56_000 },
        { value: "Generic", priceExtraPaise: 0 },
      ],
    });
    expect(attr.status).toBe(201);
    const odoo = attr.body.attribute.values.find((v: { value: string }) => v.value === "Odoo");

    const created = await admin.post("/api/variants", {
      productId: product.id,
      name: "ERP – Odoo",
      attributeValueIds: [odoo.id],
    });
    expect(created.status).toBe(201);
    expect(created.body.variant.pricePaise).toBe(156_000);

    // Product price change flows through.
    await admin.patch(`/api/products/${product.id}`, { basePricePaise: 120_000 });
    expect((await staff.get(`/api/variants/${created.body.variant.id}`)).body.variant.pricePaise).toBe(176_000);

    // Price extra change flows through.
    await admin.patch(`/api/products/${product.id}/attributes/${attr.body.attribute.id}/values/${odoo.id}`, {
      priceExtraPaise: 60_000,
    });
    const listed = await staff.get(`/api/variants?productId=${product.id}`);
    expect(listed.body).toMatchObject({ total: 1, tookMs: expect.any(Number) });
    expect(listed.body.data[0].pricePaise).toBe(180_000);
  });

  it("rejects two values of the same attribute on one variant", async () => {
    const product = (await admin.post("/api/products", { name: `Host ${uniq()}`, basePricePaise: 5_000 })).body.product;
    const attr = (
      await admin.post(`/api/products/${product.id}/attributes`, {
        name: "Region",
        values: [{ value: "Mumbai" }, { value: "Singapore", priceExtraPaise: 2_500 }],
      })
    ).body.attribute;
    const res = await admin.post("/api/variants", {
      productId: product.id,
      name: "Both",
      attributeValueIds: attr.values.map((v: { id: string }) => v.id),
    });
    expect(res.status).toBe(400);
  });

  it("stores default taxes on the product and rejects unknown ones", async () => {
    const tax = (await admin.post("/api/taxes", { name: `GST ${uniq()}`, rateBps: 1800, effectiveFrom: "2017-07-01" }))
      .body.tax;
    const ok = await admin.post("/api/products", { name: `P ${uniq()}`, basePricePaise: 1, taxIds: [tax.id] });
    expect(ok.body.product.taxIds).toEqual([tax.id]);
    const bad = await admin.post("/api/products", {
      name: `P ${uniq()}`,
      basePricePaise: 1,
      taxIds: ["6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b"],
    });
    expect(bad.status).toBe(400);
  });

  it("paginates products as { data, total, tookMs }", async () => {
    const tag = uniq();
    for (let i = 0; i < 3; i++) await admin.post("/api/products", { name: `Page ${tag} ${i}`, basePricePaise: i });
    const res = await staff.get(`/api/products?q=${tag}&pageSize=2&sort=-basePricePaise`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.data.map((p: { basePricePaise: number }) => p.basePricePaise)).toEqual([2, 1]);
    expect(typeof res.body.tookMs).toBe("number");
  });

  it("lets staff read but not write, and keeps customers out", async () => {
    expect((await staff.get("/api/products")).status).toBe(200);
    expect((await staff.post("/api/products", { name: "x", basePricePaise: 1 })).status).toBe(403);
    expect((await staff.post("/api/taxes", { name: "x", rateBps: 1, effectiveFrom: "2026-01-01" })).status).toBe(403);
    expect((await staff.post("/api/plans", { name: "x", interval: "monthly" })).status).toBe(403);
    const customer = await ctx.signIn("customer");
    expect((await customer.get("/api/products")).status).toBe(403);
    expect((await customer.get("/api/variants")).status).toBe(403);
  });
});

describe("taxes", () => {
  it("isTaxEffective() treats both ends as inclusive and ignores inactive taxes", () => {
    const tax = { isActive: true, effectiveFrom: "2026-04-01", effectiveTo: "2026-09-30" };
    expect(isTaxEffective(tax, "2026-03-31")).toBe(false);
    expect(isTaxEffective(tax, "2026-04-01")).toBe(true);
    expect(isTaxEffective(tax, "2026-09-30")).toBe(true);
    expect(isTaxEffective(tax, "2026-10-01")).toBe(false);
    expect(isTaxEffective({ ...tax, effectiveTo: null }, "2099-01-01")).toBe(true);
    expect(isTaxEffective({ ...tax, isActive: false }, "2026-05-01")).toBe(false);
  });

  it("applicableRates() filters by effective date and active flag", async () => {
    const tag = uniq();
    const old = (
      await admin.post("/api/taxes", { name: `${tag} old 12%`, rateBps: 1200, effectiveFrom: "2017-07-01", effectiveTo: "2026-06-30" })
    ).body.tax;
    const current = (
      await admin.post("/api/taxes", { name: `${tag} new 18%`, rateBps: 1800, effectiveFrom: "2026-07-01" })
    ).body.tax;
    const inactive = (
      await admin.post("/api/taxes", { name: `${tag} off`, rateBps: 500, effectiveFrom: "2017-07-01", isActive: false })
    ).body.tax;
    const ids = [old.id, current.id, inactive.id];
    const { taxService } = ctx.domain;

    expect((await taxService.applicableRates(ids, "2026-06-30")).map((r) => r.rateBps)).toEqual([1200]);
    expect((await taxService.applicableRates(ids, "2026-07-01")).map((r) => r.rateBps)).toEqual([1800]);
    expect(await taxService.applicableRates(ids, "2017-06-30")).toEqual([]);
    expect(await taxService.applicableRates([current.id], "2026-08-01")).toEqual([
      { taxId: current.id, name: `${tag} new 18%`, rateBps: 1800, inclusive: false },
    ]);

    const listed = await staff.get(`/api/taxes?effectiveOn=2026-06-30&pageSize=100`);
    const names = listed.body.data.map((t: { name: string }) => t.name);
    expect(names).toContain(`${tag} old 12%`);
    expect(names).not.toContain(`${tag} new 18%`);
  });

  it("rejects an end date before the start date", async () => {
    const res = await admin.post("/api/taxes", {
      name: "bad",
      rateBps: 100,
      effectiveFrom: "2026-05-01",
      effectiveTo: "2026-04-01",
    });
    expect(res.status).toBe(400);
  });
});

describe("plans", () => {
  it("accepts Odoo interval names and stores the price", async () => {
    const res = await admin.post("/api/plans", { name: `Monthly ${uniq()}`, interval: "monthly", pricePaise: 99_900 });
    expect(res.status).toBe(201);
    expect(res.body.plan).toMatchObject({ interval: "month", pricePaise: 99_900, intervalCount: 1, minQuantity: 1 });
  });

  it("isSellable() checks the active flag and both availability bounds", () => {
    const plan = { isActive: true, availableFrom: "2026-01-01", availableTo: "2026-12-31" };
    expect(isSellable(plan, "2025-12-31")).toBe(false);
    expect(isSellable(plan, "2026-01-01")).toBe(true);
    expect(isSellable(plan, "2026-12-31")).toBe(true);
    expect(isSellable(plan, "2027-01-01")).toBe(false);
    expect(isSellable({ ...plan, isActive: false }, "2026-06-01")).toBe(false);
    expect(isSellable({ isActive: true, availableFrom: null, availableTo: null }, "2099-01-01")).toBe(true);
  });

  it("filters plans sellable on a date", async () => {
    const tag = uniq();
    await admin.post("/api/plans", { name: `Trial ${tag}`, interval: "weekly", availableFrom: "2026-01-01", availableTo: "2026-12-31" });
    const inside = await staff.get(`/api/plans?q=${tag}&sellableOn=2026-06-01`);
    const outside = await staff.get(`/api/plans?q=${tag}&sellableOn=2027-06-01`);
    expect(inside.body.total).toBe(1);
    expect(outside.body.total).toBe(0);
  });
});
