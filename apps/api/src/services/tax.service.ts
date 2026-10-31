import type { CreateTaxInput, Tax, TaxListQuery, UpdateTaxInput } from "@brightloop/shared";
import { isCheckViolation } from "../lib/db-errors.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { TaxesRepository } from "../repositories/taxes-plans.repository.js";

type TaxWindow = Pick<Tax, "isActive" | "effectiveFrom" | "effectiveTo">;

/** Active and in effect on `date` (YYYY-MM-DD). effectiveFrom and effectiveTo are both inclusive. */
export function isTaxEffective(tax: TaxWindow, date: string): boolean {
  return tax.isActive && tax.effectiveFrom <= date && (!tax.effectiveTo || date <= tax.effectiveTo);
}

/** A tax rate as applied to a line: the snapshot written to invoice_line_taxes. */
export interface AppliedRate {
  /** null when the tax row has since been deleted and only its snapshot remains. */
  taxId: string | null;
  name: string;
  rateBps: number;
  inclusive: boolean;
}

export function createTaxService({ taxes }: { taxes: TaxesRepository }) {
  async function guard<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (isCheckViolation(err)) throw new BadRequestError("effectiveTo must be after effectiveFrom");
      throw err;
    }
  }

  return {
    list: (query: TaxListQuery) => taxes.list(query),

    async get(id: string) {
      const tax = await taxes.findById(id);
      if (!tax) throw new NotFoundError("Tax");
      return tax;
    },

    create: (input: CreateTaxInput) => guard(() => taxes.create(input)),

    async update(id: string, input: UpdateTaxInput) {
      const tax = await guard(() => taxes.update(id, input));
      if (!tax) throw new NotFoundError("Tax");
      return tax;
    },

    async remove(id: string) {
      if (!(await taxes.delete(id))) throw new NotFoundError("Tax");
    },

    /**
     * The rates among `taxIds` that apply on `date`: active, and with `date` inside the
     * effective window. Unknown, inactive or out-of-window taxes are left out.
     */
    async applicableRates(taxIds: string[], date: string, tx?: DbOrTx): Promise<AppliedRate[]> {
      const rows = await taxes.findApplicable([...new Set(taxIds)], date, tx);
      return rows
        .filter((t) => isTaxEffective(t, date))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ taxId: t.id, name: t.name, rateBps: t.rateBps, inclusive: t.inclusive }));
    },
  };
}

export type TaxService = ReturnType<typeof createTaxService>;
