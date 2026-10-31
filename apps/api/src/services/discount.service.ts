import type {
  AuthUser,
  CreateDiscountRuleInput,
  DiscountRule,
  DiscountRuleListQuery,
  UpdateDiscountRuleInput,
} from "@brightloop/shared";
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "../lib/db-errors.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import { allocate, bpsOf } from "../lib/money.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { DiscountsRepository } from "../repositories/discounts.repository.js";
import type { AuditService } from "./audit.service.js";

export interface DiscountLine {
  productId: string;
  quantity: number;
  /** Line amount in paise before any discount (quantity × unit price). */
  amountPaise: number;
}

export interface EligibleInput {
  lines: DiscountLine[];
  /** Sum of the line amounts, in paise. */
  subtotal: number;
  /** Total quantity across lines. */
  qty: number;
  /** YYYY-MM-DD in the business timezone. */
  date: string;
  /** Codes entered by the customer. Rules with a code only apply when it is given here. */
  codes?: string[];
}

export interface EligibleDiscount {
  rule: DiscountRule;
  /** Discount in paise. */
  amountPaise: number;
  /** The amount split over `lines` (same order); sums to amountPaise. */
  allocations: number[];
}

type Usable = Pick<DiscountRule, "isActive" | "validFrom" | "validTo" | "usageLimit" | "usedCount">;

/** Active, inside the validity window (both ends inclusive) and with uses left. */
export function isUsable(rule: Usable, date: string): boolean {
  return (
    rule.isActive &&
    (!rule.validFrom || rule.validFrom <= date) &&
    (!rule.validTo || date <= rule.validTo) &&
    (rule.usageLimit === null || rule.usedCount < rule.usageLimit)
  );
}

/**
 * Applies `rules` in order: product rules, then subscription rules. Each rule's
 * thresholds (min_qty, min_amount) are checked against the undiscounted amounts it
 * covers; its amount is taken from what earlier rules left, so discounts never stack
 * past zero. Percent amounts round half up to the paise.
 */
export function computeDiscounts(rules: readonly DiscountRule[], input: EligibleInput): EligibleDiscount[] {
  const remaining = input.lines.map((l) => l.amountPaise);
  const codes = new Set((input.codes ?? []).map((c) => c.toUpperCase()));
  const ordered = [...rules].sort((a, b) => Number(a.scope === "subscription") - Number(b.scope === "subscription"));
  const result: EligibleDiscount[] = [];

  for (const rule of ordered) {
    if (!isUsable(rule, input.date)) continue;
    if (rule.code && !codes.has(rule.code)) continue;

    const indexes =
      rule.scope === "product"
        ? input.lines.flatMap((l, i) => (l.productId === rule.productId ? [i] : []))
        : input.lines.map((_, i) => i);
    if (!indexes.length) continue;

    const qty = rule.scope === "product" ? indexes.reduce((s, i) => s + input.lines[i]!.quantity, 0) : input.qty;
    const base = rule.scope === "product" ? indexes.reduce((s, i) => s + input.lines[i]!.amountPaise, 0) : input.subtotal;
    if (qty < rule.minQty || base < rule.minAmountPaise) continue;

    const available = indexes.reduce((s, i) => s + remaining[i]!, 0);
    const amount = rule.type === "percent" ? bpsOf(available, rule.value) : Math.min(rule.value, available);
    if (amount <= 0) continue;

    const parts = allocate(amount, indexes.map((i) => remaining[i]!));
    const allocations = input.lines.map(() => 0);
    indexes.forEach((lineIndex, k) => {
      allocations[lineIndex] = parts[k]!;
      remaining[lineIndex]! -= parts[k]!;
    });
    result.push({ rule, amountPaise: amount, allocations });
  }
  return result;
}

interface Deps {
  discounts: DiscountsRepository;
  auditService: AuditService;
}

export function createDiscountService({ discounts, auditService }: Deps) {
  async function guard<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("That discount code is already used");
      if (isCheckViolation(err)) {
        throw new BadRequestError(
          "Invalid discount: percent is at most 10000 bps, product scope needs a product (and only it), validTo must not be before validFrom, and usageLimit cannot be below usedCount",
        );
      }
      if (isForeignKeyViolation(err)) throw new BadRequestError("Unknown product");
      throw err;
    }
  }

  return {
    list: (query: DiscountRuleListQuery) => discounts.list(query),

    async get(id: string) {
      const rule = await discounts.findById(id);
      if (!rule) throw new NotFoundError("Discount rule");
      return rule;
    },

    create: (actor: AuthUser, input: CreateDiscountRuleInput) =>
      guard(() =>
        discounts.transaction(async (tx) => {
          const rule = await discounts.create(tx, input);
          await auditService.audit(actor, "discount_rule", rule.id, "discount_rule.created", null, rule, tx);
          return rule;
        }),
      ),

    update: (actor: AuthUser, id: string, input: UpdateDiscountRuleInput) =>
      guard(() =>
        discounts.transaction(async (tx) => {
          const before = await discounts.lockById(tx, id);
          if (!before) throw new NotFoundError("Discount rule");
          const after = (await discounts.update(tx, id, input))!;
          await auditService.audit(actor, "discount_rule", id, "discount_rule.updated", before, after, tx);
          return after;
        }),
      ),

    async remove(actor: AuthUser, id: string) {
      try {
        await discounts.transaction(async (tx) => {
          const before = await discounts.lockById(tx, id);
          if (!before) throw new NotFoundError("Discount rule");
          await discounts.delete(tx, id);
          await auditService.audit(actor, "discount_rule", id, "discount_rule.deleted", before, null, tx);
        });
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new ConflictError("This discount has been applied to invoices. Deactivate it instead.");
        }
        throw err;
      }
    },

    /** Rules that apply to these lines on `date`, with their amounts. Reads only. */
    async eligible(input: EligibleInput, tx?: DbOrTx): Promise<EligibleDiscount[]> {
      return computeDiscounts(await discounts.findUsable(input.date, tx), input);
    },

    /**
     * Uses one application of the rule inside `tx`. The row is locked with
     * SELECT ... FOR UPDATE, so concurrent consumers queue and the limit holds.
     * Throws 409 when the rule is exhausted or inactive.
     */
    async consume(ruleId: string, tx: DbOrTx, actor: Pick<AuthUser, "id"> | null = null): Promise<DiscountRule> {
      const rule = await discounts.lockById(tx, ruleId);
      if (!rule) throw new NotFoundError("Discount rule");
      if (rule.usageLimit !== null && rule.usedCount >= rule.usageLimit) {
        throw new ConflictError(`Discount "${rule.name}" has no uses left`, { ruleId, usageLimit: rule.usageLimit });
      }
      if (!rule.isActive) throw new ConflictError(`Discount "${rule.name}" is inactive`, { ruleId });
      const after = await discounts.incrementUsed(tx, ruleId);
      await auditService.audit(
        actor,
        "discount_rule",
        ruleId,
        "discount_rule.consumed",
        { usedCount: rule.usedCount },
        { usedCount: after.usedCount },
        tx,
      );
      return after;
    },
  };
}

export type DiscountService = ReturnType<typeof createDiscountService>;
