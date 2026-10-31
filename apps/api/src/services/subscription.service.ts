import type {
  AuthUser,
  Plan,
  SubscriptionDetail,
  SubscriptionFromTemplateInput,
  SubscriptionListQuery,
  SubscriptionStatus,
  SubscriptionTransitionInput,
} from "@brightloop/shared";
import { isForeignKeyViolation } from "../lib/db-errors.js";
import { addDays, dayOfMonth, startOfDayIn, todayIn } from "../lib/dates.js";
import { BadRequestError, ConflictError, InvalidTransitionError, NotFoundError } from "../lib/errors.js";
import { createTransitions } from "../lib/transition.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { CatalogRepository } from "../repositories/catalog.repository.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import type { NewSubscriptionLine, SubscriptionsRepository } from "../repositories/subscriptions.repository.js";
import type { PlansRepository } from "../repositories/taxes-plans.repository.js";
import type { TemplatesRepository } from "../repositories/templates.repository.js";
import type { AuditService } from "./audit.service.js";
import { nextPeriodStart } from "./period.service.js";
import { isSellable } from "./plan.service.js";
import type { TaxService } from "./tax.service.js";

/**
 * Subscription lifecycle. Plan flags add further checks on top of the map:
 * pausing needs plan.pausable, closing before the expiry date needs plan.closable_early,
 * and an expired quotation cannot be confirmed.
 */
