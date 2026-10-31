import type {
  AuthUser,
  DismissFindingInput,
  FindingListQuery,
  FindingStatus,
  IntegrityScanResult,
  ResolveFindingInput,
} from "@brightloop/shared";
import { businessToday } from "../lib/business-date.js";
import { NotFoundError } from "../lib/errors.js";
import { createTransitions } from "../lib/transition.js";
import { writeAudit } from "../repositories/audit.repository.js";
import type { IntegrityQueries, IntegrityRepository } from "../repositories/integrity.repository.js";

/**
 * Review workflow. Scans move findings between open and resolved on their own;
 * people dismiss (false positive, with a note) or resolve (with the decision taken).
 */
export const findingTransitions = createTransitions<FindingStatus>("finding", {
  open: ["confirmed", "dismissed", "resolved"],
  confirmed: ["open", "dismissed", "resolved"],
  dismissed: ["open"],
  resolved: ["open"],
});

interface Deps {
  repo: IntegrityRepository;
  /** Business timezone: rules compare dates against today here. */
  timezone: string;
  now?: () => Date;
}

type Actor = Pick<AuthUser, "id">;

export function createIntegrityService({ repo, timezone, now = () => new Date() }: Deps) {
  async function getOrThrow(r: IntegrityQueries, id: string, forUpdate = false) {
    const finding = await r.findById(id, { forUpdate });
    if (!finding) throw new NotFoundError("Finding");
    return finding;
  }

  /** Locks the finding, checks the move, writes the status, event and audit row together. */
  function transition(actor: Actor, id: string, to: FindingStatus, note: string | null, decision: object) {
    return repo.transaction(async (r) => {
      const before = await getOrThrow(r, id, true);
      findingTransitions.assert(before.status, to);
      const after = await r.setStatus(before, to, actor.id, note);
      await writeAudit(r.db, {
        actorUserId: actor.id,
        action: `integrity_finding.${to}`,
        entityType: "integrity_finding",
        entityId: id,
        before: { status: before.status },
        after: { status: after.status, ...decision },
      });
      return after;
    });
  }

  return {
    /** Runs every rule now. `actor` is null for scheduled scans. */
    async scan(actor: Actor | null = null): Promise<IntegrityScanResult> {
      const start = performance.now();
      const asOf = businessToday(timezone, now());
      const result = await repo.scan(asOf, actor?.id ?? null);
      return { asOf, ...result, tookMs: Math.round((performance.now() - start) * 100) / 100 };
    },

    list: (query: FindingListQuery) => repo.list(query),

    async get(id: string) {
      const finding = await getOrThrow(repo, id);
      return { finding, events: await repo.events(id) };
    },

    dismiss(actor: Actor, id: string, input: DismissFindingInput) {
      return transition(actor, id, "dismissed", input.note, { note: input.note });
    },

    /** Records the decision only; corrective actions (credit notes, re-billing) come later. */
    resolve(actor: Actor, id: string, input: ResolveFindingInput) {
      const note = input.note ? `${input.action}: ${input.note}` : input.action;
      return transition(actor, id, "resolved", note, { action: input.action, note: input.note ?? null });
    },
  };
}

export type IntegrityService = ReturnType<typeof createIntegrityService>;
