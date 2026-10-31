import type {
  Attribute,
  AttributeValue,
  ListResponse,
  Product,
  ProductListQuery,
  Variant,
  VariantListQuery,
} from "@brightloop/shared";
import { and, asc, count, eq, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  attributeValues,
  productAttributes,
  products,
  productTaxes,
  productVariants,
  variantAttributeValues,
} from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

export interface ProductValues {
  name: string;
  description?: string | null;
  sku?: string | null;
  basePricePaise: number;
  isActive: boolean;
}

export interface VariantValues {
  productId: string;
  name: string;
  sku?: string | null;
  isActive: boolean;
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function toProduct(row: ProductRow, taxIds: string[]): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sku: row.sku,
    currency: row.currency,
    basePricePaise: row.basePricePaise,
    isActive: row.isActive,
    taxIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Sum of the price extras of a variant's attribute values, in paise. */
const variantExtrasSql = sql<number>`coalesce((
  select sum(${attributeValues.priceExtraPaise})
  from ${variantAttributeValues}
  join ${attributeValues} on ${attributeValues.id} = ${variantAttributeValues.attributeValueId}
  where ${variantAttributeValues.variantId} = ${productVariants.id}
), 0)::bigint`.mapWith(Number);

const productSortColumns = {
  name: products.name,
  basePricePaise: products.basePricePaise,
  createdAt: products.createdAt,
};

const variantSortColumns = { name: productVariants.name, createdAt: productVariants.createdAt };

export function createCatalogRepository(db: Db) {
  async function taxIdsFor(tx: DbOrTx, productIds: string[]) {
    const map = new Map<string, string[]>();
    if (!productIds.length) return map;
    const rows = await tx
      .select()
      .from(productTaxes)
      .where(inArray(productTaxes.productId, productIds));
    for (const row of rows) (map.get(row.productId) ?? map.set(row.productId, []).get(row.productId)!).push(row.taxId);
    return map;
  }

  async function valuesFor(tx: DbOrTx, variantIds: string[]) {
    const map = new Map<string, Variant["attributeValues"]>();
    if (!variantIds.length) return map;
    const rows = await tx
      .select({
        variantId: variantAttributeValues.variantId,
        id: attributeValues.id,
        attributeId: attributeValues.attributeId,
        attributeName: productAttributes.name,
        value: attributeValues.value,
        priceExtraPaise: attributeValues.priceExtraPaise,
      })
      .from(variantAttributeValues)
      .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
      .innerJoin(productAttributes, eq(productAttributes.id, attributeValues.attributeId))
      .where(inArray(variantAttributeValues.variantId, variantIds))
      .orderBy(asc(productAttributes.name));
    for (const { variantId, ...value } of rows) {
      (map.get(variantId) ?? map.set(variantId, []).get(variantId)!).push(value);
    }
    return map;
  }

  const variantSelect = {
    variant: productVariants,
    productName: products.name,
    basePricePaise: products.basePricePaise,
    extrasPaise: variantExtrasSql,
  };

  function toVariant(
    row: { variant: VariantRow; productName: string; basePricePaise: number; extrasPaise: number },
    values: Variant["attributeValues"],
  ): Variant {
    return {
      id: row.variant.id,
      productId: row.variant.productId,
      productName: row.productName,
      name: row.variant.name,
      sku: row.variant.sku,
      isActive: row.variant.isActive,
      pricePaise: row.basePricePaise + row.extrasPaise,
      attributeValues: values,
      createdAt: row.variant.createdAt.toISOString(),
      updatedAt: row.variant.updatedAt.toISOString(),
    };
  }

  const repo = {
    // Products

    async listProducts(query: ProductListQuery): Promise<ListResponse<Product>> {
      const filters: SQL[] = [];
      if (query.q) {
        const pattern = likePattern(query.q);
        filters.push(or(ilike(products.name, pattern), ilike(products.sku, pattern))!);
      }
      if (query.isActive !== undefined) filters.push(eq(products.isActive, query.isActive));
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, productSortColumns), products.id];

      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db.select().from(products).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(products).where(where),
        ]);
        const taxes = await taxIdsFor(db, rows.map((r) => r.id));
        return { rows: rows.map((r) => toProduct(r, taxes.get(r.id) ?? [])), total: totalRow?.total ?? 0 };
      });
    },

    async findProduct(id: string, tx: DbOrTx = db): Promise<Product | undefined> {
      const [row] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
      if (!row) return undefined;
      return toProduct(row, (await taxIdsFor(tx, [id])).get(id) ?? []);
    },

    async insertProduct(tx: DbOrTx, values: ProductValues): Promise<string> {
      const [row] = await tx.insert(products).values(values).returning({ id: products.id });
      return row!.id;
    },

    async updateProduct(tx: DbOrTx, id: string, values: Partial<ProductValues>): Promise<boolean> {
      const rows = await tx
        .update(products)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning({ id: products.id });
      return rows.length > 0;
    },

    async setProductTaxes(tx: DbOrTx, productId: string, taxIds: string[]) {
      await tx.delete(productTaxes).where(eq(productTaxes.productId, productId));
      if (taxIds.length) await tx.insert(productTaxes).values(taxIds.map((taxId) => ({ productId, taxId })));
    },

    async deleteProduct(id: string): Promise<boolean> {
      const rows = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
      return rows.length > 0;
    },

    // Attributes

    /** Global attributes plus the product's own, each with its values. */
    async listAttributesForProduct(productId: string, tx: DbOrTx = db): Promise<Attribute[]> {
      const attrs = await tx
        .select()
        .from(productAttributes)
        .where(or(isNull(productAttributes.productId), eq(productAttributes.productId, productId)))
        .orderBy(asc(productAttributes.name));
      if (!attrs.length) return [];
      const values = await tx
        .select()
        .from(attributeValues)
        .where(inArray(attributeValues.attributeId, attrs.map((a) => a.id)))
        .orderBy(asc(attributeValues.value));
      return attrs.map((a) => ({
        id: a.id,
        productId: a.productId,
        name: a.name,
        values: values
          .filter((v) => v.attributeId === a.id)
          .map(({ id, attributeId, value, priceExtraPaise }) => ({ id, attributeId, value, priceExtraPaise })),
      }));
    },

    async findAttribute(id: string, tx: DbOrTx = db) {
      const [row] = await tx.select().from(productAttributes).where(eq(productAttributes.id, id)).limit(1);
      return row;
    },

    async insertAttribute(tx: DbOrTx, productId: string, name: string): Promise<string> {
      const [row] = await tx
        .insert(productAttributes)
        .values({ productId, name })
        .returning({ id: productAttributes.id });
      return row!.id;
    },

    async renameAttribute(tx: DbOrTx, id: string, name: string) {
      await tx.update(productAttributes).set({ name }).where(eq(productAttributes.id, id));
    },

    async deleteAttribute(id: string): Promise<boolean> {
      const rows = await db
        .delete(productAttributes)
        .where(eq(productAttributes.id, id))
        .returning({ id: productAttributes.id });
      return rows.length > 0;
    },

    async insertValues(tx: DbOrTx, attributeId: string, values: { value: string; priceExtraPaise: number }[]) {
      if (!values.length) return;
      await tx.insert(attributeValues).values(values.map((v) => ({ ...v, attributeId })));
    },

    async findValue(id: string, tx: DbOrTx = db): Promise<AttributeValue | undefined> {
      const [row] = await tx.select().from(attributeValues).where(eq(attributeValues.id, id)).limit(1);
      return row && { id: row.id, attributeId: row.attributeId, value: row.value, priceExtraPaise: row.priceExtraPaise };
    },

    async updateValue(tx: DbOrTx, id: string, values: { value?: string; priceExtraPaise?: number }) {
      await tx.update(attributeValues).set(values).where(eq(attributeValues.id, id));
    },

    async deleteValue(id: string): Promise<boolean> {
      const rows = await db.delete(attributeValues).where(eq(attributeValues.id, id)).returning({ id: attributeValues.id });
      return rows.length > 0;
    },

    /** Values by id with their attribute's owning product (null = global). */
    async findValuesWithAttributes(tx: DbOrTx, ids: string[]) {
      if (!ids.length) return [];
      return tx
        .select({
          id: attributeValues.id,
          attributeId: attributeValues.attributeId,
          attributeProductId: productAttributes.productId,
        })
        .from(attributeValues)
        .innerJoin(productAttributes, eq(productAttributes.id, attributeValues.attributeId))
        .where(inArray(attributeValues.id, ids));
    },

    // Variants

    async listVariants(query: VariantListQuery): Promise<ListResponse<Variant>> {
      const filters: SQL[] = [];
      if (query.productId) filters.push(eq(productVariants.productId, query.productId));
      if (query.q) {
        const pattern = likePattern(query.q);
        filters.push(or(ilike(productVariants.name, pattern), ilike(productVariants.sku, pattern))!);
      }
      if (query.isActive !== undefined) filters.push(eq(productVariants.isActive, query.isActive));
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, variantSortColumns), productVariants.id];

      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db
            .select(variantSelect)
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(where)
            .orderBy(...orderBy)
            .limit(limit)
            .offset(offset),
          db.select({ total: count() }).from(productVariants).where(where),
        ]);
        const values = await valuesFor(db, rows.map((r) => r.variant.id));
        return { rows: rows.map((r) => toVariant(r, values.get(r.variant.id) ?? [])), total: totalRow?.total ?? 0 };
      });
    },

    /** The variant with its price recomputed from the current product price and extras. */
    async findVariant(id: string, tx: DbOrTx = db): Promise<Variant | undefined> {
      const [row] = await tx
        .select(variantSelect)
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(eq(productVariants.id, id))
        .limit(1);
      if (!row) return undefined;
      return toVariant(row, (await valuesFor(tx, [id])).get(id) ?? []);
    },

    async insertVariant(tx: DbOrTx, values: VariantValues): Promise<string> {
      const [row] = await tx.insert(productVariants).values(values).returning({ id: productVariants.id });
      return row!.id;
    },

    async updateVariant(tx: DbOrTx, id: string, values: Partial<Omit<VariantValues, "productId">>) {
      await tx
        .update(productVariants)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(productVariants.id, id));
    },

    async setVariantValues(tx: DbOrTx, variantId: string, attributeValueIds: string[]) {
      await tx.delete(variantAttributeValues).where(eq(variantAttributeValues.variantId, variantId));
      if (attributeValueIds.length) {
        await tx
          .insert(variantAttributeValues)
          .values(attributeValueIds.map((attributeValueId) => ({ variantId, attributeValueId })));
      }
    },

    async deleteVariant(id: string): Promise<boolean> {
      const rows = await db.delete(productVariants).where(eq(productVariants.id, id)).returning({ id: productVariants.id });
      return rows.length > 0;
    },

    transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => db.transaction(fn),
  };
  return repo;
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
