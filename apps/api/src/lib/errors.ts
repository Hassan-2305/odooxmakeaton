/**
 * Expected, user-facing failures. The error handler turns these into
 * `{ error: { code, message, details? } }` with `status` as the HTTP code.
 * Anything that isn't an AppError (or a ZodError) is treated as a 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: Record<string, unknown>) {
    super(400, "bad_request", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in to continue") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this") {
    super(403, "forbidden", message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Resource") {
    super(404, "not_found", `${entity} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, "conflict", message, details);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(entity: string, from: string, to: string, allowed: readonly string[]) {
    super(409, "invalid_transition", `Cannot move ${entity} from ${from} to ${to}`, {
      entity,
      from,
      to,
      allowed,
    });
  }
}
