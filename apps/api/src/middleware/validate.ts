import type { RequestHandler } from "express";
import type { z } from "zod";

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/**
 * Parses body, query and params with the given shared zod schemas and replaces them
 * with the parsed (coerced, defaulted, normalised) values. A ZodError reaches the
 * error handler and becomes a 400 with field errors.
 *
 *   router.post("/", validate({ body: createProductSchema }), handler);
 *   router.get("/", validate({ query: productListQuery }), handler);
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.params) {
      setRequestProperty(req, "params", schemas.params.parse(req.params));
    }
    if (schemas.query) {
      // Express 5 exposes req.query as a getter, so it can't be assigned directly.
      setRequestProperty(req, "query", schemas.query.parse(req.query));
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body ?? {});
    }
    next();
  };
}

function setRequestProperty(req: object, key: "params" | "query", value: unknown) {
  Object.defineProperty(req, key, { value, writable: true, enumerable: true, configurable: true });
}
