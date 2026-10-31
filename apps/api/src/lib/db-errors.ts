/** Postgres error fields, found on the error itself or on Drizzle's wrapper `cause`. */
interface PgErrorFields {
  code?: string;
  constraint?: string;
}

function pgFields(err: unknown): PgErrorFields | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if ("code" in err && typeof err.code === "string") return err as PgErrorFields;
  if ("cause" in err) return pgFields(err.cause);
  return undefined;
}

/** True for a unique-constraint violation (23505), optionally on a specific constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const fields = pgFields(err);
  return fields?.code === "23505" && (!constraint || fields.constraint === constraint);
}
