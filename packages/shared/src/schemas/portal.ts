import { z } from "zod";
import { idSchema } from "./common.js";
import type { InvoiceStatus, SubscriptionStatus } from "./enums.js";

export const PORTAL_REQUEST_TYPES = ["cancel", "change"] as const;

/** POST /api/portal/requests: a customer asks to cancel or change a subscription. */
export const portalRequestSchema = z.object({
  type: z.enum(PORTAL_REQUEST_TYPES),
  subscriptionId: idSchema,
  message: z.string().trim().min(3).max(2000),
});
export type PortalRequestInput = z.infer<typeof portalRequestSchema>;

export interface PortalSubscription {
  id: string;
  number: string;
  status: SubscriptionStatus;
  planName: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  startDate: string;
  expiryDate: string | null;
  nextInvoiceDate: string | null;
  /** Sum of quantity × unit price per billing period, before tax and discounts. */
  recurringAmountPaise: number;
}

export interface PortalInvoice {
  id: string;
  number: string | null;
  subscriptionId: string | null;
  status: InvoiceStatus;
  periodStart: string;
  periodEnd: string;
  issueDate: string | null;
  dueDate: string | null;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
}

export interface PortalInvoiceDetail extends PortalInvoice {
  subtotalPaise: number;
  discountTotalPaise: number;
  taxTotalPaise: number;
  lines: {
    kind: "product" | "discount";
    description: string;
    quantity: number;
    unitPricePaise: number;
    amountPaise: number;
  }[];
}

export interface PortalPayment {
  id: string;
  method: string;
  amountPaise: number;
  paidOn: string;
  reference: string | null;
  allocations: { invoiceId: string; invoiceNumber: string | null; amountPaise: number }[];
}

export interface PortalRequest {
  id: number;
  type: (typeof PORTAL_REQUEST_TYPES)[number];
  subscriptionId: string;
  message: string;
  createdAt: string;
}
