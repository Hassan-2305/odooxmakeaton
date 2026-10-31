import type { DiscountRule } from "@brightloop/shared";
import { allocate, bpsOf, mulDivRound } from "../lib/money.js";
import type { AppliedRate } from "./tax.service.js";

export interface PricedLine {
  subscriptionLineId: string | null;
  productId: string;
  variantId: string | null;
  description: string;
  quantity: number;
  /** Snapshot unit price. Includes tax when the line has inclusive taxes. */
  unitPricePaise: number;
  rates: AppliedRate[];
}

export interface LineDiscount {
  rule: Pick<DiscountRule, "id" | "name">;
  /** Per-line amounts in the lines' own price basis (same order as the lines). */
  allocations: number[];
}

export interface ComputedLine extends PricedLine {
  /** quantity × unit price. */
  grossPaise: number;
  /** Net of inclusive tax, before discounts: the invoice line amount. */
  netBeforePaise: number;
  /** Net after discounts: the taxable amount. */
  netAfterPaise: number;
  /** Net discount on this line. */
  discountPaise: number;
  taxes: (AppliedRate & { taxableAmountPaise: number; taxAmountPaise: number })[];
}

export interface ComputedInvoice {
  lines: ComputedLine[];
  /** Net discount per rule; rules that round to zero are left out. */
  discounts: { rule: LineDiscount["rule"]; amountPaise: number }[];
  subtotalPaise: number;
  discountTotalPaise: number;
  taxTotalPaise: number;
  totalPaise: number;
}

/**
 * Invoice arithmetic, rounded per line, all in integer paise:
 *
 *   gross       = quantity × unit price
 *   base        = gross − discounts allocated to the line
 *   inclusive taxes (total rate I): net = round(base × 10000 / (10000 + I)) and the
 *     inclusive tax is base − net, split across the inclusive rates; otherwise net = base
 *   exclusive tax = round(net × rate / 10000) for each exclusive rate
 *
 * subtotal is the sum of pre-discount nets, so total = subtotal − discount + tax holds
 * exactly, and a line with only inclusive taxes and no discount totals its gross.
 */
export function computeInvoice(lines: readonly PricedLine[], discounts: readonly LineDiscount[]): ComputedInvoice {
  const perRule = discounts.map(() => 0);

  const computed = lines.map((line, i): ComputedLine => {
    const gross = line.quantity * line.unitPricePaise;
    const lineDiscount = discounts.reduce((sum, d) => sum + (d.allocations[i] ?? 0), 0);
    const base = gross - lineDiscount;

    const inclusive = line.rates.filter((r) => r.inclusive);
    const exclusive = line.rates.filter((r) => !r.inclusive);
    const inclusiveBps = inclusive.reduce((sum, r) => sum + r.rateBps, 0);
    const toNet = (amount: number) => (inclusiveBps ? mulDivRound(amount, 10_000, 10_000 + inclusiveBps) : amount);

    const netBefore = toNet(gross);
    const netAfter = toNet(base);
    const discountNet = netBefore - netAfter;

    // Split the line's net discount over the rules in proportion to their gross share.
    allocate(discountNet, discounts.map((d) => d.allocations[i] ?? 0)).forEach((amount, k) => {
      perRule[k]! += amount;
    });

    const inclusiveAmounts = allocate(base - netAfter, inclusive.map((r) => r.rateBps));
    const taxes = [
      ...inclusive.map((r, k) => ({ ...r, taxableAmountPaise: netAfter, taxAmountPaise: inclusiveAmounts[k]! })),
      ...exclusive.map((r) => ({ ...r, taxableAmountPaise: netAfter, taxAmountPaise: bpsOf(netAfter, r.rateBps) })),
    ];

    return {
      ...line,
      grossPaise: gross,
      netBeforePaise: netBefore,
      netAfterPaise: netAfter,
      discountPaise: discountNet,
      taxes,
    };
  });

  const subtotal = computed.reduce((sum, l) => sum + l.netBeforePaise, 0);
  const discountTotal = computed.reduce((sum, l) => sum + l.discountPaise, 0);
  const taxTotal = computed.reduce((sum, l) => sum + l.taxes.reduce((s, t) => s + t.taxAmountPaise, 0), 0);

  return {
    lines: computed,
    discounts: discounts
      .map((d, k) => ({ rule: d.rule, amountPaise: perRule[k]! }))
      .filter((d) => d.amountPaise > 0),
    subtotalPaise: subtotal,
    discountTotalPaise: discountTotal,
    taxTotalPaise: taxTotal,
    totalPaise: subtotal - discountTotal + taxTotal,
  };
}
