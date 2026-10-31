import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCol, id, paise, timestamps, utc } from "./columns.js";
import { discountScope, discountType, planInterval } from "./enums.js";

export const products = pgTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    sku: text("sku").unique("products_sku_unique"),
    currency: currencyCol(),
    basePricePaise: paise("base_price_paise").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [check("products_base_price_chk", sql`${t.basePricePaise} >= 0`)],
);

/** Global attributes have no product; product-specific ones are only offered to that product. */
export const productAttributes = pgTable(
  "product_attributes",
  {
    id: id(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [unique("product_attributes_product_name_unique").on(t.productId, t.name).nullsNotDistinct()],
);

/** Default taxes for a product, copied onto subscription lines when they are created. */
export const productTaxes = pgTable(
  "product_taxes",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    taxId: uuid("tax_id")
      .notNull()
      .references(() => taxes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.taxId] })],
);

export const attributeValues = pgTable(
  "attribute_values",
  {
    id: id(),
    attributeId: uuid("attribute_id")
      .notNull()
      .references(() => productAttributes.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    priceExtraPaise: paise("price_extra_paise").notNull().default(0),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("attribute_values_attribute_value_unique").on(t.attributeId, t.value),
    check("attribute_values_price_extra_chk", sql`${t.priceExtraPaise} >= 0`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku").unique("product_variants_sku_unique"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("product_variants_product_id_idx").on(t.productId)],
);

export const variantAttributeValues = pgTable(
  "variant_attribute_values",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    attributeValueId: uuid("attribute_value_id")
      .notNull()
      .references(() => attributeValues.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.attributeValueId] })],
);

export const taxes = pgTable(
  "taxes",
  {
    id: id(),
    name: text("name").notNull(),
    // Basis points: 1800 = 18%.
    rateBps: integer("rate_bps").notNull(),
    inclusive: boolean("inclusive").notNull().default(false),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("taxes_rate_chk", sql`${t.rateBps} between 0 and 10000`),
    check(
      "taxes_effective_range_chk",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
);

export const recurringPlans = pgTable(
  "recurring_plans",
  {
    id: id(),
    name: text("name").notNull(),
    // Plan list price per billing period, in paise.
    pricePaise: paise("price_paise").notNull().default(0),
    interval: planInterval("interval").notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    minQuantity: integer("min_quantity").notNull().default(1),
    availableFrom: date("available_from", { mode: "string" }),
    availableTo: date("available_to", { mode: "string" }),
    autoCloseOnEnd: boolean("auto_close_on_end").notNull().default(false),
    closableEarly: boolean("closable_early").notNull().default(true),
    pausable: boolean("pausable").notNull().default(false),
    renewable: boolean("renewable").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("recurring_plans_price_chk", sql`${t.pricePaise} >= 0`),
    check("recurring_plans_interval_count_chk", sql`${t.intervalCount} >= 1`),
    check("recurring_plans_min_quantity_chk", sql`${t.minQuantity} >= 1`),
    check(
      "recurring_plans_availability_chk",
      sql`${t.availableFrom} is null or ${t.availableTo} is null or ${t.availableTo} > ${t.availableFrom}`,
    ),
  ],
);

export const discountRules = pgTable(
  "discount_rules",
  {
    id: id(),
    name: text("name").notNull(),
    code: text("code").unique("discount_rules_code_unique"),
    type: discountType("type").notNull(),
    // percentage: basis points (1000 = 10%); fixed: paise.
    value: paise("value").notNull(),
    minAmountPaise: paise("min_amount_paise").notNull().default(0),
    minQty: integer("min_qty").notNull().default(1),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    scope: discountScope("scope").notNull().default("order"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    index("discount_rules_product_id_idx").on(t.productId),
    check("discount_rules_value_chk", sql`${t.value} > 0`),
    check("discount_rules_percentage_chk", sql`${t.type} <> 'percentage' or ${t.value} <= 10000`),
    check("discount_rules_min_amount_chk", sql`${t.minAmountPaise} >= 0`),
    check("discount_rules_min_qty_chk", sql`${t.minQty} >= 1`),
    check(
      "discount_rules_validity_chk",
      sql`${t.validFrom} is null or ${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`,
    ),
    check("discount_rules_usage_limit_chk", sql`${t.usageLimit} is null or ${t.usageLimit} >= 1`),
    check(
      "discount_rules_used_count_chk",
      sql`${t.usedCount} >= 0 and (${t.usageLimit} is null or ${t.usedCount} <= ${t.usageLimit})`,
    ),
    check("discount_rules_scope_chk", sql`(${t.scope} = 'product') = (${t.productId} is not null)`),
  ],
);
