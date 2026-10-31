import type { AgingBucket } from "@brightloop/shared";
import { type SQL, sql } from "drizzle-orm";
import type { DbOrTx } from "./audit.repository.js";

/**
 * Monthly value of one subscription, pre-tax and pre-discount, from its line total
 * `amount` and its plan's interval: daily × 30, weekly × 52 / 12, yearly / 12,
 * each divided by the plan's interval_count. Numeric; round after summing.
 */
export function monthlyAmountSql(amount: SQL, interval: SQL, intervalCount: SQL): SQL {
  return sql`(case ${interval}
      when 'day' then ${amount} * 30.0
      when 'week' then ${amount} * 52.0 / 12
      when 'month' then ${amount} * 1.0
      when 'year' then ${amount} / 12.0
    end / ${intervalCount})`;
}

/** Line total (quantity × unit price) of every subscription line, as a lateral join `l`. */
const subscriptionAmountJoin = sql`left join lateral (
    select sum(sl.quantity::bigint * sl.unit_price_paise) as amount
    from subscription_lines sl
    where sl.subscription_id = s.id
  ) l on true`;

/** `true` when no customer filter is given, otherwise `column = customerId`. */
export function customerFilter(column: SQL, customerId: string | undefined): SQL {
  return customerId ? sql`${column} = ${customerId}::uuid` : sql`true`;
}

/**
 * Confirmed invoices with their unpaid balance (total minus allocated payments).
 * Paid, draft and cancelled invoices are excluded.
 */
function openInvoicesCte(customerId: string | undefined): SQL {
  return sql`open_invoices as (
    select i.id, i.customer_id, i.due_date, i.issue_date,
           i.total_paise - coalesce(a.allocated, 0) as balance
    from invoices i
    left join lateral (
      select sum(pa.amount_paise) as allocated
      from payment_allocations pa
      where pa.invoice_id = i.id
    ) a on true
    where i.status = 'confirmed' and ${customerFilter(sql`i.customer_id`, customerId)}
  )`;
}

const num = (v: unknown) => Number(v ?? 0);

