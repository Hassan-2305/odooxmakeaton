import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";
import { createListQuerySchema } from "./list-query.js";

export const AUDIT_SORT_FIELDS = ["createdAt", "action", "entityType"] as const;

/** GET /api/audit?page&pageSize&sort&actorUserId&entityType&entityId&action&from&to */
export const auditListQuerySchema = createListQuerySchema({
  sortFields: AUDIT_SORT_FIELDS,
  defaultSort: [{ field: "createdAt", direction: "desc" }],
  filters: {
    actorUserId: idSchema.optional(),
    entityType: z.string().trim().min(1).max(50).optional(),
    entityId: idSchema.optional(),
    /** Exact action, or a prefix ending in "." (e.g. "invoice.") for every action on it. */
    action: z.string().trim().min(1).max(100).optional(),
    /** Calendar days in the business timezone, both inclusive. */
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  },
}).superRefine((q, ctx) => {
  if (q.from && q.to && q.to < q.from) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "Must be on or after the from date" });
  }
});
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export interface AuditLogEntry {
  id: number;
  /** Null for system actions (seed, scheduled jobs) or a deleted user. */
  actor: { id: string; email: string; name: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}
