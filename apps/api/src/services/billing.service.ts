import type { AuthUser, BillingRunDetail, BillingRunItemOutcome, BillingRunListQuery } from "@brightloop/shared";
import { isUniqueViolation } from "../lib/db-errors.js";
import { todayIn } from "../lib/dates.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import type { EventBus } from "../lib/events.js";
import { type Logger, silentLogger } from "../lib/logger.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import { type BillingRunsRepository, toBillingRun } from "../repositories/billing-runs.repository.js";
import type { InvoicesRepository } from "../repositories/invoices.repository.js";
import type { SubscriptionsRepository } from "../repositories/subscriptions.repository.js";
import type { PlansRepository } from "../repositories/taxes-plans.repository.js";
import type { InvoiceService } from "./invoice.service.js";
import { nextPeriodStart } from "./period.service.js";
import type { SubscriptionService } from "./subscription.service.js";

export interface RunOptions {
  /** dry: compute everything in a transaction that is rolled back, and return the preview. */
  mode: "dry" | "live";
  trigger: "manual" | "scheduled";
  actor: Pick<AuthUser, "id"> | null;
  /** Billing day in the business timezone; defaults to today. Never in the future. */
  businessDate?: string;
  /** Limit the run to these subscriptions. */
  subscriptionIds?: string[];
}

/** Safety stop for catch-up: no subscription bills more periods than this in one run. */
const MAX_PERIODS_PER_SUBSCRIPTION = 400;

interface Deps {
  runs: BillingRunsRepository;
  subscriptions: Pick<SubscriptionsRepository, "lock" | "update">;
  plans: Pick<PlansRepository, "findById">;
  invoices: Pick<InvoicesRepository, "findBySubscriptionPeriod">;
  invoiceService: Pick<InvoiceService, "build">;
  subscriptionService: Pick<SubscriptionService, "applyTransition">;
  eventBus: EventBus;
  timezone: string;
  logger?: Logger;
  now?: () => Date;
}

type PeriodResult =
  | { kind: "nothing_due" }
  | {
      kind: BillingRunItemOutcome;
      /** Stop billing further periods of this subscription in this run. */
      stop: boolean;
      created?: { invoiceId: string; number: string | null; customerId: string; totalPaise: number };
    };

class DryRunRollback extends Error {}

