import type {
  AttributeValueInput,
  CreateAttributeInput,
  CreateProductInput,
  CreateVariantWithProductInput,
  ProductListQuery,
  UpdateAttributeValueInput,
  UpdateProductInput,
  UpdateVariantInput,
  VariantListQuery,
} from "@brightloop/shared";
import { isForeignKeyViolation, isUniqueViolation } from "../lib/db-errors.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { CatalogRepository } from "../repositories/catalog.repository.js";
import type { TaxesRepository } from "../repositories/taxes-plans.repository.js";

/** Variant price in paise: product sales price plus the price extra of each attribute value. */
export function variantPrice(basePricePaise: number, priceExtrasPaise: readonly number[]): number {
  return priceExtrasPaise.reduce((sum, extra) => sum + extra, basePricePaise);
}

interface Deps {
  catalog: CatalogRepository;
  taxes: Pick<TaxesRepository, "findByIds">;
}

/** Turns unique/foreign-key violations into 409s with a readable message. */
async function guard<T>(write: () => Promise<T>, messages: { unique?: string; fk?: string }): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (messages.unique && isUniqueViolation(err)) throw new ConflictError(messages.unique);
    if (messages.fk && isForeignKeyViolation(err)) throw new ConflictError(messages.fk);
    throw err;
  }
}

