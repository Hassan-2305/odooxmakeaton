import type { UserRole } from "../schemas/enums.js";

/** Every list endpoint returns this shape. */
export interface ListResponse<T> {
  data: T[];
  total: number;
  tookMs: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field errors keyed by dotted path, e.g. "lines.0.quantity". */
    fields?: Record<string, string[]>;
    /** Extra context for non-field errors, e.g. allowed transitions. */
    details?: Record<string, unknown>;
  };
}

/** The signed-in user, as returned by GET /api/auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Set only for customer users. */
  customerId: string | null;
}

/** Integer paise. Never a float. */
export type Paise = number;
