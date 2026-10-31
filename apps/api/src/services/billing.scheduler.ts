import cron from "node-cron";
import type { Logger } from "../lib/logger.js";
import type { BillingService } from "./billing.service.js";

/** Daily live billing run at 01:00 in the business timezone. Returns the cron task. */
export function scheduleBillingRuns(billingService: Pick<BillingService, "run">, { timezone, logger }: { timezone: string; logger: Logger }) {
  return cron.schedule(
    "0 1 * * *",
    async () => {
      try {
        const run = await billingService.run({ mode: "live", trigger: "scheduled", actor: null });
        logger.info("scheduled billing run finished", {
          id: run.id,
          businessDate: run.businessDate,
          created: run.invoicedCount,
          alreadyBilled: run.alreadyBilledCount,
          skipped: run.skippedCount,
          failed: run.failedCount,
        });
      } catch (err) {
        logger.error("scheduled billing run failed", { error: err instanceof Error ? err.message : String(err) });
      }
    },
    { timezone, name: "billing-run", noOverlap: true },
  );
}