export function createCatalogService({ catalog, taxes }: Deps) {
  async function requireProduct(id: string, tx?: DbOrTx) {
    const product = await catalog.findProduct(id, tx);
    if (!product) throw new NotFoundError("Product");
    return product;
  }

  async function assertTaxesExist(taxIds: string[], tx?: DbOrTx) {
    const found = await taxes.findByIds(taxIds, tx);
    if (found.length !== taxIds.length) throw new BadRequestError("Unknown tax in taxIds");
  }

  /** An attribute this product may use: global, or owned by the product. */
  async function requireAttribute(productId: string, attributeId: string, tx?: DbOrTx) {
    await requireProduct(productId, tx);
    const attribute = await catalog.findAttribute(attributeId, tx);
    if (!attribute || (attribute.productId && attribute.productId !== productId)) {
      throw new NotFoundError("Attribute");
    }
    return attribute;
  }

  /** Values must belong to attributes the product can use, at most one value per attribute. */
  async function assertValuesFitProduct(tx: DbOrTx, productId: string, valueIds: string[]) {
    const values = await catalog.findValuesWithAttributes(tx, valueIds);
    if (values.length !== valueIds.length) throw new BadRequestError("Unknown attribute value");
    if (values.some((v) => v.attributeProductId && v.attributeProductId !== productId)) {
      throw new BadRequestError("Attribute value belongs to another product");
    }
    if (new Set(values.map((v) => v.attributeId)).size !== values.length) {
      throw new BadRequestError("Pick at most one value per attribute");
    }
  }

  const skuTaken = "That SKU is already used";

  return {
    // Products

    listProducts: (query: ProductListQuery) => catalog.listProducts(query),

    getProduct: (id: string) => requireProduct(id),

    async createProduct({ taxIds, ...values }: CreateProductInput) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            await assertTaxesExist(taxIds, tx);
            const id = await catalog.insertProduct(tx, values);
            await catalog.setProductTaxes(tx, id, taxIds);
            return requireProduct(id, tx);
          }),
        { unique: skuTaken },
      );
    },

    /** Variant prices are derived on read, so a new sales price applies to every variant at once. */
    async updateProduct(id: string, { taxIds, ...values }: UpdateProductInput) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            if (!(await catalog.updateProduct(tx, id, values))) throw new NotFoundError("Product");
            if (taxIds) {
              await assertTaxesExist(taxIds, tx);
              await catalog.setProductTaxes(tx, id, taxIds);
            }
            return requireProduct(id, tx);
          }),
        { unique: skuTaken },
      );
    },

    async removeProduct(id: string) {
      const deleted = await guard(() => catalog.deleteProduct(id), {
        fk: "This product is used on subscriptions, templates or invoices. Deactivate it instead.",
      });
      if (!deleted) throw new NotFoundError("Product");
    },

    // Attributes

    async listAttributes(productId: string) {
      await requireProduct(productId);
      return catalog.listAttributesForProduct(productId);
    },

    async createAttribute(productId: string, input: CreateAttributeInput) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            await requireProduct(productId, tx);
            const id = await catalog.insertAttribute(tx, productId, input.name);
            await catalog.insertValues(tx, id, input.values);
            const attributes = await catalog.listAttributesForProduct(productId, tx);
            return attributes.find((a) => a.id === id)!;
          }),
        { unique: "An attribute with that name already exists" },
      );
    },

    async renameAttribute(productId: string, attributeId: string, name: string) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            await requireAttribute(productId, attributeId, tx);
            await catalog.renameAttribute(tx, attributeId, name);
            const attributes = await catalog.listAttributesForProduct(productId, tx);
            return attributes.find((a) => a.id === attributeId)!;
          }),
        { unique: "An attribute with that name already exists" },
      );
    },

    async removeAttribute(productId: string, attributeId: string) {
      await requireAttribute(productId, attributeId);
      await guard(() => catalog.deleteAttribute(attributeId), {
        fk: "Variants use values of this attribute. Remove them from the variants first.",
      });
    },

    async addValue(productId: string, attributeId: string, input: AttributeValueInput) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            await requireAttribute(productId, attributeId, tx);
            await catalog.insertValues(tx, attributeId, [input]);
            const attributes = await catalog.listAttributesForProduct(productId, tx);
            return attributes.find((a) => a.id === attributeId)!;
          }),
        { unique: "That value already exists on this attribute" },
      );
    },

    /** Changing price_extra changes the computed price of every variant using the value. */
    async updateValue(productId: string, attributeId: string, valueId: string, input: UpdateAttributeValueInput) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            await requireAttribute(productId, attributeId, tx);
            const value = await catalog.findValue(valueId, tx);
            if (!value || value.attributeId !== attributeId) throw new NotFoundError("Attribute value");
            await catalog.updateValue(tx, valueId, input);
            return (await catalog.findValue(valueId, tx))!;
          }),
        { unique: "That value already exists on this attribute" },
      );
    },

    async removeValue(productId: string, attributeId: string, valueId: string) {
      await requireAttribute(productId, attributeId);
      const value = await catalog.findValue(valueId);
      if (!value || value.attributeId !== attributeId) throw new NotFoundError("Attribute value");
      await guard(() => catalog.deleteValue(valueId), {
        fk: "Variants use this value. Remove it from the variants first.",
      });
    },

    // Variants

    listVariants: (query: VariantListQuery) => catalog.listVariants(query),

    async getVariant(id: string) {
      const variant = await catalog.findVariant(id);
      if (!variant) throw new NotFoundError("Variant");
      return variant;
    },

    async createVariant({ attributeValueIds, ...values }: CreateVariantWithProductInput) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            await requireProduct(values.productId, tx);
            await assertValuesFitProduct(tx, values.productId, attributeValueIds);
            const id = await catalog.insertVariant(tx, values);
            await catalog.setVariantValues(tx, id, attributeValueIds);
            return (await catalog.findVariant(id, tx))!;
          }),
        { unique: skuTaken },
      );
    },

    /** Price is recomputed from the new attribute values when they change. */
    async updateVariant(id: string, { attributeValueIds, ...values }: UpdateVariantInput) {
      return guard(
        () =>
          catalog.transaction(async (tx) => {
            const existing = await catalog.findVariant(id, tx);
            if (!existing) throw new NotFoundError("Variant");
            await catalog.updateVariant(tx, id, values);
            if (attributeValueIds) {
              await assertValuesFitProduct(tx, existing.productId, attributeValueIds);
              await catalog.setVariantValues(tx, id, attributeValueIds);
            }
            return (await catalog.findVariant(id, tx))!;
          }),
        { unique: skuTaken },
      );
    },

    async removeVariant(id: string) {
      const deleted = await guard(() => catalog.deleteVariant(id), {
        fk: "This variant is used on subscriptions, templates or invoices. Deactivate it instead.",
      });
      if (!deleted) throw new NotFoundError("Variant");
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
