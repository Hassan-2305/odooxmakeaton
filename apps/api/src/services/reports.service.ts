import {
  AGING_BUCKETS,
  type ReportAging,
  type ReportAgingQuery,
  type ReportCollections,
  type ReportCollectionsQuery,
  type ReportRenewals,
  type ReportRenewalsQuery,
  type ReportSummary,
  type ReportSummaryQuery,
} from "@brightloop/shared";
import { businessToday, daysBetween, startOfMonth } from "../lib/business-date.js";
import { BadRequestError } from "../lib/errors.js";
import type { ReportsRepository } from "../repositories/reports.repository.js";

const MAX_SERIES_DAYS = 366;

interface Deps {
  repo: ReportsRepository;
  /** Business timezone: "today" and default ranges are calendar days here. */
  timezone: string;
  now?: () => Date;
}

/** Milliseconds since `start`, to two decimals. */
const since = (start: number) => Math.round((performance.now() - start) * 100) / 100;

/** Finance reports. Every figure is aggregated in SQL; money is integer paise. */
export function createReportsService({ repo, timezone, now = () => new Date() }: Deps) {
  const today = () => businessToday(timezone, now());

  function range(q: { from?: string; to?: string }) {
    const to = q.to ?? today();
    const from = q.from ?? startOfMonth(to);
    if (to < from) throw new BadRequestError("The to date must be on or after the from date");
    return { from, to };
  }

  return {
    async summary(q: ReportSummaryQuery): Promise<ReportSummary> {
      const start = performance.now();
      const { from, to } = range(q);
      const figures = await repo.summary({ from, to, today: today(), customerId: q.customer_id });
      return { from, to, ...figures, tookMs: since(start) };
    },

    async aging(q: ReportAgingQuery): Promise<ReportAging> {
      const start = performance.now();
      const asOf = today();
      const rows = await repo.aging({ today: asOf, customerId: q.customer_id });
      // Every bucket is always present, in order, even when empty.
      const buckets = AGING_BUCKETS.map(
        (bucket) => rows.find((r) => r.bucket === bucket) ?? { bucket, count: 0, amountPaise: 0 },
      );
      const totalPaise = buckets.reduce((sum, b) => sum + b.amountPaise, 0);
      return { asOf, buckets, totalPaise, tookMs: since(start) };
    },

    async collections(q: ReportCollectionsQuery): Promise<ReportCollections> {
      const start = performance.now();
      const { from, to } = range(q);
      if (daysBetween(from, to) + 1 > MAX_SERIES_DAYS) {
        throw new BadRequestError(`The range can cover at most ${MAX_SERIES_DAYS} days`);
      }
      const series = await repo.collections({ from, to, customerId: q.customer_id });
      return {
        from,
        to,
        series,
        totalCollectedPaise: series.reduce((sum, d) => sum + d.collectedPaise, 0),
        totalReceivedPaise: series.reduce((sum, d) => sum + d.receivedPaise, 0),
        tookMs: since(start),
      };
    },

    async renewals(q: ReportRenewalsQuery): Promise<ReportRenewals> {
      const start = performance.now();
      const asOf = today();
      const data = await repo.renewals({ today: asOf, days: q.days, customerId: q.customer_id });
      return { asOf, days: q.days, data, tookMs: since(start) };
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