export function createReportsRepository(db: DbOrTx) {
  return {
    async summary(p: { from: string; to: string; today: string; customerId?: string }) {
      const { rows } = await db.execute(sql`
        with active_subs as (
          select s.id,
                 ${monthlyAmountSql(sql`coalesce(l.amount, 0)`, sql`rp.interval`, sql`rp.interval_count`)} as monthly
          from subscriptions s
          join recurring_plans rp on rp.id = s.recurring_plan_id
          ${subscriptionAmountJoin}
          where s.status = 'active' and ${customerFilter(sql`s.customer_id`, p.customerId)}
        ),
        ${openInvoicesCte(p.customerId)}
        select
          (select count(*) from active_subs) as active_subscriptions,
          (select round(coalesce(sum(monthly), 0)) from active_subs) as mrr,
          (select coalesce(sum(i.total_paise), 0) from invoices i
            where i.status in ('confirmed', 'paid')
              and i.issue_date between ${p.from}::date and ${p.to}::date
              and ${customerFilter(sql`i.customer_id`, p.customerId)}) as invoiced,
          (select coalesce(sum(pa.amount_paise), 0) from payment_allocations pa
            join payments pm on pm.id = pa.payment_id
            where pm.paid_on between ${p.from}::date and ${p.to}::date
              and ${customerFilter(sql`pm.customer_id`, p.customerId)}) as collected,
          (select coalesce(sum(balance), 0) from open_invoices where balance > 0) as outstanding,
          (select count(*) from open_invoices
            where balance > 0 and due_date < ${p.today}::date) as overdue_count,
          (select coalesce(sum(balance), 0) from open_invoices
            where balance > 0 and due_date < ${p.today}::date) as overdue_amount,
          (select count(*) from integrity_findings f
            where f.status in ('open', 'confirmed')
              and ${customerFilter(sql`f.customer_id`, p.customerId)}) as open_findings
      `);
      const r = rows[0] ?? {};
      return {
        activeSubscriptions: num(r.active_subscriptions),
        invoicedPaise: num(r.invoiced),
        collectedPaise: num(r.collected),
        outstandingPaise: num(r.outstanding),
        overdue: { count: num(r.overdue_count), amountPaise: num(r.overdue_amount) },
        mrrPaise: num(r.mrr),
        openFindings: num(r.open_findings),
      };
    },

    /** Unpaid balances bucketed by days past due (due date, or issue date when unset). */
    async aging(p: { today: string; customerId?: string }) {
      const { rows } = await db.execute(sql`
        with ${openInvoicesCte(p.customerId)},
        aged as (
          select balance,
                 ${p.today}::date - coalesce(due_date, issue_date, ${p.today}::date) as days_past_due
          from open_invoices
          where balance > 0
        )
        select
          case
            when days_past_due <= 0 then 'current'
            when days_past_due <= 30 then '0-30'
            when days_past_due <= 60 then '31-60'
            when days_past_due <= 90 then '61-90'
            else '90+'
          end as bucket,
          count(*) as count,
          coalesce(sum(balance), 0) as amount
        from aged
        group by 1
      `);
      return rows.map((r) => ({
        bucket: r.bucket as AgingBucket,
        count: num(r.count),
        amountPaise: num(r.amount),
      }));
    },

    /** One row per day: allocated (collected) and received payment amounts by paid_on. */
    async collections(p: { from: string; to: string; customerId?: string }) {
      const { rows } = await db.execute(sql`
        with days as (
          select d::date as day
          from generate_series(${p.from}::date, ${p.to}::date, interval '1 day') d
        ),
        received as (
          select pm.paid_on, sum(pm.amount_paise) as amount, count(*) as payments
          from payments pm
          where pm.paid_on between ${p.from}::date and ${p.to}::date
            and ${customerFilter(sql`pm.customer_id`, p.customerId)}
          group by pm.paid_on
        ),
        collected as (
          select pm.paid_on, sum(pa.amount_paise) as amount
          from payment_allocations pa
          join payments pm on pm.id = pa.payment_id
          where pm.paid_on between ${p.from}::date and ${p.to}::date
            and ${customerFilter(sql`pm.customer_id`, p.customerId)}
          group by pm.paid_on
        )
        select to_char(days.day, 'YYYY-MM-DD') as date,
               coalesce(c.amount, 0) as collected,
               coalesce(r.amount, 0) as received,
               coalesce(r.payments, 0) as payments
        from days
        left join collected c on c.paid_on = days.day
        left join received r on r.paid_on = days.day
        order by days.day
      `);
      return rows.map((r) => ({
        date: String(r.date),
        collectedPaise: num(r.collected),
        receivedPaise: num(r.received),
        payments: num(r.payments),
      }));
    },

    /** Active subscriptions whose expiry date falls within `days` of today. */
    async renewals(p: { today: string; days: number; customerId?: string }) {
      const { rows } = await db.execute(sql`
        select s.id, s.number, to_char(s.expiry_date, 'YYYY-MM-DD') as expiry_date,
               s.expiry_date - ${p.today}::date as days_left,
               c.id as customer_id, c.name as customer_name,
               rp.name as plan_name, rp.renewable,
               round(${monthlyAmountSql(sql`coalesce(l.amount, 0)`, sql`rp.interval`, sql`rp.interval_count`)}) as mrr
        from subscriptions s
        join customers c on c.id = s.customer_id
        join recurring_plans rp on rp.id = s.recurring_plan_id
        ${subscriptionAmountJoin}
        where s.status = 'active'
          and s.expiry_date between ${p.today}::date and ${p.today}::date + ${p.days}::int
          and ${customerFilter(sql`s.customer_id`, p.customerId)}
        order by s.expiry_date, s.number
      `);
      return rows.map((r) => ({
        subscriptionId: String(r.id),
        number: String(r.number),
        customer: { id: String(r.customer_id), name: String(r.customer_name) },
        planName: String(r.plan_name),
        renewable: Boolean(r.renewable),
        expiryDate: String(r.expiry_date),
        daysLeft: num(r.days_left),
        mrrPaise: num(r.mrr),
      }));
    },
  };
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>;
