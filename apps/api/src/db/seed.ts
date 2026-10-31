import { createCustomerSchema, passwordSchema } from "@brightloop/shared";
import { sql } from "drizzle-orm";
import * as data from "../../../../database/seed/data.js";
import { createPasswordHasher } from "../lib/password.js";
import { writeAudit } from "../repositories/audit.repository.js";
import { db, pool } from "./client.js";
import {
  attributeValues,
  customers,
  productAttributes,
  products,
  productVariants,
  quotationTemplates,
  recurringPlans,
  settings,
  taxes,
  templateLines,
  users,
  variantAttributeValues,
} from "./schema/index.js";

// Runs on every container start. The settings row is always ensured; everything else
// is seeded once, in one transaction, and skipped when the seed admin already exists.

await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
console.log("settings row ensured");

const [existingAdmin] = await db
  .select({ id: users.id })
  .from(users)
  .where(sql`lower(${users.email}) = ${data.admin.email}`)
  .limit(1);

if (existingAdmin) {
  console.log(`seed skipped: ${data.admin.email} already exists`);
} else {
  for (const password of Object.values(data.SEED_PASSWORDS)) passwordSchema.parse(password);
  const seedCustomers = data.customers.map((c) => createCustomerSchema.parse(c));

  const hasher = createPasswordHasher(12);
  const [adminHash, staffHash, customerHash] = await Promise.all([
    hasher.hash(data.SEED_PASSWORDS.admin),
    hasher.hash(data.SEED_PASSWORDS.staff),
    hasher.hash(data.SEED_PASSWORDS.customer),
  ]);

  const counts = await db.transaction(async (tx) => {
    // Back-office users, each with a staff.created audit row (system actor).
    const backOffice = await tx
      .insert(users)
      .values([
        { ...data.admin, passwordHash: adminHash!, role: "admin" as const },
        ...data.staff.map((s) => ({ ...s, passwordHash: staffHash!, role: "staff" as const })),
      ])
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
    for (const user of backOffice) {
      await writeAudit(tx, {
        actorUserId: null,
        action: "staff.created",
        entityType: "user",
        entityId: user.id,
        before: null,
        after: { ...user, customerId: null, isActive: true, source: "seed" },
      });
    }

    // Customers, each with a portal user on the same email.
    const customerRows = await tx.insert(customers).values(seedCustomers).returning({
      id: customers.id,
      name: customers.name,
      email: customers.email,
    });
    await tx.insert(users).values(
      customerRows.map((c) => ({
        name: c.name,
        email: c.email,
        passwordHash: customerHash!,
        role: "customer" as const,
        customerId: c.id,
      })),
    );

    await tx.insert(taxes).values([...data.taxes]);

    // Attributes and their values, keyed "Attribute:Value" for the variants below.
    const valueIds = new Map<string, string>();
    for (const attribute of data.attributes) {
      const [row] = await tx
        .insert(productAttributes)
        .values({ name: attribute.name })
        .returning({ id: productAttributes.id });
      const values = await tx
        .insert(attributeValues)
        .values(attribute.values.map((v) => ({ ...v, attributeId: row!.id })))
        .returning({ id: attributeValues.id, value: attributeValues.value });
      for (const v of values) valueIds.set(`${attribute.name}:${v.value}`, v.id);
    }

    const variantIds = new Map<string, { productId: string; variantId: string }>();
    for (const { variants, ...product } of data.products) {
      const [productRow] = await tx.insert(products).values(product).returning({ id: products.id });
      for (const { values, ...variant } of variants) {
        const [variantRow] = await tx
          .insert(productVariants)
          .values({ ...variant, productId: productRow!.id })
          .returning({ id: productVariants.id });
        await tx.insert(variantAttributeValues).values(
          values.map(([attribute, value]) => {
            const attributeValueId = valueIds.get(`${attribute}:${value}`);
            if (!attributeValueId) throw new Error(`Unknown attribute value ${attribute}:${value}`);
            return { variantId: variantRow!.id, attributeValueId };
          }),
        );
        variantIds.set(variant.sku, { productId: productRow!.id, variantId: variantRow!.id });
      }
    }

    const planRows = await tx
      .insert(recurringPlans)
      .values(data.plans.map((p) => ({ ...p })))
      .returning({ id: recurringPlans.id, name: recurringPlans.name });
    const planIds = new Map(planRows.map((p) => [p.name, p.id]));

    for (const { lines, plan, ...template } of data.quotationTemplates) {
      const [templateRow] = await tx
        .insert(quotationTemplates)
        .values({ ...template, recurringPlanId: planIds.get(plan) })
        .returning({ id: quotationTemplates.id });
      await tx.insert(templateLines).values(
        lines.map((line, sortOrder) => {
          const ids = variantIds.get(line.variantSku);
          if (!ids) throw new Error(`Unknown variant SKU ${line.variantSku}`);
          return { templateId: templateRow!.id, ...ids, quantity: line.quantity, sortOrder };
        }),
      );
    }

    return {
      backOffice: backOffice.length,
      customers: customerRows.length,
      products: data.products.length,
      variants: variantIds.size,
      plans: planRows.length,
      templates: data.quotationTemplates.length,
    };
  });

  console.log(
    `seeded: 1 admin + ${counts.backOffice - 1} staff, ${counts.customers} customers with portal users, ` +
      `${data.taxes.length} taxes, ${counts.products} products / ${counts.variants} variants, ` +
      `${counts.plans} plans, ${counts.templates} quotation templates`,
  );
}

await pool.end();
