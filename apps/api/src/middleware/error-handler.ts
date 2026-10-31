import type { ApiErrorBody } from "@brightloop/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, NotFoundError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";

/** Unmatched /api routes. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.baseUrl}${req.path}`));
};

/** ZodError → 400 with field errors, AppError → its status, anything else → 500. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof ZodError) {
      send(res, 400, {
        code: "validation_error",
        message: "Some fields are invalid",
        fields: fieldErrors(err),
      });
      return;
    }

    if (err instanceof AppError) {
      send(res, err.status, { code: err.code, message: err.message, details: err.details });
      return;
    }

    // Malformed JSON or an oversized body from express.json().
    if (isBodyParserError(err)) {
      send(res, err.status, {
        code: err.type === "entity.too.large" ? "payload_too_large" : "invalid_json",
        message: err.type === "entity.too.large" ? "Request body is too large" : "Request body is not valid JSON",
      });
      return;
    }

    logger.error("unhandled error", {
      method: req.method,
      path: req.originalUrl,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    send(res, 500, { code: "internal_error", message: "Something went wrong" });
  };
}

function send(res: Parameters<ErrorRequestHandler>[2], status: number, error: ApiErrorBody["error"]) {
  res.status(status).json({ error } satisfies ApiErrorBody);
}

/** `{ "lines.0.quantity": ["Too small: expected number to be >=1"] }`; form-level issues use "_". */
function fieldErrors(err: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    "status" in err &&
    typeof (err as { type: unknown }).type === "string" &&
    (err as { type: string }).type.startsWith("entity.")
  );
}
