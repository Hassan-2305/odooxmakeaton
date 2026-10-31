import {
  FINDING_RULES,
  type FindingListQuery,
  type FindingRule,
  type FindingStatus,
  type IntegrityFinding,
  type IntegrityFindingEvent,
  type ListResponse,
} from "@brightloop/shared";
import { and, asc, count, eq, type SQL, sql } from "drizzle-orm";
import { integrityFindingEvents, integrityFindings, users } from "../db/schema/index.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

/**
 * Detection rules. Each SELECT returns one row per offending record with the same
 * columns; (rule, entity_id) identifies a finding across scans.
 *
 *  missing_invoice     active subscription whose next_invoice_date is more than a day
 *                      past and has no non-cancelled invoice for that period.
 *  duplicate_invoice   non-cancelled invoice whose billing period overlaps the period of an
 *                      earlier non-cancelled invoice for the same subscription (periods are
 *                      half-open [period_start, period_end), so exact duplicates count too).
 *                      The earliest overlapping invoice is the original; each later one is a
 *                      finding, with void_duplicate as the recommended action.
 *  unallocated_payment payment whose allocations add up to less than its amount.
 */
function candidatesSql(today: string): SQL {
  return sql`
    select 'missing_invoice'::text as rule, 'high'::finding_severity as severity,
           'subscription'::text as entity_type, s.id as entity_id, s.customer_id,
           jsonb_build_object('invoiceForPeriodStart', s.next_invoice_date) as expected,
           jsonb_build_object('invoiceForPeriodStart', null) as actual,
           coalesce(l.amount, 0)::bigint as impact_paise,
           jsonb_build_object(
             'subscriptionNumber', s.number,
             'nextInvoiceDate', s.next_invoice_date,
             'daysLate', ${today}::date - s.next_invoice_date,
             'periodAmountPaise', coalesce(l.amount, 0)
           ) as evidence
    from subscriptions s
    left join lateral (
      select sum(sl.quantity::bigint * sl.unit_price_paise) as amount
      from subscription_lines sl where sl.subscription_id = s.id
    ) l on true
    where s.status = 'active'
      and s.next_invoice_date < ${today}::date - 1
      and not exists (
        select 1 from invoices i
        where i.subscription_id = s.id
          and i.period_start = s.next_invoice_date
          and i.status <> 'cancelled'
      )

    union all

    select 'duplicate_invoice', 'high', 'invoice', o.id, o.customer_id,
           jsonb_build_object('overlappingInvoices', 0),
           jsonb_build_object('overlappingInvoices', o.n),
           o.total_paise,
           jsonb_build_object(
             'subscriptionId', o.subscription_id,
             'recommendedAction', 'void_duplicate',
             'invoiceId', o.id,
             'invoiceNumber', o.number,
             'periodStart', o.period_start,
             'periodEnd', o.period_end,
             'originalInvoiceId', o.original_id,
             'originalInvoiceNumber', o.original_number,
             'originalPeriodStart', o.original_period_start,
             'originalPeriodEnd', o.original_period_end,
             'overlapStart', greatest(o.period_start, o.original_period_start),
             'overlapEnd', least(o.period_end, o.original_period_end)
           )
    from (
      -- Each invoice d paired with every earlier invoice a whose period intersects d's;
      -- the earliest such a is the original and n counts all of them.
      select distinct on (d.id)
             d.id, d.customer_id, d.subscription_id, d.number, d.period_start, d.period_end, d.total_paise,
             a.id as original_id, a.number as original_number,
             a.period_start as original_period_start, a.period_end as original_period_end,
             count(*) over (partition by d.id) as n
      from invoices d
      join invoices a
        on a.subscription_id = d.subscription_id
       and a.period_start < d.period_end
       and d.period_start < a.period_end
       and (a.created_at, a.id) < (d.created_at, d.id)
      where d.status <> 'cancelled' and a.status <> 'cancelled'
      order by d.id, a.created_at, a.id
    ) o

    union all

    select 'unallocated_payment', 'medium', 'payment', p.id, p.customer_id,
           jsonb_build_object('allocatedPaise', p.amount_paise),
           jsonb_build_object('allocatedPaise', a.allocated),
           p.amount_paise - a.allocated,
           jsonb_build_object(
             'paymentAmountPaise', p.amount_paise,
             'allocatedPaise', a.allocated,
             'unallocatedPaise', p.amount_paise - a.allocated,
             'paidOn', p.paid_on,
             'method', p.method,
             'reference', p.reference
           )
    from payments p
    cross join lateral (
      select coalesce(sum(pa.amount_paise), 0)::bigint as allocated
      from payment_allocations pa where pa.payment_id = p.id
    ) a
    where a.allocated < p.amount_paise`;
}

