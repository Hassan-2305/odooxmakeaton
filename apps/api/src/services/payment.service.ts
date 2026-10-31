import type {
  AuthUser,
  CreatePaymentInput,
  InvoiceStatus,
  PaymentAllocationInput,
  PaymentDetail,
  PaymentListQuery,
} from "@brightloop/shared";
import { isForeignKeyViolation } from "../lib/db-errors.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import type { EventBus } from "../lib/events.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { InvoicesRepository } from "../repositories/invoices.repository.js";
import type { PaymentsRepository } from "../repositories/payments.repository.js";
import type { AuditService } from "./audit.service.js";
import { invoiceTransitions } from "./invoice-actions.service.js";
import { formatInr } from "./invoice-pdf.js";

interface Deps {
  payments: PaymentsRepository;
  invoices: Pick<InvoicesRepository, "lock" | "update">;
  auditService: AuditService;
  eventBus: EventBus;
}

type Actor = Pick<AuthUser, "id">;

interface LockedPayment {
  id: string;
  customerId: string;
  amountPaise: number;
  allocatedPaise: number;
}

export function createPaymentService({ payments, invoices, auditService, eventBus }: Deps) {
  async function detail(id: string): Promise<PaymentDetail> {
    const payment = await payments.findById(id);
    if (!payment) throw new NotFoundError("Payment");
    return { ...payment, allocations: await payments.allocations(id) };
  }

  /**
   * Applies one allocation inside `tx`. The invoice must be confirmed and belong to the
   * payment's customer; the amount may not exceed the invoice balance or what is left of
   * the payment. The invoice becomes paid once nothing is owed.
   */
  async function applyAllocation(tx: DbOrTx, actor: Actor, payment: LockedPayment, allocation: PaymentAllocationInput) {
    const invoice = await invoices.lock(tx, allocation.invoiceId);
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.customerId !== payment.customerId) {
      throw new BadRequestError("The invoice belongs to a different customer", { invoiceId: invoice.id });
    }
    if (invoice.status !== "confirmed") {
      throw new ConflictError("Payments can only be allocated to confirmed, unpaid invoices", {
        invoiceId: invoice.id,
        status: invoice.status,
      });
    }
    const balance = invoice.totalPaise - invoice.amountPaidPaise - invoice.creditedPaise;
    if (allocation.amountPaise > balance) {
      throw new BadRequestError(`Allocation exceeds the invoice balance of ${formatInr(balance)}`, {
        invoiceId: invoice.id,
        balancePaise: balance,
      });
    }
    const remainder = payment.amountPaise - payment.allocatedPaise;
    if (allocation.amountPaise > remainder) {
      throw new BadRequestError(`Allocation exceeds the unallocated payment amount of ${formatInr(remainder)}`, {
        paymentId: payment.id,
        unallocatedPaise: remainder,
      });
    }

    await payments.addAllocation(tx, payment.id, invoice.id, allocation.amountPaise);
    payment.allocatedPaise += allocation.amountPaise;

    const amountPaidPaise = invoice.amountPaidPaise + allocation.amountPaise;
    let status: InvoiceStatus = invoice.status;
    if (amountPaidPaise + invoice.creditedPaise >= invoice.totalPaise) {
      invoiceTransitions.assert(status, "paid");
      status = "paid";
    }
    await invoices.update(tx, invoice.id, { amountPaidPaise, status });
    await auditService.audit(
      actor,
      "invoice",
      invoice.id,
      "invoice.payment_applied",
      { amountPaidPaise: invoice.amountPaidPaise, status: invoice.status },
      { amountPaidPaise, status, paymentId: payment.id, amountPaise: allocation.amountPaise },
      tx,
    );
  }

  /** Locks invoices in id order so concurrent allocations cannot deadlock. */
  const byInvoiceId = (a: PaymentAllocationInput, b: PaymentAllocationInput) => a.invoiceId.localeCompare(b.invoiceId);

  return {
    list: (query: PaymentListQuery) => payments.list(query),

    get: detail,

    /** Records a payment, optionally allocating it to invoices in the same transaction. */
    async create(actor: AuthUser, { allocations, ...input }: CreatePaymentInput) {
      let id: string;
      try {
        id = await payments.transaction(async (tx) => {
          const row = await payments.insert(tx, { ...input, recordedBy: actor.id });
          const locked: LockedPayment = { ...row, allocatedPaise: 0 };
          for (const allocation of [...allocations].sort(byInvoiceId)) await applyAllocation(tx, actor, locked, allocation);
          await auditService.audit(actor, "payment", row.id, "payment.created", null, { ...row, allocations }, tx);
          return row.id;
        });
      } catch (err) {
        if (isForeignKeyViolation(err)) throw new BadRequestError("Unknown customer");
        throw err;
      }
      const payment = await detail(id);
      eventBus.emit("payment.recorded", {
        paymentId: payment.id,
        customerId: payment.customerId,
        amountPaise: payment.amountPaise,
        allocatedPaise: payment.allocatedPaise,
        invoiceIds: payment.allocations.map((a) => a.invoiceId),
      });
      return payment;
    },

    /** Allocates (more of) an existing payment to invoices. */
    async allocate(actor: Actor, paymentId: string, allocations: PaymentAllocationInput[]) {
      await payments.transaction(async (tx) => {
        const locked = await payments.lock(tx, paymentId);
        if (!locked) throw new NotFoundError("Payment");
        const before = locked.allocatedPaise;
        for (const allocation of [...allocations].sort(byInvoiceId)) await applyAllocation(tx, actor, locked, allocation);
        await auditService.audit(
          actor,
          "payment",
          paymentId,
          "payment.allocated",
          { allocatedPaise: before },
          { allocatedPaise: locked.allocatedPaise, allocations },
          tx,
        );
      });
      const payment = await detail(paymentId);
      eventBus.emit("payment.allocated", {
        paymentId,
        customerId: payment.customerId,
        allocatedPaise: payment.allocatedPaise,
        invoiceIds: allocations.map((a) => a.invoiceId),
      });
      return payment;
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
