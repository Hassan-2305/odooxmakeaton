import type { CreateCustomerInput, CustomerListQuery, UpdateCustomerInput } from "@brightloop/shared";
import { isForeignKeyViolation } from "../lib/db-errors.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import type { CustomersRepository } from "../repositories/customers.repository.js";

export function createCustomersService({ customers }: { customers: CustomersRepository }) {
  return {
    list: (query: CustomerListQuery) => customers.list(query),

    async get(id: string) {
      const customer = await customers.findById(id);
      if (!customer) throw new NotFoundError("Customer");
      return customer;
    },

    create: (input: CreateCustomerInput) => customers.create(input),

    async update(id: string, input: UpdateCustomerInput) {
      const customer = await customers.update(id, input);
      if (!customer) throw new NotFoundError("Customer");
      return customer;
    },

    async remove(id: string) {
      let deleted: boolean;
      try {
        deleted = await customers.delete(id);
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new ConflictError(
            "This customer has a portal account, subscriptions or invoices, so it can't be deleted.",
          );
        }
        throw err;
      }
      if (!deleted) throw new NotFoundError("Customer");
    },
  };
}

export type CustomersService = ReturnType<typeof createCustomersService>;
