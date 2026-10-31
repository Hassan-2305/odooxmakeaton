import type {
  AuthUser,
  CancelInvoiceInput,
  CreateCreditNoteInput,
  InvoiceDetail,
  InvoiceListQuery,
  InvoiceStatus,
  SendInvoiceInput,
  UpdateInvoiceInput,
} from "@brightloop/shared";
import { todayIn } from "../lib/dates.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import type { Mailer } from "../lib/mailer.js";
import { mulDivRound } from "../lib/money.js";
import { createTransitions } from "../lib/transition.js";
import type { InvoicesRepository } from "../repositories/invoices.repository.js";
import type { PaymentsRepository } from "../repositories/payments.repository.js";
import type { SettingsRepository } from "../repositories/settings.repository.js";
import type { AuditService } from "./audit.service.js";
import { formatInr, renderInvoicePdf } from "./invoice-pdf.js";

/** Confirmed invoices are immutable: corrections go through credit notes. */
export const invoiceTransitions = createTransitions<InvoiceStatus>("invoice", {
  draft: ["confirmed", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
});

/** An invoice with lines, taxes, allocations and credit notes; 404 when missing. */
export async function loadInvoiceDetail(
  invoices: Pick<InvoicesRepository, "findById" | "lines" | "allocations" | "creditNotes" | "customerSnapshotOf">,
  id: string,
): Promise<InvoiceDetail> {
  const invoice = await invoices.findById(id);
  if (!invoice) throw new NotFoundError("Invoice");
  const [lines, allocations, creditNotes, customerSnapshot] = await Promise.all([
    invoices.lines(id),
    invoices.allocations(id),
    invoices.creditNotes(id),
    invoices.customerSnapshotOf(id),
  ]);
  return { ...invoice, customerSnapshot: customerSnapshot ?? {}, lines, allocations, creditNotes };
}

/** The invoice PDF function: loads the invoice and renders it, generated on request. */
export function createInvoicePdf({ invoices, settings }: { invoices: InvoicesRepository; settings: SettingsRepository }) {
  return async (id: string) => {
    const invoice = await loadInvoiceDetail(invoices, id);
    const config = await settings.get();
    const buffer = await renderInvoicePdf(invoice, config.businessName);
    return { invoice, buffer, filename: `${invoice.number ?? `draft-${invoice.id}`}.pdf` };
  };
}

interface Deps {
  invoices: InvoicesRepository;
  payments: Pick<PaymentsRepository, "countForInvoice">;
  settings: SettingsRepository;
  auditService: AuditService;
  mailer: Mailer;
  timezone: string;
  now?: () => Date;
}

export function createInvoiceActionsService({ invoices, payments, settings, auditService, mailer, timezone, ...deps }: Deps) {
  const now = deps.now ?? (() => new Date());
  const today = () => todayIn(timezone, now());

  const detail = (id: string) => loadInvoiceDetail(invoices, id);
  const pdf = createInvoicePdf({ invoices, settings });

  return {
    invoiceTransitions,

    list: (query: InvoiceListQuery) => invoices.list(query, today()),

    get: detail,

    pdf,

    /** Only drafts can change. */
    async updateDraft(actor: AuthUser, id: string, input: UpdateInvoiceInput) {
      await invoices.transaction(async (tx) => {
        const row = await invoices.lock(tx, id);
        if (!row) throw new NotFoundError("Invoice");
        if (row.status !== "draft") {
          throw new ConflictError("Confirmed invoices cannot be edited. Issue a credit note instead.", { status: row.status });
        }
        if (row.issueDate && input.dueDate < row.issueDate) throw new BadRequestError("The due date cannot be before the issue date");
        await invoices.update(tx, id, { dueDate: input.dueDate });
        await auditService.audit(actor, "invoice", id, "invoice.updated", { dueDate: row.dueDate }, input, tx);
      });
      return detail(id);
    },

    async confirm(actor: AuthUser, id: string) {
      await invoices.transaction(async (tx) => {
        const row = await invoices.lock(tx, id);
        if (!row) throw new NotFoundError("Invoice");
        invoiceTransitions.assert(row.status, "confirmed");
        const confirmedAt = now();
        await invoices.update(tx, id, { status: "confirmed", confirmedAt });
        await auditService.audit(actor, "invoice", id, "invoice.confirmed", { status: row.status }, { status: "confirmed", confirmedAt }, tx);
      });
      return detail(id);
    },

    /** Drafts, or confirmed invoices with no payments allocated and no credit notes. */
    async cancel(actor: AuthUser, id: string, input: CancelInvoiceInput) {
      await invoices.transaction(async (tx) => {
        const row = await invoices.lock(tx, id);
        if (!row) throw new NotFoundError("Invoice");
        invoiceTransitions.assert(row.status, "cancelled");
        if (row.status === "confirmed") {
          if ((await payments.countForInvoice(tx, id)) > 0) {
            throw new ConflictError("This invoice has payments allocated and cannot be cancelled");
          }
          if (row.creditedPaise > 0) throw new ConflictError("This invoice has credit notes and cannot be cancelled");
        }
        const cancelledAt = now();
        await invoices.update(tx, id, { status: "cancelled", cancelledAt });
        await auditService.audit(
          actor,
          "invoice",
          id,
          "invoice.cancelled",
          { status: row.status },
          { status: "cancelled", cancelledAt, reason: input.reason ?? null },
          tx,
        );
      });
      return detail(id);
    },

    /** Emails the PDF to the customer (Mailpit in development). */
    async send(actor: AuthUser, id: string, input: SendInvoiceInput) {
      const { invoice, buffer, filename } = await pdf(id);
      if (invoice.status !== "confirmed" && invoice.status !== "paid") {
        throw new ConflictError("Only confirmed invoices can be sent", { status: invoice.status });
      }
      const to = input.to ?? (invoice.customerSnapshot.email as string | undefined);
      if (!to) throw new BadRequestError("The customer has no email address; pass `to`");
      await mailer.send({
        to,
        subject: `Invoice ${invoice.number} – ${formatInr(invoice.totalPaise)} due ${invoice.dueDate}`,
        text:
          `Hello ${String(invoice.customerSnapshot.name ?? "")},\n\n` +
          `Please find attached invoice ${invoice.number} for ${formatInr(invoice.totalPaise)}, ` +
          `due on ${invoice.dueDate}. Balance due: ${formatInr(invoice.balancePaise)}.\n`,
        attachments: [{ filename, content: buffer, contentType: "application/pdf" }],
      });
      await auditService.audit(actor, "invoice", id, "invoice.sent", null, { to, number: invoice.number });
      return { invoice, sentTo: to };
    },

    /**
     * Credits part or all of what is still owed on a confirmed invoice. The invoice row
     * is not edited: its balance is total − paid − confirmed credit notes. The amount
     * is tax-inclusive and is split into net and tax in the invoice's own proportion.
     */
    async createCreditNote(actor: AuthUser, invoiceId: string, input: CreateCreditNoteInput) {
      const note = await invoices.transaction(async (tx) => {
        const row = await invoices.lock(tx, invoiceId);
        if (!row) throw new NotFoundError("Invoice");
        if (row.status !== "confirmed") {
          throw new ConflictError("Credit notes can only be issued against confirmed, unpaid invoices", { status: row.status });
        }
        const balance = row.totalPaise - row.amountPaidPaise - row.creditedPaise;
        if (input.amountPaise > balance) {
          throw new BadRequestError(`The credit exceeds the outstanding balance of ${formatInr(balance)}`, {
            balancePaise: balance,
          });
        }
        const tax = row.totalPaise ? mulDivRound(input.amountPaise, row.taxTotalPaise, row.totalPaise) : 0;
        const created = await invoices.insertCreditNote(tx, {
          number: await settings.nextNumber(tx, "credit_note"),
          invoiceId,
          customerId: row.customerId,
          status: "confirmed",
          reason: input.reason,
          subtotalPaise: input.amountPaise - tax,
          taxTotalPaise: tax,
          totalPaise: input.amountPaise,
          issueDate: today(),
          confirmedAt: now(),
          createdBy: actor.id,
        });
        await auditService.audit(actor, "credit_note", created.id, "credit_note.created", null, created, tx);
        return created;
      });
      return { creditNote: note, invoice: await detail(invoiceId) };
    },
  };
}

export type InvoiceActionsService = ReturnType<typeof createInvoiceActionsService>;
