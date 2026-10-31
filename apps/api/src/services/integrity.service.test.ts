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

  it("flags every invoice after the first for the same subscription and period", () =>
    inRollback(async (tx) => {
      const { service, f } = await setup(tx);
      // The schema's unique constraint already prevents this; drop it inside the
      // rolled-back transaction to simulate data that slipped past it.
      await tx.execute(sql`alter table invoices drop constraint invoices_subscription_period_unique`);
      const c = await f.customer();
      const plan = await f.plan("month");
      const sub = await f.subscription({ customerId: c.id, planId: plan.id });
      const original = await f.invoice({ customerId: c.id, subscriptionId: sub.id, totalPaise: 5000 });
      const dup = await f.invoice({ customerId: c.id, subscriptionId: sub.id, totalPaise: 5000 });
      await tx.execute(sql`update invoices set created_at = now() + interval '1 minute' where id = ${dup.id}::uuid`);
      const cancelled = await f.invoice({ customerId: c.id, subscriptionId: sub.id, status: "cancelled", totalPaise: 5000 });

      await service.scan();

      expect(await findingFor(tx, "duplicate_invoice", original.id)).toEqual([]);
      expect(await findingFor(tx, "duplicate_invoice", cancelled.id)).toEqual([]);
      expect(await findingFor(tx, "duplicate_invoice", dup.id)).toEqual([
        expect.objectContaining({
          entity_type: "invoice",
          impact_paise: "5000",
          expected: { invoicesForPeriod: 1 },
          actual: { invoicesForPeriod: 2 },
          evidence: expect.objectContaining({ originalInvoiceId: original.id }),
        }),
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
