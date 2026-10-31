import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, paise, timestamps, utc } from "./columns.js";
import { findingSeverity, findingStatus } from "./enums.js";
import { customers, users } from "./identity.js";

export const integrityFindings = pgTable(
  "integrity_findings",
  {
    id: id(),
    rule: text("rule").notNull(),
    severity: findingSeverity("severity").notNull(),
    status: findingStatus("status").notNull().default("open"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    expected: jsonb("expected"),
    actual: jsonb("actual"),
    impactPaise: paise("impact_paise").notNull().default(0),
    confirmedImpactPaise: paise("confirmed_impact_paise"),
    evidence: jsonb("evidence"),
    detectedAt: utc("detected_at").notNull().defaultNow(),
    resolvedAt: utc("resolved_at"),
    ...timestamps(),
  },
  (t) => [
    index("integrity_findings_status_rule_idx").on(t.status, t.rule),
    index("integrity_findings_entity_idx").on(t.entityType, t.entityId),
    check("integrity_findings_impact_chk", sql`${t.impactPaise} >= 0`),
    check(
      "integrity_findings_confirmed_impact_chk",
      sql`${t.confirmedImpactPaise} is null or ${t.confirmedImpactPaise} >= 0`,
    ),
    check(
      "integrity_findings_resolved_chk",
      sql`${t.resolvedAt} is null or ${t.resolvedAt} >= ${t.detectedAt}`,
    ),
  ],
);

export const integrityFindingEvents = pgTable(
  "integrity_finding_events",
  {
    id: id(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => integrityFindings.id, { onDelete: "cascade" }),
    fromStatus: findingStatus("from_status"),
    toStatus: findingStatus("to_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [index("integrity_finding_events_finding_id_idx").on(t.findingId, t.createdAt)],
);

/** Append-only. Written for every change to invoices, payments, credit notes, discount rules and staff. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
