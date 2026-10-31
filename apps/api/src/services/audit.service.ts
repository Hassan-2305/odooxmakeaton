import type { AuditListQuery, AuthUser } from "@brightloop/shared";
import type { AuditRepository, DbOrTx } from "../repositories/audit.repository.js";

interface Deps {
  repo: Pick<AuditRepository, "write" | "list">;
  /** Business timezone for the list's from/to day filters. */
  timezone: string;
}

export function createAuditService({ repo, timezone }: Deps) {
  return {
    /**
     * Records who did what to which entity. `actor` is null for system actions.
     * Pass `tx` to commit the audit row with the write it describes.
     * Secret fields (passwords, tokens) in before/after are redacted.
     *
     *   await auditService.audit(user, "invoice", invoice.id, "invoice.confirmed", before, after, tx);
     */
    audit(
      actor: Pick<AuthUser, "id"> | null,
      entity: string,
      id: string,
      action: string,
      before: unknown,
      after: unknown,
      tx?: DbOrTx,
    ): Promise<void> {
      return repo.write(
        { actorUserId: actor?.id ?? null, entityType: entity, entityId: id, action, before, after },
        tx,
      );
    },

    list: (query: AuditListQuery) => repo.list(query, timezone),
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
