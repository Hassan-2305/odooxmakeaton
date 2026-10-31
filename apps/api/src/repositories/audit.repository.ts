import type { Db } from "../db/client.js";
import { auditLog } from "../db/schema/index.js";

/** A Drizzle database handle or an open transaction. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface AuditEntry {
  actorUserId: string | null;
  /** Dotted verb, e.g. "staff.created", "invoice.confirmed". */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Appends an audit_log row. Pass the same transaction as the write being audited,
 * so the change and its audit row commit or roll back together.
 */
export async function writeAudit(tx: DbOrTx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
