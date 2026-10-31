import type {
  ListResponse,
  Subscription,
  SubscriptionEvent,
  SubscriptionLine,
  SubscriptionListQuery,
  SubscriptionStatus,
} from "@brightloop/shared";
import { and, asc, count, desc, eq, gte, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  customers,
  recurringPlans,
  subscriptionEvents,
  subscriptionLines,
  subscriptionLineTaxes,
  subscriptions,
} from "../db/schema/index.js";
import { addDays } from "../lib/dates.js";
import { orderByFromSort, paginate } from "../lib/paginate.js";
import type { DbOrTx } from "./audit.repository.js";

type SubscriptionValues = typeof subscriptions.$inferInsert;

export interface NewSubscriptionLine {
  productId: string;
  variantId: string | null;
  description: string;
  quantity: number;
  unitPricePaise: number;
  sortOrder: number;
  taxes: { taxId: string; name: string; rateBps: number; inclusive: boolean }[];
}

export interface NewSubscriptionEvent {
  subscriptionId: string;
  type: string;
  fromStatus?: SubscriptionStatus | null;
  toStatus?: SubscriptionStatus | null;
  actorUserId?: string | null;
  payload?: unknown;
}

const recurringAmountSql = sql<number>`coalesce((
  select sum(${subscriptionLines.quantity} * ${subscriptionLines.unitPricePaise})
  from ${subscriptionLines}
  where ${subscriptionLines.subscriptionId} = ${subscriptions.id}
), 0)::bigint`.mapWith(Number);

const listSelect = {
  sub: subscriptions,
  customerName: customers.name,
  planName: recurringPlans.name,
  recurringAmountPaise: recurringAmountSql,
};

type ListRow = {
  sub: typeof subscriptions.$inferSelect;
  customerName: string;
  planName: string;
  recurringAmountPaise: number;
};

function toSubscription({ sub, customerName, planName, recurringAmountPaise }: ListRow): Subscription {
  return {
    id: sub.id,
    number: sub.number,
    customerId: sub.customerId,
    customerName,
    recurringPlanId: sub.recurringPlanId,
    planName,
    quotationTemplateId: sub.quotationTemplateId,
    status: sub.status,
    currency: sub.currency,
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    nextInvoiceDate: sub.nextInvoiceDate,
    anchorDay: sub.anchorDay,
    paymentTermsDays: sub.paymentTermsDays,
    quotationExpiresAt: sub.quotationExpiresAt?.toISOString() ?? null,
    notes: sub.notes,
    recurringAmountPaise,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
  };
}

const sortColumns = {
  number: subscriptions.number,
  startDate: subscriptions.startDate,
  expiryDate: subscriptions.expiryDate,
  nextInvoiceDate: subscriptions.nextInvoiceDate,
  createdAt: subscriptions.createdAt,
};

export function createSubscriptionsRepository(db: Db) {
  function baseQuery(tx: DbOrTx) {
    return tx
      .select(listSelect)
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .innerJoin(recurringPlans, eq(recurringPlans.id, subscriptions.recurringPlanId));
  }

  return {
    /** `today` (business timezone) anchors the expiringWithinDays filter. */
    async list(query: SubscriptionListQuery, today: string): Promise<ListResponse<Subscription>> {
      const filters: SQL[] = [];
      if (query.status) filters.push(eq(subscriptions.status, query.status));
      if (query.customerId) filters.push(eq(subscriptions.customerId, query.customerId));
      if (query.planId) filters.push(eq(subscriptions.recurringPlanId, query.planId));
      if (query.expiringWithinDays !== undefined) {
        filters.push(
          gte(subscriptions.expiryDate, today),
          lte(subscriptions.expiryDate, addDays(today, query.expiringWithinDays)),
        );
      }
      const where = filters.length ? and(...filters) : undefined;
      const orderBy = [...orderByFromSort(query.sort, sortColumns), subscriptions.id];
      return paginate(query, async ({ limit, offset }) => {
        const [rows, [totalRow]] = await Promise.all([
          baseQuery(db).where(where).orderBy(...orderBy).limit(limit).offset(offset),
          db.select({ total: count() }).from(subscriptions).where(where),
        ]);
        return { rows: rows.map(toSubscription), total: totalRow?.total ?? 0 };
      });
    },

    async findById(id: string, tx: DbOrTx = db): Promise<Subscription | undefined> {
      const [row] = await baseQuery(tx).where(eq(subscriptions.id, id)).limit(1);
      return row && toSubscription(row);
    },

    /** Locks the subscription row (FOR UPDATE) until `tx` ends. */
    async lock(tx: DbOrTx, id: string) {
      const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for("update");
      return row;
    },

    async lines(id: string, tx: DbOrTx = db): Promise<SubscriptionLine[]> {
      const rows = await tx
        .select()
        .from(subscriptionLines)
        .where(eq(subscriptionLines.subscriptionId, id))
        .orderBy(asc(subscriptionLines.sortOrder), asc(subscriptionLines.id));
      const taxes = rows.length
        ? await tx
            .select()
            .from(subscriptionLineTaxes)
            .where(inArray(subscriptionLineTaxes.subscriptionLineId, rows.map((r) => r.id)))
            .orderBy(asc(subscriptionLineTaxes.name))
        : [];
      return rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        variantId: r.variantId,
        description: r.description,
        quantity: r.quantity,
        unitPricePaise: r.unitPricePaise,
        sortOrder: r.sortOrder,
        taxes: taxes
          .filter((t) => t.subscriptionLineId === r.id)
          .map(({ taxId, name, rateBps, inclusive }) => ({ taxId, name, rateBps, inclusive })),
      }));
    },

    async events(id: string, tx: DbOrTx = db): Promise<SubscriptionEvent[]> {
      const rows = await tx
        .select()
        .from(subscriptionEvents)
        .where(eq(subscriptionEvents.subscriptionId, id))
        .orderBy(desc(subscriptionEvents.createdAt), desc(subscriptionEvents.id));
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        actorUserId: r.actorUserId,
        payload: r.payload,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async insert(tx: DbOrTx, values: SubscriptionValues): Promise<string> {
      const [row] = await tx.insert(subscriptions).values(values).returning({ id: subscriptions.id });
      return row!.id;
    },

    async insertLines(tx: DbOrTx, subscriptionId: string, lines: NewSubscriptionLine[]) {
      for (const { taxes, ...line } of lines) {
        const [row] = await tx
          .insert(subscriptionLines)
          .values({ ...line, subscriptionId })
          .returning({ id: subscriptionLines.id });
        if (taxes.length) {
          await tx.insert(subscriptionLineTaxes).values(taxes.map((t) => ({ ...t, subscriptionLineId: row!.id })));
        }
      }
    },

    async update(tx: DbOrTx, id: string, values: Partial<SubscriptionValues>) {
      await tx
        .update(subscriptions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(subscriptions.id, id));
    },

    async insertEvent(tx: DbOrTx, event: NewSubscriptionEvent) {
      await tx.insert(subscriptionEvents).values({ ...event, payload: event.payload ?? null });
    },

    transaction: <T>(fn: (tx: DbOrTx) => Promise<T>) => db.transaction(fn),
  };
}

export type SubscriptionsRepository = ReturnType<typeof createSubscriptionsRepository>;
