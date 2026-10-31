import { z } from "zod";
import { idSchema, isoDateSchema, optionalTextSchema, positivePaiseSchema } from "./common.js";
import { paymentMethodSchema, type PaymentMethod } from "./enums.js";
import { createListQuerySchema } from "./list-query.js";

export const paymentAllocationSchema = z.object({
  invoiceId: idSchema,
  amountPaise: positivePaiseSchema,
});
export type PaymentAllocationInput = z.infer<typeof paymentAllocationSchema>;

export const createPaymentSchema = z
  .object({
    customerId: idSchema,
    method: paymentMethodSchema,
    amountPaise: positivePaiseSchema,
    paidOn: isoDateSchema,
    reference: z.string().trim().max(100).optional(),
    notes: optionalTextSchema,
    allocations: z.array(paymentAllocationSchema).max(50).default([]),
  })
  .superRefine((payment, ctx) => {
    const invoiceIds = payment.allocations.map((a) => a.invoiceId);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Allocate to each invoice only once",
      });
    }
    const allocated = payment.allocations.reduce((sum, a) => sum + a.amountPaise, 0);
    if (allocated > payment.amountPaise) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Allocations cannot exceed the payment amount",
      });
    }
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

const uniqueInvoices = (allocations: PaymentAllocationInput[]) =>
  new Set(allocations.map((a) => a.invoiceId)).size === allocations.length;

/** POST /api/payments/:id/allocations */
export const addPaymentAllocationsSchema = z.object({
  allocations: z.array(paymentAllocationSchema).min(1).max(50).refine(uniqueInvoices, "Allocate to each invoice only once"),
});
export type AddPaymentAllocationsInput = z.infer<typeof addPaymentAllocationsSchema>;

export const paymentListQuerySchema = createListQuerySchema({
  sortFields: ["paidOn", "amountPaise", "createdAt"],
  defaultSort: [{ field: "paidOn", direction: "desc" }],
  filters: {
    customerId: idSchema.optional(),
    method: paymentMethodSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    /** Only payments with money not yet allocated to invoices. */
    unallocated: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  },
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export interface PaymentAllocation {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amountPaise: number;
  createdAt: string;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  method: PaymentMethod;
  currency: "INR";
  amountPaise: number;
  allocatedPaise: number;
  unallocatedPaise: number;
  paidOn: string;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface PaymentDetail extends Payment {
  allocations: PaymentAllocation[];
}
