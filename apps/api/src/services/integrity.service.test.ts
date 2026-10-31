import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../repositories/audit.repository.js";
import { createIntegrityRepository } from "../repositories/integrity.repository.js";
import { closeTestDb, dbAvailable, fixtures, inRollback } from "../test/db.js";
import { createIntegrityService } from "./integrity.service.js";

afterAll(closeTestDb);

// 2026-10-31 12:00 IST
const NOW = new Date("2026-10-31T06:30:00Z");

async function setup(tx: DbOrTx) {
  const service = createIntegrityService({
    repo: createIntegrityRepository(tx),
    timezone: "Asia/Kolkata",
    now: () => NOW,
  });
  const actor = { id: randomUUID() };
  await tx.execute(sql`insert into users (id, email, password_hash, name, role)
    values (${actor.id}::uuid, ${`${actor.id}@brightloop.in`}, 'x', 'Reviewer', 'admin')`);
  return { service, actor, f: fixtures(tx) };
}

async function findingFor(tx: DbOrTx, rule: string, entityId: string) {
  const { rows } = await tx.execute(
    sql`select * from integrity_findings where rule = ${rule} and entity_id = ${entityId}::uuid`,
  );
  return rows;
}

describe.skipIf(!dbAvailable)("integrityService (Postgres)", () => {
  it("flags an active subscription more than a day past its invoice date with no invoice", () =>
    inRollback(async (tx) => {
      const { service, f } = await setup(tx);
      const c = await f.customer();
      const plan = await f.plan("month");
      const lines = [{ quantity: 3, unitPricePaise: 1000 }];
      const late = await f.subscription({ customerId: c.id, planId: plan.id, nextInvoiceDate: "2026-10-20", lines });
      const grace = await f.subscription({ customerId: c.id, planId: plan.id, nextInvoiceDate: "2026-10-30", lines });
      const billed = await f.subscription({ customerId: c.id, planId: plan.id, nextInvoiceDate: "2026-10-01", lines });
      await f.invoice({ customerId: c.id, subscriptionId: billed.id, totalPaise: 3000, periodStart: "2026-10-01" });
      const cancelledOnly = await f.subscription({ customerId: c.id, planId: plan.id, nextInvoiceDate: "2026-10-01" });
      await f.invoice({
        customerId: c.id,
        subscriptionId: cancelledOnly.id,
        status: "cancelled",
        totalPaise: 0,
        periodStart: "2026-10-01",
      });
      const paused = await f.subscription({
        customerId: c.id,
        planId: plan.id,
        status: "paused",
        nextInvoiceDate: "2026-09-01",
      });

      const result = await service.scan();

      expect(result.asOf).toBe("2026-10-31");
      expect(await findingFor(tx, "missing_invoice", late.id)).toEqual([
        expect.objectContaining({
          severity: "high",
          status: "open",
          entity_type: "subscription",
          customer_id: c.id,
          impact_paise: "3000",
          expected: { invoiceForPeriodStart: "2026-10-20" },
          actual: { invoiceForPeriodStart: null },
          evidence: expect.objectContaining({ daysLate: 11, subscriptionNumber: late.number }),
        }),
      ]);
      expect(await findingFor(tx, "missing_invoice", cancelledOnly.id)).toHaveLength(1);
      for (const ok of [grace, billed, paused]) {
        expect(await findingFor(tx, "missing_invoice", ok.id)).toEqual([]);
      }
    }));

  it("flags a later invoice whose billing period overlaps an earlier one for the subscription", () =>
    inRollback(async (tx) => {
      const { service, f } = await setup(tx);
      const c = await f.customer();
      const plan = await f.plan("month");
      const sub = await f.subscription({ customerId: c.id, planId: plan.id });
      const other = await f.subscription({ customerId: c.id, planId: plan.id });
      const later = (id: string, minutes: number) =>
        tx.execute(sql`update invoices set created_at = now() + make_interval(mins => ${minutes}) where id = ${id}::uuid`);

      const original = await f.invoice({ customerId: c.id, subscriptionId: sub.id, totalPaise: 5000 });
      // Starts a day later, so the unique (subscription_id, period_start) constraint allows it.
      const dup = await f.invoice({
        customerId: c.id,
        subscriptionId: sub.id,
        totalPaise: 5000,
        periodStart: "2026-10-02",
        periodEnd: "2026-11-01",
      });
      await later(dup.id, 1);
      // Periods are half-open: the next period starts where this one ends and does not overlap.
      const next = await f.invoice({
        customerId: c.id,
        subscriptionId: sub.id,
        totalPaise: 5000,
        periodStart: "2026-11-01",
        periodEnd: "2026-12-01",
      });
      await later(next.id, 2);
      const cancelled = await f.invoice({
        customerId: c.id,
        subscriptionId: sub.id,
        status: "cancelled",
        totalPaise: 5000,
        periodStart: "2026-10-15",
        periodEnd: "2026-11-15",
      });
      await later(cancelled.id, 3);
      // Same period on a different subscription is not a duplicate.
      const elsewhere = await f.invoice({ customerId: c.id, subscriptionId: other.id, totalPaise: 5000 });
      await later(elsewhere.id, 4);

      const result = await service.scan();

      for (const ok of [original, next, cancelled, elsewhere]) {
        expect(await findingFor(tx, "duplicate_invoice", ok.id)).toEqual([]);
      }
      expect(await findingFor(tx, "duplicate_invoice", dup.id)).toEqual([
        expect.objectContaining({
          severity: "high",
          status: "open",
          entity_type: "invoice",
          customer_id: c.id,
          impact_paise: "5000",
          expected: { overlappingInvoices: 0 },
          actual: { overlappingInvoices: 1 },
          evidence: {
            subscriptionId: sub.id,
            recommendedAction: "void_duplicate",
            invoiceId: dup.id,
            invoiceNumber: dup.number,
            periodStart: "2026-10-02",
            periodEnd: "2026-11-01",
            originalInvoiceId: original.id,
            originalInvoiceNumber: original.number,
            originalPeriodStart: "2026-10-01",
            originalPeriodEnd: "2026-11-01",
            overlapStart: "2026-10-02",
            overlapEnd: "2026-11-01",
          },
        }),
      ]);
      expect(result.byRule.duplicate_invoice).toBeGreaterThanOrEqual(1);
    }));

  it("names the earliest overlapping invoice as the original and counts every overlap", () =>
    inRollback(async (tx) => {
      const { service, f } = await setup(tx);
      const c = await f.customer();
      const plan = await f.plan("month");
      const sub = await f.subscription({ customerId: c.id, planId: plan.id });
      const original = await f.invoice({ customerId: c.id, subscriptionId: sub.id, totalPaise: 3000 });
      const second = await f.invoice({
        customerId: c.id,
        subscriptionId: sub.id,
        totalPaise: 3000,
        periodStart: "2026-10-10",
        periodEnd: "2026-11-10",
      });
      const third = await f.invoice({
        customerId: c.id,
        subscriptionId: sub.id,
        totalPaise: 1000,
        periodStart: "2026-10-20",
        periodEnd: "2026-10-25",
      });
      await tx.execute(sql`update invoices set created_at = now() + interval '1 minute' where id = ${second.id}::uuid`);
      await tx.execute(sql`update invoices set created_at = now() + interval '2 minutes' where id = ${third.id}::uuid`);

      await service.scan();

      expect(await findingFor(tx, "duplicate_invoice", original.id)).toEqual([]);
      expect(await findingFor(tx, "duplicate_invoice", second.id)).toEqual([
        expect.objectContaining({
          actual: { overlappingInvoices: 1 },
          evidence: expect.objectContaining({
            originalInvoiceId: original.id,
            overlapStart: "2026-10-10",
            overlapEnd: "2026-11-01",
          }),
        }),
      ]);
      expect(await findingFor(tx, "duplicate_invoice", third.id)).toEqual([
        expect.objectContaining({
          impact_paise: "1000",
          actual: { overlappingInvoices: 2 },
          evidence: expect.objectContaining({
            originalInvoiceId: original.id,
            periodStart: "2026-10-20",
            periodEnd: "2026-10-25",
            recommendedAction: "void_duplicate",
          }),
        }),
      ]);

      // Voiding the duplicates resolves their findings on the next scan.
      await tx.execute(sql`update invoices set status = 'cancelled' where id in (${second.id}::uuid, ${third.id}::uuid)`);
      const rescan = await service.scan();
      expect(rescan.autoResolved).toBeGreaterThanOrEqual(2);
      expect(await findingFor(tx, "duplicate_invoice", second.id)).toEqual([
        expect.objectContaining({ status: "resolved" }),
      ]);
    }));

  it("upserts on (rule, record), auto-resolves when fixed and logs each change", () =>
    inRollback(async (tx) => {
      const { service, actor, f } = await setup(tx);
      const c = await f.customer();
      const inv = await f.invoice({ customerId: c.id, totalPaise: 10000 });
      const payment = await f.payment({
        customerId: c.id,
        amountPaise: 10000,
        allocations: [{ invoiceId: inv.id, amountPaise: 4000 }],
      });
      const fullyAllocated = await f.payment({
        customerId: c.id,
        amountPaise: 2000,
        allocations: [{ invoiceId: inv.id, amountPaise: 2000 }],
      });

      const first = await service.scan(actor);
      expect(first.byRule.unallocated_payment).toBeGreaterThanOrEqual(1);
      expect(await findingFor(tx, "unallocated_payment", fullyAllocated.id)).toEqual([]);
      const [finding] = await findingFor(tx, "unallocated_payment", payment.id);
      expect(finding).toMatchObject({
        severity: "medium",
        impact_paise: "6000",
        expected: { allocatedPaise: 10000 },
        actual: { allocatedPaise: 4000 },
      });

      // Scanning again updates the same row instead of adding one.
      await tx.execute(sql`update payment_allocations set amount_paise = 5000 where payment_id = ${payment.id}::uuid`);
      const second = await service.scan(actor);
      expect(second.created).toBe(0);
      const again = await findingFor(tx, "unallocated_payment", payment.id);
      expect(again).toEqual([expect.objectContaining({ id: finding!.id, impact_paise: "5000", status: "open" })]);

      // Fully allocate: the finding resolves itself.
      await tx.execute(sql`update payment_allocations set amount_paise = 8000 where payment_id = ${payment.id}::uuid`);
      await f.invoice({ customerId: c.id, totalPaise: 2000, periodStart: "2026-09-01", periodEnd: "2026-10-01" }).then(
        (other) =>
          tx.execute(sql`insert into payment_allocations (payment_id, invoice_id, amount_paise)
            values (${payment.id}::uuid, ${other.id}::uuid, 2000)`),
      );
      const third = await service.scan(actor);
      expect(third.autoResolved).toBeGreaterThanOrEqual(1);

      const { finding: resolved, events } = await service.get(finding!.id as string);
      expect(resolved).toMatchObject({ status: "resolved", resolvedAt: expect.any(String) });
      expect(events.map((e) => [e.fromStatus, e.toStatus, e.note])).toEqual([
        [null, "open", "Detected by scan"],
        ["open", "resolved", "Auto-resolved: condition no longer detected"],
      ]);
      expect(events[0]!.actor).toMatchObject({ id: actor.id });
    }));

  it("dismisses with a note and keeps a dismissed finding dismissed on rescan", () =>
    inRollback(async (tx) => {
      const { service, actor, f } = await setup(tx);
      const c = await f.customer();
      const payment = await f.payment({ customerId: c.id, amountPaise: 700 });
      await service.scan(actor);
      const [row] = await findingFor(tx, "unallocated_payment", payment.id);

      const dismissed = await service.dismiss(actor, row!.id as string, { note: "Advance for next quarter" });
      expect(dismissed.status).toBe("dismissed");

      await service.scan(actor);
      const { finding, events } = await service.get(row!.id as string);
      expect(finding.status).toBe("dismissed");
      expect(events.at(-1)).toMatchObject({ fromStatus: "open", toStatus: "dismissed", note: "Advance for next quarter" });

      await expect(service.dismiss(actor, row!.id as string, { note: "again" })).rejects.toMatchObject({
        status: 409,
        code: "invalid_transition",
      });

      const { rows: audit } = await tx.execute(
        sql`select action, actor_user_id, before, after from audit_log where entity_id = ${row!.id}::uuid`,
      );
      expect(audit).toEqual([
        {
          action: "integrity_finding.dismissed",
          actor_user_id: actor.id,
          before: { status: "open" },
          after: { status: "dismissed", note: "Advance for next quarter" },
        },
      ]);
    }));

  it("resolves by recording the decision, event and audit row", () =>
    inRollback(async (tx) => {
      const { service, actor, f } = await setup(tx);
      const c = await f.customer();
      const payment = await f.payment({ customerId: c.id, amountPaise: 900 });
      await service.scan(actor);
      const [row] = await findingFor(tx, "unallocated_payment", payment.id);

      const resolved = await service.resolve(actor, row!.id as string, { action: "refund", note: "Refunded by bank" });

      expect(resolved).toMatchObject({ status: "resolved", resolvedAt: expect.any(String) });
      const { events } = await service.get(row!.id as string);
      expect(events.at(-1)).toMatchObject({ toStatus: "resolved", note: "refund: Refunded by bank" });
      const { rows: audit } = await tx.execute(
        sql`select action, after from audit_log where entity_id = ${row!.id}::uuid`,
      );
      expect(audit).toEqual([
        {
          action: "integrity_finding.resolved",
          after: { status: "resolved", action: "refund", note: "Refunded by bank" },
        },
      ]);
    }));

  it("returns 404 for an unknown finding and filters the list", () =>
    inRollback(async (tx) => {
      const { service, actor, f } = await setup(tx);
      const c = await f.customer();
      await f.payment({ customerId: c.id, amountPaise: 500 });
      await service.scan(actor);

      await expect(service.get(randomUUID())).rejects.toMatchObject({ status: 404 });
      const list = await service.list({ page: 1, pageSize: 20, sort: undefined, customerId: c.id, rule: "unallocated_payment" });
      expect(list.total).toBe(1);
      expect(list.data[0]).toMatchObject({ customerId: c.id, impactPaise: 500 });
      const none = await service.list({ page: 1, pageSize: 20, sort: undefined, customerId: c.id, status: "dismissed" });
      expect(none.total).toBe(0);
    }));
});
