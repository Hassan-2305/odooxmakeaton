import { z } from "zod";

export const idSchema = z.uuid();

export const idParamSchema = z.object({ id: idSchema });
export type IdParam = z.infer<typeof idParamSchema>;

/** Money as integer paise. Never floats. */
export const paiseSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const positivePaiseSchema = paiseSchema.min(1);

/** Basis points: 1800 = 18%. */
export const bpsSchema = z.number().int().min(0).max(10_000);

export const quantitySchema = z.number().int().min(1);

/** Calendar date, YYYY-MM-DD, interpreted in the business timezone. */
export const isoDateSchema = z.iso.date();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const nameSchema = z.string().trim().min(1).max(200);
export const optionalTextSchema = z.string().trim().max(2000).optional();

type WithoutDefaults<S extends z.ZodRawShape> = {
  [K in keyof S]: S[K] extends z.ZodDefault<infer Inner> ? Inner : S[K];
};

/**
 * Update (PATCH) schema: every field optional and defaults removed. A plain `.partial()`
 * keeps defaults in zod v4, so `{ name }` would silently reset fields like `isActive`.
 */
export function toPatchSchema<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault ? field.unwrap() : field,
    ]),
  ) as WithoutDefaults<S>;
  return z.object(shape).partial();
}

/** Issue for `path` when both dates are set and `to` is not after `from`. */
export function checkDateOrder(
  ctx: z.RefinementCtx,
  from: string | null | undefined,
  to: string | null | undefined,
  path: string,
  { allowEqual = false } = {},
) {
  if (!from || !to) return;
  if (allowEqual ? to < from : to <= from) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message: allowEqual ? "Must be on or after the start date" : "Must be after the start date",
    });
  }
}
