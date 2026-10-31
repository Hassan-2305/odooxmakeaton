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

/** Integer paise. Never a float. */
export type Paise = number;
