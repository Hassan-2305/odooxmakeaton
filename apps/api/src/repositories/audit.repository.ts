import type { AuditListQuery, AuditLogEntry, ListResponse } from "@brightloop/shared";
import { and, count, eq, gte, like, lt, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { auditLog, users } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";

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

/** Keys never written to the audit log, at any depth. */
const SECRET_KEYS = new Set(["password", "passwordhash", "password_hash", "token", "tokenhash", "token_hash"]);

/** Deep copy of `value` with secret keys replaced by "[redacted]". */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.has(k.toLowerCase()) ? "[redacted]" : redact(v)]),
    );
  }
  return value;
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
    before: redact(entry.before ?? null),
    after: redact(entry.after ?? null),
  });
}

const sortColumns = {
  createdAt: auditLog.createdAt,
  action: auditLog.action,
  entityType: auditLog.entityType,
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function createAuditRepository(db: Db) {
  return {
    write: (entry: AuditEntry, tx: DbOrTx = db) => writeAudit(tx, entry),

    /** `timezone` turns the from/to calendar days into UTC bounds. */
    async list(query: AuditListQuery, timezone: string): Promise<ListResponse<AuditLogEntry>> {
      const filters: SQL[] = [];
      if (query.actorUserId) filters.push(eq(auditLog.actorUserId, query.actorUserId));
      if (query.entityType) filters.push(eq(auditLog.entityType, query.entityType));
      if (query.entityId) filters.push(eq(auditLog.entityId, query.entityId));
      if (query.action) {
        filters.push(
          query.action.endsWith(".")
            ? like(auditLog.action, `${escapeLike(query.action)}%`)
            : eq(auditLog.action, query.action),
        );
      }
      if (query.from) {
        filters.push(gte(auditLog.createdAt, sql`(${query.from}::date)::timestamp at time zone ${timezone}`));
      }
      if (query.to) {
        filters.push(lt(auditLog.createdAt, sql`(${query.to}::date + 1)::timestamp at time zone ${timezone}`));
      }
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), auditLog.id];

      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          db
            .select({
              id: auditLog.id,
              action: auditLog.action,
              entityType: auditLog.entityType,
              entityId: auditLog.entityId,
              before: auditLog.before,
              after: auditLog.after,
              createdAt: auditLog.createdAt,
              actorId: users.id,
              actorEmail: users.email,
              actorName: users.name,
            })
            .from(auditLog)
            .leftJoin(users, eq(users.id, auditLog.actorUserId))
            .where(where)
            .orderBy(...orderBy)
            .limit(limit)
            .offset(offset),
          db.select({ total: count() }).from(auditLog).where(where),
        ]);
        return {
          rows: rows.map(({ actorId, actorEmail, actorName, createdAt, ...row }) => ({
            ...row,
            actor: actorId ? { id: actorId, email: actorEmail!, name: actorName! } : null,
            createdAt: createdAt.toISOString(),
          })),
          total: totalRow?.total ?? 0,
        };
      });
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
