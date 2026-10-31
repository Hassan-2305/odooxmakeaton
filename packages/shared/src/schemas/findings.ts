import { z } from "zod";
import { idSchema, paiseSchema } from "./common.js";
import { findingSeveritySchema, findingStatusSchema, type FindingSeverity, type FindingStatus } from "./enums.js";
import { createListQuerySchema } from "./list-query.js";

const noteSchema = z.string().trim().max(2000);

export const findingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    confirmedImpactPaise: paiseSchema,
    note: noteSchema.optional(),
  }),
  z.object({ action: z.literal("dismiss"), note: noteSchema.min(3) }),
  z.object({ action: z.literal("resolve"), note: noteSchema.optional() }),
  z.object({ action: z.literal("reopen"), note: noteSchema.optional() }),
]);
export type FindingActionInput = z.infer<typeof findingActionSchema>;

/** Rules run by the integrity scanner. Stored in integrity_findings.rule. */
export const FINDING_RULES = ["missing_invoice", "duplicate_invoice", "unallocated_payment"] as const;
export const findingRuleSchema = z.enum(FINDING_RULES);
export type FindingRule = z.infer<typeof findingRuleSchema>;

export const FINDING_SORT_FIELDS = ["detectedAt", "impactPaise", "severity", "updatedAt"] as const;

/** GET /api/integrity/findings?page&pageSize&sort&status&rule&severity&customerId&entityType&entityId */
export const findingListQuerySchema = createListQuerySchema({
  sortFields: FINDING_SORT_FIELDS,
  defaultSort: [{ field: "detectedAt", direction: "desc" }],
  filters: {
    status: findingStatusSchema.optional(),
    rule: z.string().trim().min(1).max(100).optional(),
    severity: findingSeveritySchema.optional(),
    customerId: idSchema.optional(),
    entityType: z.string().trim().min(1).max(50).optional(),
    entityId: idSchema.optional(),
  },
});
export type FindingListQuery = z.infer<typeof findingListQuerySchema>;

/** POST /api/integrity/findings/:id/dismiss */
export const dismissFindingSchema = z.object({ note: noteSchema.min(3) });
export type DismissFindingInput = z.infer<typeof dismissFindingSchema>;

/** POST /api/integrity/findings/:id/resolve: records the decision; no corrective action runs yet. */
export const resolveFindingSchema = z.object({
  action: z.string().trim().min(1).max(200),
  note: noteSchema.optional(),
});
export type ResolveFindingInput = z.infer<typeof resolveFindingSchema>;

export interface IntegrityFinding {
  id: string;
  rule: string;
  severity: FindingSeverity;
  status: FindingStatus;
  entityType: string;
  entityId: string;
  customerId: string | null;
  expected: unknown;
  actual: unknown;
  impactPaise: number;
  confirmedImpactPaise: number | null;
  evidence: unknown;
  detectedAt: string;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface IntegrityFindingEvent {
  id: string;
  fromStatus: FindingStatus | null;
  toStatus: FindingStatus;
  actor: { id: string; name: string; email: string } | null;
  note: string | null;
  createdAt: string;
}

export interface IntegrityScanResult {
  /** Business date the rules were evaluated against. */
  asOf: string;
  /** Rows currently matching a rule. */
  detected: number;
  byRule: Record<FindingRule, number>;
  created: number;
  reopened: number;
  autoResolved: number;
  tookMs: number;
}
