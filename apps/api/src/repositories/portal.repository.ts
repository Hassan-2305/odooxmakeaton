import type {
  InvoiceStatus,
  PortalInvoice,
  PortalInvoiceDetail,
  PortalPayment,
  PortalRequest,
  PortalRequestInput,
  PortalSubscription,
  SubscriptionStatus,
} from "@brightloop/shared";
import { type SQL, sql } from "drizzle-orm";
import { auditLog } from "../db/schema/index.js";
import type { DbOrTx } from "./audit.repository.js";

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? null : String(v));

/**
 * Customer-facing reads. Every query takes the customer id as its first argument
 * and filters by it; a row belonging to another customer is simply not found.
 * Draft subscriptions and draft invoices are never shown to customers.
 */
export function createPortalRepository(db: DbOrTx) {
  function invoicesQuery(customerId: string, extra: SQL = sql`true`) {
    return sql`
      select i.id, i.number, i.subscription_id, i.status,
             to_char(i.period_start, 'YYYY-MM-DD') as period_start,
             to_char(i.period_end, 'YYYY-MM-DD') as period_end,
             to_char(i.issue_date, 'YYYY-MM-DD') as issue_date,
             to_char(i.due_date, 'YYYY-MM-DD') as due_date,
             i.subtotal_paise, i.discount_total_paise, i.tax_total_paise, i.total_paise,
             coalesce(a.allocated, 0) as paid
      from invoices i
      left join lateral (
        select sum(pa.amount_paise) as allocated from payment_allocations pa where pa.invoice_id = i.id
      ) a on true
      where i.customer_id = ${customerId}::uuid and i.status <> 'draft' and ${extra}`;
  }

  function toInvoice(r: Record<string, unknown>): PortalInvoice {
    const total = num(r.total_paise);
    const paid = num(r.paid);
    return {
      id: String(r.id),
      number: str(r.number),
      subscriptionId: str(r.subscription_id),
      status: r.status as InvoiceStatus,
      periodStart: String(r.period_start),
      periodEnd: String(r.period_end),
      issueDate: str(r.issue_date),
      dueDate: str(r.due_date),
      totalPaise: total,
      paidPaise: paid,
      balancePaise: r.status === "cancelled" ? 0 : Math.max(total - paid, 0),
    };
  }

  return {
    async listSubscriptions(customerId: string): Promise<PortalSubscription[]> {
      const { rows } = await db.execute(sql`
        select s.id, s.number, s.status, rp.name as plan_name, rp.interval, rp.interval_count,
               to_char(s.start_date, 'YYYY-MM-DD') as start_date,
               to_char(s.expiry_date, 'YYYY-MM-DD') as expiry_date,
               to_char(s.next_invoice_date, 'YYYY-MM-DD') as next_invoice_date,
               coalesce(l.amount, 0) as amount
        from subscriptions s
        join recurring_plans rp on rp.id = s.recurring_plan_id
        left join lateral (
          select sum(sl.quantity::bigint * sl.unit_price_paise) as amount
          from subscription_lines sl where sl.subscription_id = s.id
        ) l on true
        where s.customer_id = ${customerId}::uuid and s.status <> 'draft'
        order by s.start_date desc, s.number desc
      `);
      return rows.map((r) => ({
        id: String(r.id),
        number: String(r.number),
        status: r.status as SubscriptionStatus,
        planName: String(r.plan_name),
        interval: r.interval as PortalSubscription["interval"],
        intervalCount: num(r.interval_count),
        startDate: String(r.start_date),
        expiryDate: str(r.expiry_date),
        nextInvoiceDate: str(r.next_invoice_date),
        recurringAmountPaise: num(r.amount),
      }));
    },

    async findSubscription(customerId: string, id: string) {
      const { rows } = await db.execute(sql`
        select s.id, s.number, s.status from subscriptions s
        where s.customer_id = ${customerId}::uuid and s.id = ${id}::uuid and s.status <> 'draft'
      `);
      const r = rows[0];
      return r ? { id: String(r.id), number: String(r.number), status: r.status as SubscriptionStatus } : null;
    },

    async listInvoices(customerId: string): Promise<PortalInvoice[]> {
      const { rows } = await db.execute(
        sql`${invoicesQuery(customerId)} order by i.issue_date desc nulls last, i.period_start desc`,
      );
      return rows.map(toInvoice);
    },

    async findInvoice(customerId: string, id: string): Promise<PortalInvoiceDetail | null> {
      const { rows } = await db.execute(invoicesQuery(customerId, sql`i.id = ${id}::uuid`));
      const r = rows[0];
      if (!r) return null;
      const { rows: lines } = await db.execute(sql`
        select kind, description, quantity, unit_price_paise, amount_paise
        from invoice_lines where invoice_id = ${id}::uuid
        order by sort_order, id
      `);
      return {
        ...toInvoice(r),
        subtotalPaise: num(r.subtotal_paise),
        discountTotalPaise: num(r.discount_total_paise),
        taxTotalPaise: num(r.tax_total_paise),
        lines: lines.map((l) => ({
          kind: l.kind as "product" | "discount",
          description: String(l.description),
          quantity: num(l.quantity),
          unitPricePaise: num(l.unit_price_paise),
          amountPaise: num(l.amount_paise),
        })),
      };
    },

    async listPayments(customerId: string): Promise<PortalPayment[]> {
      const { rows } = await db.execute(sql`
        select p.id, p.method, p.amount_paise, to_char(p.paid_on, 'YYYY-MM-DD') as paid_on, p.reference,
               coalesce(
                 (select json_agg(json_build_object(
                           'invoiceId', i.id, 'invoiceNumber', i.number, 'amountPaise', pa.amount_paise)
                         order by i.number)
                  from payment_allocations pa
                  join invoices i on i.id = pa.invoice_id
                  where pa.payment_id = p.id),
                 '[]'::json
               ) as allocations
        from payments p
        where p.customer_id = ${customerId}::uuid
        order by p.paid_on desc, p.created_at desc
      `);
      return rows.map((r) => ({
        id: String(r.id),
        method: String(r.method),
        amountPaise: num(r.amount_paise),
        paidOn: String(r.paid_on),
        reference: str(r.reference),
        allocations: (r.allocations as { invoiceId: string; invoiceNumber: string | null; amountPaise: unknown }[]).map(
          (a) => ({ ...a, amountPaise: num(a.amountPaise) }),
        ),
      }));
    },

    /** Stores the request as an audit_log row on the subscription. */
    async createRequest(
      actorUserId: string,
      customerId: string,
      input: PortalRequestInput,
    ): Promise<PortalRequest> {
      const [row] = await db
        .insert(auditLog)
        .values({
          actorUserId,
          action: `portal.request.${input.type}`,
          entityType: "subscription",
          entityId: input.subscriptionId,
          before: null,
          after: { type: input.type, message: input.message, customerId, status: "pending" },
        })
        .returning({ id: auditLog.id, createdAt: auditLog.createdAt });
      return {
        id: row!.id,
        type: input.type,
        subscriptionId: input.subscriptionId,
        message: input.message,
        createdAt: row!.createdAt.toISOString(),
      };
    },
  };
}

export type PortalRepository = ReturnType<typeof createPortalRepository>;