const RULES_ARRAY = sql`array[${sql.join(
  FINDING_RULES.map((r) => sql`${r}`),
  sql`, `,
)}]::text[]`;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toFinding(row: typeof integrityFindings.$inferSelect): IntegrityFinding {
  return {
    id: row.id,
    rule: row.rule,
    severity: row.severity,
    status: row.status,
    entityType: row.entityType,
    entityId: row.entityId,
    customerId: row.customerId,
    expected: row.expected,
    actual: row.actual,
    impactPaise: row.impactPaise,
    confirmedImpactPaise: row.confirmedImpactPaise,
    evidence: row.evidence,
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const sortColumns = {
  detectedAt: integrityFindings.detectedAt,
  impactPaise: integrityFindings.impactPaise,
  severity: integrityFindings.severity,
  updatedAt: integrityFindings.updatedAt,
};

function integrityQueries(db: DbOrTx) {
  return {
    /** The handle this repository writes through, for audit rows in the same transaction. */
    db,

    /**
     * Evaluates every rule and reconciles integrity_findings in one transaction:
     * new offenders get an open finding, findings that match again are refreshed
     * (resolved ones reopen; dismissed ones stay dismissed), and open or confirmed
     * findings whose condition is gone are auto-resolved. Each status change is
     * logged to integrity_finding_events.
     *
     * There is no unique index on (rule, entity_id), so scans take a transaction-level
     * advisory lock; that keeps one finding per (rule, entity_id).
     */
    async scan(today: string, actorUserId: string | null) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('integrity_findings_scan'))`);
        await tx.execute(sql`drop table if exists pg_temp.integrity_scan_candidates`);
        await tx.execute(
          sql`create temp table integrity_scan_candidates on commit drop as ${candidatesSql(today)}`,
        );

        const { rows: byRuleRows } = await tx.execute(
          sql`select rule, count(*) as n from integrity_scan_candidates group by rule`,
        );

        const { rows: reopened } = await tx.execute(sql`
          with refreshed as (
            update integrity_findings f
            set severity = c.severity, customer_id = c.customer_id, expected = c.expected,
                actual = c.actual, impact_paise = c.impact_paise, evidence = c.evidence,
                status = case when old.status = 'resolved' then 'open'::finding_status else old.status end,
                resolved_at = case when old.status = 'resolved' then null else old.resolved_at end,
                updated_at = now()
            from integrity_scan_candidates c, integrity_findings old
            where f.rule = c.rule and f.entity_id = c.entity_id and old.id = f.id
            returning f.id, old.status as old_status
          )
          insert into integrity_finding_events (finding_id, from_status, to_status, actor_user_id, note, created_at)
          select id, old_status, 'open', ${actorUserId}::uuid, 'Reopened: condition detected again', clock_timestamp()
          from refreshed where old_status = 'resolved'
          returning finding_id
        `);

        const { rows: created } = await tx.execute(sql`
          with inserted as (
            insert into integrity_findings
              (rule, severity, entity_type, entity_id, customer_id, expected, actual, impact_paise, evidence)
            select c.rule, c.severity, c.entity_type, c.entity_id, c.customer_id,
                   c.expected, c.actual, c.impact_paise, c.evidence
            from integrity_scan_candidates c
            where not exists (
              select 1 from integrity_findings f where f.rule = c.rule and f.entity_id = c.entity_id
            )
            returning id
          )
          insert into integrity_finding_events (finding_id, from_status, to_status, actor_user_id, note, created_at)
          select id, null, 'open', ${actorUserId}::uuid, 'Detected by scan', clock_timestamp() from inserted
          returning finding_id
        `);

        const { rows: autoResolved } = await tx.execute(sql`
          with resolved as (
            update integrity_findings f
            set status = 'resolved', resolved_at = greatest(now(), f.detected_at), updated_at = now()
            from integrity_findings old
            where old.id = f.id
              and f.rule = any(${RULES_ARRAY})
              and f.status in ('open', 'confirmed')
              and not exists (
                select 1 from integrity_scan_candidates c
                where c.rule = f.rule and c.entity_id = f.entity_id
              )
            returning f.id, old.status as old_status
          )
          insert into integrity_finding_events (finding_id, from_status, to_status, actor_user_id, note, created_at)
          select id, old_status, 'resolved', ${actorUserId}::uuid, 'Auto-resolved: condition no longer detected', clock_timestamp()
          from resolved
          returning finding_id
        `);

        const byRule = Object.fromEntries(FINDING_RULES.map((r) => [r, 0])) as Record<FindingRule, number>;
        for (const r of byRuleRows) byRule[r.rule as FindingRule] = Number(r.n);

        return {
          detected: Object.values(byRule).reduce((a, b) => a + b, 0),
          byRule,
          created: created.length,
          reopened: reopened.length,
          autoResolved: autoResolved.length,
        };
      });
    },

    async list(query: FindingListQuery): Promise<ListResponse<IntegrityFinding>> {
      const f = integrityFindings;
      const filters: SQL[] = [];
      if (query.status) filters.push(eq(f.status, query.status));
      if (query.rule) filters.push(eq(f.rule, query.rule));
      if (query.severity) filters.push(eq(f.severity, query.severity));
      if (query.customerId) filters.push(eq(f.customerId, query.customerId));
      if (query.entityType) filters.push(eq(f.entityType, query.entityType));
      if (query.entityId) filters.push(eq(f.entityId, query.entityId));
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), asc(f.id)];

      return paginate(query, async ({ limit, offset }) => {
        const rows = await db.select().from(f).where(where).orderBy(...orderBy).limit(limit).offset(offset);
        const [totalRow] = await db.select({ total: count() }).from(f).where(where);
        return { rows: rows.map(toFinding), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, { forUpdate = false } = {}): Promise<IntegrityFinding | null> {
      const q = db.select().from(integrityFindings).where(eq(integrityFindings.id, id));
      const [row] = forUpdate ? await q.for("update") : await q;
      return row ? toFinding(row) : null;
    },

    async events(findingId: string): Promise<IntegrityFindingEvent[]> {
      const e = integrityFindingEvents;
      const rows = await db
        .select({
          id: e.id,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          note: e.note,
          createdAt: e.createdAt,
          actorId: users.id,
          actorName: users.name,
          actorEmail: users.email,
        })
        .from(e)
        .leftJoin(users, eq(users.id, e.actorUserId))
        .where(eq(e.findingId, findingId))
        .orderBy(asc(e.createdAt), asc(e.id));
      return rows.map(({ actorId, actorName, actorEmail, createdAt, ...row }) => ({
        ...row,
        actor: actorId ? { id: actorId, name: actorName!, email: actorEmail! } : null,
        createdAt: createdAt.toISOString(),
      }));
    },

    /** Sets the status and logs the change to integrity_finding_events. */
    async setStatus(
      finding: IntegrityFinding,
      to: FindingStatus,
      actorUserId: string,
      note: string | null,
    ): Promise<IntegrityFinding> {
      const [row] = await db
        .update(integrityFindings)
        .set({
          status: to,
          resolvedAt: to === "resolved" ? sql`greatest(now(), ${integrityFindings.detectedAt})` : null,
          updatedAt: sql`now()`,
        })
        .where(eq(integrityFindings.id, finding.id))
        .returning();
      await db.insert(integrityFindingEvents).values({
        findingId: finding.id,
        fromStatus: finding.status,
        toStatus: to,
        actorUserId,
        note,
        // clock_timestamp, not now(): keeps events ordered within one transaction.
        createdAt: sql`clock_timestamp()`,
      });
      return toFinding(row!);
    },
  };
}

export type IntegrityQueries = ReturnType<typeof integrityQueries>;

export function createIntegrityRepository(db: DbOrTx) {
  return {
    ...integrityQueries(db),
    /** Runs `fn` in a transaction (a savepoint when `db` is already one). */
    transaction<T>(fn: (repo: IntegrityQueries) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(integrityQueries(tx)));
    },
  };
}

export type IntegrityRepository = ReturnType<typeof createIntegrityRepository>;
