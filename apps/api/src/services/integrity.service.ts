import type {
  AuthUser,
  DismissFindingInput,
  FindingListQuery,
  FindingStatus,
  IntegrityScanResult,
  PaymentAllocationInput,
  ResolveFindingInput,
} from "@brightloop/shared";
import { businessToday } from "../lib/business-date.js";
import { AppError, BadRequestError, InvalidTransitionError, NotFoundError } from "../lib/errors.js";
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

type Actor = Pick<AuthUser, "id">;

/** Services that carry out corrective resolve actions. */
export interface IntegrityCorrections {
  /** Allocates the payment to invoices through the payments service. */
  allocatePayment(actor: Actor, paymentId: string, allocations: PaymentAllocationInput[]): Promise<object>;
  /** Bills the subscription for the period starting `periodStart` through the billing service. */
  generateInvoice(actor: Actor, subscriptionId: string, periodStart: string): Promise<object>;
}

/** Corrective actions and the only rule each one can fix. */
const CORRECTION_RULES: Record<string, string> = {
  allocate_payment: "unallocated_payment",
  generate_invoice: "missing_invoice",
};

interface Deps {
  repo: IntegrityRepository;
  /** Business timezone: rules compare dates against today here. */
  timezone: string;
  now?: () => Date;
  /** Needed for allocate_payment and generate_invoice; other actions only record a decision. */
  corrections?: IntegrityCorrections;
}

export function createIntegrityService({ repo, timezone, now = () => new Date(), corrections }: Deps) {
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

    /**
     * Resolves a finding. allocate_payment and generate_invoice first run the correction
     * through the payments or billing service (checking the rule and that the finding
     * can still be resolved beforehand); any other action only records the decision.
     */
    async resolve(actor: Actor, id: string, input: ResolveFindingInput) {
      const note = input.note ? `${input.action}: ${input.note}` : input.action;
      const decision = { action: input.action, note: input.note ?? null };
      const rule = CORRECTION_RULES[input.action];
      if (!rule) return transition(actor, id, "resolved", note, decision);

      if (!corrections) throw new AppError(501, "not_implemented", `${input.action} is not available here`);
      const finding = await getOrThrow(repo, id);
      if (finding.rule !== rule) {
        throw new BadRequestError(`${input.action} can only resolve ${rule} findings`, { rule: finding.rule });
      }
      // Check before changing anything, so a finding that can't be resolved isn't "fixed" twice.
      findingTransitions.assert(finding.status, "resolved");

      let correction: object;
      if (input.action === "allocate_payment") {
        correction = await corrections.allocatePayment(actor, finding.entityId, input.allocations ?? []);
      } else {
        const periodStart = (finding.expected as { invoiceForPeriodStart?: string } | null)?.invoiceForPeriodStart;
        if (!periodStart) throw new BadRequestError("This finding does not name the missing period");
        correction = await corrections.generateInvoice(actor, finding.entityId, periodStart);
      }

      try {
        return await transition(actor, id, "resolved", note, { ...decision, correction });
      } catch (err) {
        // A scan that ran in between may already have auto-resolved it; the correction stands.
        if (err instanceof InvalidTransitionError) {
          const current = await getOrThrow(repo, id);
          if (current.status === "resolved") return current;
        }
        throw err;
      }
    },
  };
}

export type IntegrityService = ReturnType<typeof createIntegrityService>;