export function createBillingService(deps: Deps) {
  const { runs, subscriptions, plans, invoices, invoiceService, subscriptionService, eventBus, timezone } = deps;
  const logger = deps.logger ?? silentLogger;
  const now = deps.now ?? (() => new Date());

  /** Bills the next due period of one subscription inside `tx` and records the run item. */
  async function billNextPeriod(tx: DbOrTx, subscriptionId: string, date: string, runId: string): Promise<PeriodResult> {
    const sub = await subscriptions.lock(tx, subscriptionId);
    if (!sub || sub.status !== "active" || !sub.nextInvoiceDate || sub.nextInvoiceDate > date) {
      return { kind: "nothing_due" };
    }
    const plan = await plans.findById(sub.recurringPlanId, tx);
    if (!plan) throw new Error("Recurring plan not found");
    const period = { start: sub.nextInvoiceDate, end: nextPeriodStart(sub.nextInvoiceDate, plan, sub.anchorDay) };
    const item = { billingRunId: runId, subscriptionId, periodStart: period.start };

    if (sub.expiryDate && period.start >= sub.expiryDate) {
      let reason = `Term ended on ${sub.expiryDate}`;
      if (plan.autoCloseOnEnd) {
        await subscriptionService.applyTransition(tx, subscriptionId, "closed", null, reason);
        reason += "; subscription closed";
      }
      await runs.insertItem(tx, { ...item, outcome: "skipped", reason });
      return { kind: "skipped", stop: true };
    }

    let result: PeriodResult;
    try {
      // Savepoint: a duplicate period only rolls back the invoice insert.
      const built = await tx.transaction((sp) =>
        invoiceService.build(sub, period, sp, { invoiceDate: date, billingRunId: runId }),
      );
      await runs.insertItem(tx, { ...item, outcome: "created", invoiceId: built.invoice.id });
      result = {
        kind: "created",
        stop: false,
        created: {
          invoiceId: built.invoice.id,
          number: built.invoice.number,
          customerId: built.invoice.customerId,
          totalPaise: built.invoice.totalPaise,
        },
      };
    } catch (err) {
      if (!isUniqueViolation(err, "invoices_subscription_period_unique")) throw err;
      const existing = await invoices.findBySubscriptionPeriod(subscriptionId, period.start, tx);
      await runs.insertItem(tx, {
        ...item,
        outcome: "already_billed",
        invoiceId: existing?.id ?? null,
        reason: existing ? `Already invoiced as ${existing.number}` : "Already invoiced",
      });
      result = { kind: "already_billed", stop: false };
    }

    await subscriptions.update(tx, subscriptionId, { nextInvoiceDate: period.end });
    return result;
  }

  /** The whole run on `conn`: the database for live runs, a doomed transaction for dry runs. */
  async function execute(conn: DbOrTx, options: RunOptions, date: string, live: boolean): Promise<BillingRunDetail> {
    const run = await runs.insertRun(conn, {
      mode: options.trigger,
      status: "running",
      businessDate: date,
      triggeredBy: options.actor?.id ?? null,
    });
    const counts = { created: 0, already_billed: 0, skipped: 0, failed: 0 };
    const ids = await runs.dueSubscriptionIds(conn, date, options.subscriptionIds);

    for (const subscriptionId of ids) {
      for (let n = 0; n < MAX_PERIODS_PER_SUBSCRIPTION; n++) {
        let result: PeriodResult;
        try {
          // One transaction per period (a savepoint inside a dry run).
          result = await conn.transaction((tx) => billNextPeriod(tx, subscriptionId, date, run.id));
        } catch (err) {
          // One failure never stops the run: record it and move to the next subscription.
          const reason = err instanceof Error ? err.message : String(err);
          logger.warn("billing run: subscription failed", { runId: run.id, subscriptionId, reason });
          await runs.insertItem(conn, { billingRunId: run.id, subscriptionId, outcome: "failed", reason });
          counts.failed++;
          break;
        }
        if (result.kind === "nothing_due") break;
        counts[result.kind]++;
        if (live && result.created) {
          eventBus.emit("invoice.created", { ...result.created, subscriptionId, billingRunId: run.id });
        }
        if (result.stop) break;
      }
    }

    const finished = await runs.finishRun(conn, run.id, {
      status: "completed",
      consideredCount: ids.length,
      invoicedCount: counts.created,
      alreadyBilledCount: counts.already_billed,
      skippedCount: counts.skipped,
      failedCount: counts.failed,
    });
    return { ...toBillingRun(finished, !live), items: await runs.items(run.id, conn) };
  }

  return {
    /**
     * Bills every active subscription whose next invoice date is on or before the
     * business date, catching up one period at a time. Each period commits on its own;
     * a rerun bills nothing twice (the unique (subscription_id, period_start) index
     * turns a repeat into already_billed).
     */
    async run(options: RunOptions): Promise<BillingRunDetail> {
      const today = todayIn(timezone, now());
      const date = options.businessDate ?? today;
      if (date > today) throw new BadRequestError("businessDate cannot be in the future");

      if (options.mode === "dry") {
        let preview: BillingRunDetail | undefined;
        try {
          await runs.transaction(async (tx) => {
            preview = await execute(tx, options, date, false);
            throw new DryRunRollback();
          });
        } catch (err) {
          if (!(err instanceof DryRunRollback)) throw err;
        }
        return preview!;
      }

      const result = await execute(runs.conn, options, date, true).catch((err) => {
        logger.error("billing run crashed", { error: err instanceof Error ? err.message : String(err) });
        throw err;
      });
      eventBus.emit("billing_run.finished", {
        id: result.id,
        businessDate: result.businessDate,
        invoicedCount: result.invoicedCount,
        alreadyBilledCount: result.alreadyBilledCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
      });
      return result;
    },

    list: (query: BillingRunListQuery) => runs.list(query),

    async get(id: string): Promise<BillingRunDetail> {
      const run = await runs.findRun(id);
      if (!run) throw new NotFoundError("Billing run");
      return { ...toBillingRun(run), items: await runs.items(id) };
    },
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