export const subscriptionTransitions = createTransitions<SubscriptionStatus>("subscription", {
  draft: ["quotation", "cancelled"],
  quotation: ["draft", "confirmed", "cancelled"],
  confirmed: ["active", "cancelled"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: [],
  cancelled: [],
});

type Actor = Pick<AuthUser, "id"> | null;

interface Deps {
  subscriptions: SubscriptionsRepository;
  templates: Pick<TemplatesRepository, "findById">;
  plans: Pick<PlansRepository, "findById">;
  catalog: Pick<CatalogRepository, "findProduct" | "findVariant">;
  settings: SettingsRepository;
  taxService: Pick<TaxService, "applicableRates">;
  auditService: AuditService;
  timezone: string;
  now?: () => Date;
}

export function createSubscriptionService(deps: Deps) {
  const { subscriptions, templates, plans, catalog, settings, taxService, auditService, timezone } = deps;
  const now = deps.now ?? (() => new Date());
  const today = () => todayIn(timezone, now());

  async function detail(id: string, tx?: DbOrTx): Promise<SubscriptionDetail> {
    const sub = await subscriptions.findById(id, tx);
    if (!sub) throw new NotFoundError("Subscription");
    const [lines, events] = await Promise.all([subscriptions.lines(id, tx), subscriptions.events(id, tx)]);
    return { ...sub, lines, events };
  }

  async function requirePlan(id: string, tx: DbOrTx): Promise<Plan> {
    const plan = await plans.findById(id, tx);
    if (!plan) throw new BadRequestError("Unknown recurring plan");
    return plan;
  }

  /**
   * Moves a locked subscription row to `to` inside `tx`, applying the plan rules,
   * and records a subscription_events row and an audit_log row. Used by the API and
   * by the billing run (auto-close at the end of the term).
   */
  async function applyTransition(
    tx: DbOrTx,
    id: string,
    to: SubscriptionStatus,
    actor: Actor,
    note?: string,
  ): Promise<void> {
    const row = await subscriptions.lock(tx, id);
    if (!row) throw new NotFoundError("Subscription");
    const plan = await requirePlan(row.recurringPlanId, tx);
    const day = today();

    subscriptionTransitions.assert(row.status, to);

    const changes: Parameters<SubscriptionsRepository["update"]>[2] = { status: to };

    if (row.status === "quotation" && to === "confirmed") {
      if (row.quotationExpiresAt && now() >= row.quotationExpiresAt) {
        throw new ConflictError("This quotation has expired and cannot be confirmed", {
          quotationExpiresAt: row.quotationExpiresAt.toISOString(),
        });
      }
    }

    if (to === "paused" && !plan.pausable) {
      throw new ConflictError(`The ${plan.name} plan cannot be paused`);
    }

    if (to === "closed" && row.expiryDate && day < row.expiryDate && !plan.closableEarly) {
      throw new ConflictError(`The ${plan.name} plan cannot be closed before ${row.expiryDate}`, {
        expiryDate: row.expiryDate,
      });
    }

    if (row.status === "confirmed" && to === "active") {
      // Starts on the quoted date, or today if that date has already passed.
      const startDate = row.startDate >= day ? row.startDate : day;
      if (row.expiryDate && row.expiryDate <= startDate) {
        throw new ConflictError("The subscription would expire before it starts", { expiryDate: row.expiryDate });
      }
      Object.assign(changes, { startDate, anchorDay: dayOfMonth(startDate), nextInvoiceDate: startDate });
    }

    if (row.status === "paused" && to === "active" && row.nextInvoiceDate) {
      // Periods that started while paused are not billed.
      let next = row.nextInvoiceDate;
      while (next < day) next = nextPeriodStart(next, plan, row.anchorDay);
      changes.nextInvoiceDate = next;
    }

    await subscriptions.update(tx, id, changes);
    await subscriptions.insertEvent(tx, {
      subscriptionId: id,
      type: "status_changed",
      fromStatus: row.status,
      toStatus: to,
      actorUserId: actor?.id ?? null,
      payload: note ? { note } : null,
    });
    await auditService.audit(
      actor,
      "subscription",
      id,
      `subscription.${to}`,
      { status: row.status, startDate: row.startDate, nextInvoiceDate: row.nextInvoiceDate },
      { ...changes, note: note ?? null },
      tx,
    );
  }

  async function renew(tx: DbOrTx, id: string, actor: Actor, input: SubscriptionTransitionInput) {
    const row = await subscriptions.lock(tx, id);
    if (!row) throw new NotFoundError("Subscription");
    if (row.status !== "active") throw new InvalidTransitionError("subscription", row.status, "renew", []);
    const plan = await requirePlan(row.recurringPlanId, tx);
    if (!plan.renewable) throw new ConflictError(`The ${plan.name} plan is not renewable`);
    if (!row.expiryDate) throw new ConflictError("This subscription has no expiry date to extend");

    const expiryDate = input.expiryDate ?? nextPeriodStart(row.expiryDate, plan, row.anchorDay);
    if (expiryDate <= row.expiryDate) {
      throw new BadRequestError("The new expiry date must be after the current one", { expiryDate: row.expiryDate });
    }
    await subscriptions.update(tx, id, { expiryDate });
    await subscriptions.insertEvent(tx, {
      subscriptionId: id,
      type: "renewed",
      fromStatus: row.status,
      toStatus: row.status,
      actorUserId: actor?.id ?? null,
      payload: { previousExpiryDate: row.expiryDate, expiryDate, note: input.note ?? null },
    });
    await auditService.audit(
      actor,
      "subscription",
      id,
      "subscription.renewed",
      { expiryDate: row.expiryDate },
      { expiryDate, note: input.note ?? null },
      tx,
    );
  }

  return {
    applyTransition,

    list: (query: SubscriptionListQuery) => subscriptions.list(query, today()),

    get: (id: string) => detail(id),

    /**
     * Creates a quotation from a template: lines are copied with unit prices and tax
     * rates snapshotted now, the quotation expires after the template's validity days,
     * and the number comes from the settings sequence.
     */
    async fromTemplate(actor: AuthUser, templateId: string, input: SubscriptionFromTemplateInput) {
      try {
        const id = await subscriptions.transaction(async (tx) => {
          const template = await templates.findById(templateId, tx);
          if (!template) throw new NotFoundError("Quotation template");
          if (!template.isActive) throw new BadRequestError("This template is inactive");
          if (!template.lines.length) throw new BadRequestError("This template has no lines");

          const planId = input.recurringPlanId ?? template.recurringPlanId;
          if (!planId) throw new BadRequestError("Pick a recurring plan: the template has none");
          const plan = await requirePlan(planId, tx);
          const day = today();
          if (!isSellable(plan, day)) {
            throw new BadRequestError(`The ${plan.name} plan is not available for sale on ${day}`);
          }
          const quantity = template.lines.reduce((sum, l) => sum + l.quantity, 0);
          if (quantity < plan.minQuantity) {
            throw new BadRequestError(
              `The ${plan.name} plan needs at least ${plan.minQuantity} units; this quotation has ${quantity}`,
              { minQuantity: plan.minQuantity, quantity },
            );
          }

          const lines: NewSubscriptionLine[] = [];
          for (const line of template.lines) {
            const product = await catalog.findProduct(line.productId, tx);
            if (!product) throw new BadRequestError("A template line refers to a deleted product");
            const variant = line.variantId ? await catalog.findVariant(line.variantId, tx) : undefined;
            if (line.variantId && !variant) throw new BadRequestError("A template line refers to a deleted variant");
            const rates = await taxService.applicableRates(product.taxIds, input.startDate, tx);
            lines.push({
              productId: product.id,
              variantId: variant?.id ?? null,
              description: line.description ?? variant?.name ?? product.name,
              quantity: line.quantity,
              unitPricePaise: variant ? variant.pricePaise : product.basePricePaise,
              sortOrder: line.sortOrder,
              taxes: rates,
            });
          }

          const config = await settings.get(tx);
          const number = await settings.nextNumber(tx, "subscription");
          const subscriptionId = await subscriptions.insert(tx, {
            number,
            customerId: input.customerId,
            recurringPlanId: plan.id,
            quotationTemplateId: template.id,
            status: "quotation",
            startDate: input.startDate,
            expiryDate: input.expiryDate ?? null,
            anchorDay: dayOfMonth(input.startDate),
            paymentTermsDays: input.paymentTermsDays ?? config.defaultPaymentTermsDays,
            // Valid through the last day: expires at the start of the day after.
            quotationExpiresAt: startOfDayIn(addDays(day, template.validityDays + 1), timezone),
            notes: input.notes ?? template.notes,
            createdBy: actor.id,
          });
          await subscriptions.insertLines(tx, subscriptionId, lines);
          await subscriptions.insertEvent(tx, {
            subscriptionId,
            type: "created",
            toStatus: "quotation",
            actorUserId: actor.id,
            payload: { templateId: template.id },
          });
          await auditService.audit(actor, "subscription", subscriptionId, "subscription.created", null, {
            number,
            templateId: template.id,
            customerId: input.customerId,
            planId: plan.id,
            lines,
          }, tx);
          return subscriptionId;
        });
        return detail(id);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw new BadRequestError("Unknown customer");
        throw err;
      }
    },

    async transition(actor: AuthUser, id: string, input: SubscriptionTransitionInput) {
      await subscriptions.transaction((tx) =>
        input.to === "renew" ? renew(tx, id, actor, input) : applyTransition(tx, id, input.to, actor, input.note),
      );
      return detail(id);
    },
  };
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>;
