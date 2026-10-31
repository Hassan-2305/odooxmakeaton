import { afterAll, describe, expect, it } from "vitest";
import { createReportsRepository } from "../repositories/reports.repository.js";
import { closeTestDb, dbAvailable, fixtures, inRollback } from "../test/db.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import { createReportsService } from "./reports.service.js";

afterAll(closeTestDb);

// 2026-10-31 12:00 IST
const NOW = new Date("2026-10-31T06:30:00Z");

function service(tx: DbOrTx) {
  return createReportsService({ repo: createReportsRepository(tx), timezone: "Asia/Kolkata", now: () => NOW });
}

describe.skipIf(!dbAvailable)("reportsService (Postgres)", () => {
  it("summarises one customer's subscriptions, invoices, payments and MRR", () =>
    inRollback(async (tx) => {
      const f = fixtures(tx);
      const c = await f.customer();
      const other = await f.customer();
      // One connection per transaction: create rows one at a time.
      const daily = await f.plan("day");
      const weekly = await f.plan("week");
      const monthly = await f.plan("month");
      const yearly = await f.plan("year");
      const quarterly = await f.plan("month", 3);
      const sub = (planId: string, unitPricePaise: number, status: "active" | "paused" = "active") =>
        f.subscription({ customerId: c.id, planId, status, lines: [{ quantity: 2, unitPricePaise }] });

      await sub(daily.id, 100); // 200/day → 6000
      await sub(weekly.id, 1200); // 2400/week → 10400
      await sub(monthly.id, 5000); // 10000
      await sub(yearly.id, 60000); // 120000/yr → 10000
      await sub(quarterly.id, 15000); // 30000/3 → 10000
      await sub(monthly.id, 99999, "paused"); // not active: excluded
      await f.subscription({ customerId: other.id, planId: monthly.id, lines: [{ quantity: 1, unitPricePaise: 777 }] });

      // Issued in October: 10000 + 20000 (paid) count; draft and cancelled don't.
      const overdue = await f.invoice({ customerId: c.id, totalPaise: 10000, dueDate: "2026-10-15" });
      const paid = await f.invoice({ customerId: c.id, status: "paid", totalPaise: 20000, amountPaidPaise: 20000 });
      await f.invoice({ customerId: c.id, status: "draft", totalPaise: 50000 });
      await f.invoice({ customerId: c.id, status: "cancelled", totalPaise: 70000 });
      // Issued in September, not yet due: outstanding but not overdue, not invoiced this range.
      const notDue = await f.invoice({
        customerId: c.id,
        totalPaise: 8000,
        periodStart: "2026-09-01",
        periodEnd: "2026-10-01",
        issueDate: "2026-09-25",
        dueDate: "2026-11-10",
      });

      await f.payment({
        customerId: c.id,
        amountPaise: 23000,
        paidOn: "2026-10-12",
        allocations: [
          { invoiceId: paid.id, amountPaise: 20000 },
          { invoiceId: overdue.id, amountPaise: 3000 },
        ],
      });
      // Paid before the range: outstanding drops, collected doesn't.
      await f.payment({
        customerId: c.id,
        amountPaise: 1000,
        paidOn: "2026-09-30",
        allocations: [{ invoiceId: notDue.id, amountPaise: 1000 }],
      });

      const s = await service(tx).summary({ customer_id: c.id });

      expect(s).toMatchObject({
        from: "2026-10-01",
        to: "2026-10-31",
        activeSubscriptions: 5,
        invoicedPaise: 30000,
        collectedPaise: 23000,
        outstandingPaise: 7000 + 7000,
        overdue: { count: 1, amountPaise: 7000 },
        mrrPaise: 6000 + 10400 + 10000 + 10000 + 10000,
        openFindings: 0,
      });
      expect(typeof s.tookMs).toBe("number");
    }));

  it("buckets unpaid balances by days past due", () =>
    inRollback(async (tx) => {
      const f = fixtures(tx);
      const c = await f.customer();
      const inv = (dueDate: string, totalPaise: number) =>
        f.invoice({ customerId: c.id, totalPaise, dueDate, periodStart: dueDate, periodEnd: "2027-01-01", issueDate: null });

      await inv("2026-11-05", 100); // current
      await inv("2026-10-31", 200); // due today: current
      await inv("2026-10-21", 300); // 10 days
      await inv("2026-09-20", 400); // 41 days
      await inv("2026-08-20", 500); // 72 days
      await inv("2026-06-01", 600); // 152 days

      const aging = await service(tx).aging({ customer_id: c.id });

      expect(aging.asOf).toBe("2026-10-31");
      expect(aging.buckets).toEqual([
        { bucket: "current", count: 2, amountPaise: 300 },
        { bucket: "0-30", count: 1, amountPaise: 300 },
        { bucket: "31-60", count: 1, amountPaise: 400 },
        { bucket: "61-90", count: 1, amountPaise: 500 },
        { bucket: "90+", count: 1, amountPaise: 600 },
      ]);
      expect(aging.totalPaise).toBe(2100);
    }));

  it("returns a daily collections series with empty days filled in", () =>
    inRollback(async (tx) => {
      const f = fixtures(tx);
      const c = await f.customer();
      const inv = await f.invoice({ customerId: c.id, totalPaise: 10000 });
      await f.payment({ customerId: c.id, amountPaise: 4000, paidOn: "2026-10-02", allocations: [{ invoiceId: inv.id, amountPaise: 4000 }] });
      await f.payment({ customerId: c.id, amountPaise: 2500, paidOn: "2026-10-02" }); // unallocated

      const r = await service(tx).collections({ from: "2026-10-01", to: "2026-10-03", customer_id: c.id });

      expect(r.series).toEqual([
        { date: "2026-10-01", collectedPaise: 0, receivedPaise: 0, payments: 0 },
        { date: "2026-10-02", collectedPaise: 4000, receivedPaise: 6500, payments: 2 },
        { date: "2026-10-03", collectedPaise: 0, receivedPaise: 0, payments: 0 },
      ]);
      expect(r.totalCollectedPaise).toBe(4000);
      expect(r.totalReceivedPaise).toBe(6500);
    }));

  it("rejects a collections range longer than a year", () =>
    inRollback(async (tx) => {
      await expect(service(tx).collections({ from: "2025-01-01", to: "2026-10-31" })).rejects.toMatchObject({
        status: 400,
      });
    }));

  it("lists active subscriptions expiring within the window", () =>
    inRollback(async (tx) => {
      const f = fixtures(tx);
      const c = await f.customer();
      const plan = await f.plan("year");
      const soon = await f.subscription({
        customerId: c.id,
        planId: plan.id,
        expiryDate: "2026-11-10",
        lines: [{ quantity: 1, unitPricePaise: 120000 }],
      });
      await f.subscription({ customerId: c.id, planId: plan.id, expiryDate: "2027-03-01" });
      await f.subscription({ customerId: c.id, planId: plan.id, expiryDate: "2026-11-05", status: "closed" });

      const r = await service(tx).renewals({ days: 30, customer_id: c.id });

      expect(r.data).toEqual([
        expect.objectContaining({ subscriptionId: soon.id, expiryDate: "2026-11-10", daysLeft: 10, mrrPaise: 10000 }),
      ]);
    }));
});
