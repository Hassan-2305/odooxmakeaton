import type {
  CreateCustomerInput,
  Customer,
  CustomerListQuery,
  ListResponse,
  UpdateCustomerInput,
} from "@brightloop/shared";
import { and, count, eq, ilike, or, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { customers } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";

const sortColumns = {
  name: customers.name,
  email: customers.email,
  city: customers.city,
  createdAt: customers.createdAt,
};

type CustomerRow = typeof customers.$inferSelect;

function toCustomer(row: CustomerRow): Customer {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** Escapes LIKE wildcards so user input matches literally. */
function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function createCustomersRepository(db: Db) {
  return {
    async list(query: CustomerListQuery): Promise<ListResponse<Customer>> {
      const filters: SQL[] = [];
      if (query.q) {
        const pattern = likePattern(query.q);
        filters.push(
          or(
            ilike(customers.name, pattern),
            ilike(customers.email, pattern),
            ilike(customers.phone, pattern),
            ilike(customers.gstin, pattern),
          )!,
        );
      }
      if (query.city) filters.push(ilike(customers.city, query.city));
      if (query.state) filters.push(ilike(customers.state, query.state));
      const where = filters.length ? and(...filters) : undefined;
      // Stable order across pages when sort values tie.
      const orderBy = [...orderByFromSort(query.sort, sortColumns), customers.id];

      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db.select().from(customers).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(customers).where(where),
        ]);
        return { rows: rows.map(toCustomer), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string): Promise<Customer | undefined> {
      const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
      return row && toCustomer(row);
    },

    async create(input: CreateCustomerInput): Promise<Customer> {
      const [row] = await db.insert(customers).values(input).returning();
      return toCustomer(row!);
    },

    async update(id: string, input: UpdateCustomerInput): Promise<Customer | undefined> {
      const [row] = await db
        .update(customers)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(customers.id, id))
        .returning();
      return row && toCustomer(row);
    },

    /** Throws a foreign-key violation if users, subscriptions or invoices still reference it. */
    async delete(id: string): Promise<boolean> {
      const deleted = await db.delete(customers).where(eq(customers.id, id)).returning({ id: customers.id });
      return deleted.length > 0;
    },
  };
}

export type CustomersRepository = ReturnType<typeof createCustomersRepository>;
