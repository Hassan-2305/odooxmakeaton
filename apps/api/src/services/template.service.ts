import type {
  CreateQuotationTemplateInput,
  QuotationTemplateListQuery,
  TemplateLineInput,
  UpdateQuotationTemplateInput,
} from "@brightloop/shared";
import { isForeignKeyViolation } from "../lib/db-errors.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { CatalogRepository } from "../repositories/catalog.repository.js";
import type { PlansRepository } from "../repositories/taxes-plans.repository.js";
import type { TemplatesRepository } from "../repositories/templates.repository.js";

interface Deps {
  templates: TemplatesRepository;
  catalog: Pick<CatalogRepository, "findProduct" | "findVariant">;
  plans: Pick<PlansRepository, "findById">;
}

export function createTemplateService({ templates, catalog, plans }: Deps) {
  async function assertLines(tx: DbOrTx, lines: TemplateLineInput[]) {
    for (const [i, line] of lines.entries()) {
      if (!(await catalog.findProduct(line.productId, tx))) throw new BadRequestError(`Line ${i + 1}: unknown product`);
      if (line.variantId) {
        const variant = await catalog.findVariant(line.variantId, tx);
        if (!variant || variant.productId !== line.productId) {
          throw new BadRequestError(`Line ${i + 1}: the variant does not belong to the product`);
        }
      }
    }
  }

  async function assertPlan(tx: DbOrTx, planId: string | null | undefined) {
    if (planId && !(await plans.findById(planId, tx))) throw new BadRequestError("Unknown recurring plan");
  }

  return {
    list: (query: QuotationTemplateListQuery) => templates.list(query),

    async get(id: string) {
      const template = await templates.findById(id);
      if (!template) throw new NotFoundError("Quotation template");
      return template;
    },

    create: ({ lines, ...values }: CreateQuotationTemplateInput) =>
      templates.transaction(async (tx) => {
        await assertPlan(tx, values.recurringPlanId);
        await assertLines(tx, lines);
        const id = await templates.insert(tx, values);
        await templates.replaceLines(tx, id, lines);
        return (await templates.findById(id, tx))!;
      }),

    update: (id: string, { lines, ...values }: UpdateQuotationTemplateInput) =>
      templates.transaction(async (tx) => {
        await assertPlan(tx, values.recurringPlanId);
        if (!(await templates.update(tx, id, values))) throw new NotFoundError("Quotation template");
        if (lines) {
          await assertLines(tx, lines);
          await templates.replaceLines(tx, id, lines);
        }
        return (await templates.findById(id, tx))!;
      }),

    async remove(id: string) {
      try {
        if (!(await templates.delete(id))) throw new NotFoundError("Quotation template");
      } catch (err) {
        if (isForeignKeyViolation(err)) throw new ConflictError("This template is in use. Deactivate it instead.");
        throw err;
      }
    },
  };
}

export type TemplateService = ReturnType<typeof createTemplateService>;
