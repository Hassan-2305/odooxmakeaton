import { z } from "zod";
import { idSchema, isoDateSchema, optionalTextSchema, positivePaiseSchema } from "./common.js";
import { paymentMethodSchema } from "./enums.js";

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
