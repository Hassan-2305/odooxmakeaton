import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { products, productVariants, recurringPlans } from "./catalog.js";
import { id, timestamps } from "./columns.js";

export const quotationTemplates = pgTable(
  "quotation_templates",
  {
    id: id(),
    name: text("name").notNull(),
    validityDays: integer("validity_days").notNull().default(30),
    recurringPlanId: uuid("recurring_plan_id").references(() => recurringPlans.id, {
      onDelete: "restrict",
    }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [check("quotation_templates_validity_chk", sql`${t.validityDays} >= 1`)],
);

export const templateLines = pgTable(
  "template_lines",
  {
    id: id(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => quotationTemplates.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "restrict" }),
    description: text("description"),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("template_lines_template_id_idx").on(t.templateId),
    check("template_lines_quantity_chk", sql`${t.quantity} >= 1`),
  ],
);
