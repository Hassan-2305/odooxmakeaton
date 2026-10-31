import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type SortDirection = "asc" | "desc";
export interface SortField<F extends string = string> {
  field: F;
  direction: SortDirection;
}

const SORT_PATTERN = /^-?[A-Za-z_][A-Za-z0-9_]*(,-?[A-Za-z_][A-Za-z0-9_]*)*$/;

/** `?sort=-createdAt,name` → [{ field: "createdAt", direction: "desc" }, { field: "name", direction: "asc" }] */
function parseSort(value: string): SortField[] {
  return value.split(",").map((part) =>
    part.startsWith("-")
      ? { field: part.slice(1), direction: "desc" }
      : { field: part, direction: "asc" },
  );
}

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);

const sortStringSchema = z
  .string()
  .trim()
  .regex(SORT_PATTERN, 'Use field names separated by commas, prefixed with "-" for descending');

/** Generic list query: any well-formed sort field is accepted. Prefer `createListQuerySchema`. */
export const listQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  sort: sortStringSchema.transform(parseSort).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
export type ListQueryInput = z.input<typeof listQuerySchema>;

/**
 * List query for one endpoint: sort fields are limited to `sortFields`, so a request
 * can never sort by an arbitrary column, and `filters` adds endpoint-specific params.
 */
export function createListQuerySchema<
  const F extends readonly [string, ...string[]],
  S extends z.ZodRawShape = Record<never, never>,
>(options: { sortFields: F; filters?: S; defaultSort?: SortField<F[number]>[] }) {
  const allowed = new Set<string>(options.sortFields);

  return z.object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    sort: sortStringSchema
      .transform(parseSort)
      .superRefine((fields, ctx) => {
        for (const { field } of fields) {
          if (!allowed.has(field)) {
            ctx.addIssue({
              code: "custom",
              message: `Cannot sort by "${field}". Allowed: ${options.sortFields.join(", ")}`,
            });
          }
        }
      })
      .transform((fields) => fields as SortField<F[number]>[])
      .optional()
      .transform((fields) => fields ?? options.defaultSort),
    ...(options.filters ?? ({} as S)),
  });
}
