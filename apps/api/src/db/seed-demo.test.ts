import { spawnSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEventBus } from "../lib/events.js";
import { createAuditRepository } from "../repositories/audit.repository.js";
import { createAuditService } from "../services/audit.service.js";
import { createDomainServices } from "../services/domain.js";
import { closeTestDb, dbAvailable, testDb } from "../test/db.js";

/**
 * Runs `db:seed:demo --reset --with-faults` for real. --reset truncates every table in
 * DATABASE_URL, so this suite only runs when SEED_DEMO_TEST=1 is set:
 *
 *   SEED_DEMO_TEST=1 pnpm --filter @brightloop/api exec vitest run src/db/seed-demo.test.ts
 */
const enabled = dbAvailable && process.env.SEED_DEMO_TEST === "1";
const TZ = process.env.BUSINESS_TZ ?? "Asia/Kolkata";

afterAll(closeTestDb);

const count = async (query: ReturnType<typeof sql>) =>
  Number(((await testDb!.execute(query)).rows[0] as { n: number | string }).n);

describe.skipIf(!enabled)("seed:demo --reset --with-faults (Postgres, destructive)", () => {
  beforeAll(() => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/db/seed-demo.ts", "--reset", "--with-faults", "--subs=40"],
      { stdio: "inherit", env: process.env },
    );
    expect(result.status).toBe(0);
  }, 900_000);

  it("keeps invoices_subscription_period_unique in place", async () => {
    const n = await count(sql`
      select count(*)::int as n from pg_constraint
      where conname = 'invoices_subscription_period_unique' and conrelid = 'invoices'::regclass and contype = 'u'`);
    expect(n).toBe(1);
  });

  it("plants the duplicate as an overlapping period, detected by duplicate_invoice", async () => {
    const { rows } = await testDb!.execute(sql`
      select evidence from integrity_findings where rule = 'duplicate_invoice' and status = 'open'`);
    expect(rows).toHaveLength(1);
    const evidence = rows[0]!.evidence as Record<string, string>;
    expect(evidence.recommendedAction).toBe("void_duplicate");
    expect(evidence.periodEnd).toBe(evidence.originalPeriodEnd);
    expect(Date.parse(evidence.periodStart!) - Date.parse(evidence.originalPeriodStart!)).toBe(86_400_000);
  });

  it("bills nothing new when the live billing run is repeated on the seeded data", async () => {
    const db = testDb!;
    const domain = createDomainServices({
      db,
      auditService: createAuditService({ repo: createAuditRepository(db), timezone: TZ }),
      eventBus: createEventBus(),
      mailer: { send: async () => {} },
      timezone: TZ,
    });
    // The planted missing_invoice fault is an active subscription that was deliberately
    // never billed; a rerun is supposed to bill it. Every other subscription is billed up
    // to today, so a rerun over them must not create a single invoice.
    const { rows } = await db.execute(sql`
      select id from subscriptions where notes is distinct from 'Planted fault: never billed'`);
    const subscriptionIds = rows.map((r) => r.id as string);
    const before = await count(sql`select count(*)::int as n from invoices`);

    const run = await domain.billingService.run({
      mode: "live",
      trigger: "manual",
      actor: null,
      subscriptionIds,
      skipIntegrityScan: true,
    });

    expect(run.failedCount).toBe(0);
    expect(run.invoicedCount).toBe(0);
    expect(run.items.filter((i) => i.outcome === "created")).toEqual([]);
    expect(await count(sql`select count(*)::int as n from invoices`)).toBe(before);
  });
});
