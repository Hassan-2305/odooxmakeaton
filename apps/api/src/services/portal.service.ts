import type { PortalRequestInput } from "@brightloop/shared";
import { AppError, ConflictError, NotFoundError } from "../lib/errors.js";
import type { PortalRepository } from "../repositories/portal.repository.js";

/** Subscription statuses a customer can still ask to cancel or change. */
const REQUESTABLE = new Set(["quotation", "active", "paused"]);

/**
 * Customer portal. Every method takes the customer id from scopeToCustomer(req) as
 * its first argument; records of other customers are reported as not found (404),
 * so their existence isn't revealed.
 */
interface Deps {
  repo: PortalRepository;
  /** The back-office invoice PDF renderer. Called only after ownership is checked. */
  invoicePdf?: (invoiceId: string) => Promise<{ buffer: Buffer; filename: string }>;
}

export function createPortalService({ repo, invoicePdf }: Deps) {
  async function ownInvoice(customerId: string, id: string) {
    const invoice = await repo.findInvoice(customerId, id);
    if (!invoice) throw new NotFoundError("Invoice");
    return invoice;
  }

  return {
    listSubscriptions: (customerId: string) => repo.listSubscriptions(customerId),
    listInvoices: (customerId: string) => repo.listInvoices(customerId),
    getInvoice: ownInvoice,
    listPayments: (customerId: string) => repo.listPayments(customerId),

    /** Ownership is checked first, so another customer's (or a draft) invoice is a 404. */
    async invoicePdf(customerId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
      await ownInvoice(customerId, id);
      if (!invoicePdf) throw new AppError(501, "not_implemented", "Invoice PDFs aren't available yet");
      return invoicePdf(id);
    },

    async createRequest(actorUserId: string, customerId: string, input: PortalRequestInput) {
      const subscription = await repo.findSubscription(customerId, input.subscriptionId);
      if (!subscription) throw new NotFoundError("Subscription");
      if (!REQUESTABLE.has(subscription.status)) {
        throw new ConflictError(`Subscription ${subscription.number} is ${subscription.status}`);
      }
      return repo.createRequest(actorUserId, customerId, input);
    },
  };
}

export type PortalService = ReturnType<typeof createPortalService>;
