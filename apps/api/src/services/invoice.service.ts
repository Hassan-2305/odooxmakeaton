import { addDays } from "../lib/dates.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { InvoiceRow, InvoicesRepository } from "../repositories/invoices.repository.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import type { SubscriptionsRepository } from "../repositories/subscriptions.repository.js";
import type { DiscountService } from "./discount.service.js";
import { computeInvoice, type ComputedInvoice, type PricedLine } from "./invoice-math.js";
import type { AppliedRate, TaxService } from "./tax.service.js";

export interface BillingPeriod {
  start: string;
  /** Exclusive: the start of the next period. */
  end: string;
}

export interface BuildSubscription {
  id: string;
  customerId: string;
  paymentTermsDays: number;
}

export interface BuildOptions {
  /** Issue date (business timezone). Taxes and discounts are evaluated on this day. */
  invoiceDate: string;
  billingRunId?: string | null;
}

export interface BuiltInvoice {
  invoice: InvoiceRow;
  computed: ComputedInvoice;
}

interface Deps {
  invoices: InvoicesRepository;
  subscriptions: Pick<SubscriptionsRepository, "lines">;
  settings: SettingsRepository;
  taxService: Pick<TaxService, "applicableRates">;
  discountService: Pick<DiscountService, "eligible" | "consume">;
}

export function createInvoiceService({ invoices, subscriptions, settings, taxService, discountService }: Deps) {
  return {
    /**
     * Builds a draft invoice for one subscription period inside `tx`: lines from the
     * subscription_lines price snapshots, automatic discounts (eligible, then consumed),
     * per-line taxes with the rates snapshotted onto invoice_line_taxes, totals in paise,
     * due date = invoice date + payment terms, and a frozen customer snapshot.
     *
     * Throws a unique violation if the period was already invoiced.
     */
    async build(sub: BuildSubscription, period: BillingPeriod, tx: DbOrTx, opts: BuildOptions): Promise<BuiltInvoice> {
      const subLines = await subscriptions.lines(sub.id, tx);
      if (!subLines.length) throw new Error("Subscription has no lines");

      const priced: PricedLine[] = [];
      for (const line of subLines) {
        const current = line.taxes.filter((t) => t.taxId).map((t) => t.taxId!);
        // Rates in effect on the invoice date; a tax deleted since keeps its line snapshot.
        const rates: AppliedRate[] = [
          ...(await taxService.applicableRates(current, opts.invoiceDate, tx)),
          ...line.taxes
            .filter((t) => !t.taxId)
            .map((t) => ({ taxId: null, name: t.name, rateBps: t.rateBps, inclusive: t.inclusive })),
        ];
        priced.push({
          subscriptionLineId: line.id,
          productId: line.productId,
          variantId: line.variantId,
          description: line.description,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          rates,
        });
      }

      const gross = priced.map((l) => l.quantity * l.unitPricePaise);
      const eligible = await discountService.eligible(
        {
          lines: priced.map((l, i) => ({ productId: l.productId, quantity: l.quantity, amountPaise: gross[i]! })),
          subtotal: gross.reduce((a, b) => a + b, 0),
          qty: priced.reduce((a, l) => a + l.quantity, 0),
          date: opts.invoiceDate,
        },
        tx,
      );
      const computed = computeInvoice(priced, eligible);
      // Only rules that actually reduce the invoice use up an application.
      for (const d of computed.discounts) await discountService.consume(d.rule.id, tx);

      const customer = await invoices.customerSnapshot(tx, sub.customerId);
      if (!customer) throw new Error("Customer not found");

      const number = await settings.nextNumber(tx, "invoice");
      const invoice = await invoices.insertInvoice(tx, {
        number,
        subscriptionId: sub.id,
        customerId: sub.customerId,
        billingRunId: opts.billingRunId ?? null,
        status: "draft",
        periodStart: period.start,
        periodEnd: period.end,
        issueDate: opts.invoiceDate,
        dueDate: addDays(opts.invoiceDate, sub.paymentTermsDays),
        customerSnapshot: customer,
        subtotalPaise: computed.subtotalPaise,
        discountTotalPaise: computed.discountTotalPaise,
        taxTotalPaise: computed.taxTotalPaise,
        totalPaise: computed.totalPaise,
      });

      let sortOrder = 0;
      for (const line of computed.lines) {
        await invoices.insertLine(
          tx,
          invoice.id,
          {
            kind: "product",
            subscriptionLineId: line.subscriptionLineId,
            productId: line.productId,
            variantId: line.variantId,
            description: line.description,
            quantity: line.quantity,
            unitPricePaise: line.unitPricePaise,
            amountPaise: line.netBeforePaise,
            sortOrder: sortOrder++,
          },
          line.taxes.map((t) => ({
            taxId: t.taxId,
            name: t.name,
            rateBps: t.rateBps,
            inclusive: t.inclusive,
            taxableAmountPaise: t.taxableAmountPaise,
            taxAmountPaise: t.taxAmountPaise,
          })),
        );
      }
      for (const d of computed.discounts) {
        const lineId = await invoices.insertLine(tx, invoice.id, {
          kind: "discount",
          description: `Discount: ${d.rule.name}`,
          quantity: 1,
          unitPricePaise: d.amountPaise,
          amountPaise: d.amountPaise,
          sortOrder: sortOrder++,
        });
        await invoices.insertDiscountApplication(tx, {
          discountRuleId: d.rule.id,
          invoiceId: invoice.id,
          invoiceLineId: lineId,
          amountPaise: d.amountPaise,
        });
      }

      return { invoice, computed };
    },
  };
}

export type InvoiceService = ReturnType<typeof createInvoiceService>;
