import {
  addPaymentAllocationsSchema,
  cancelInvoiceSchema,
  createCreditNoteSchema,
  createPaymentSchema,
  idParamSchema,
  invoiceListQuerySchema,
  paymentListQuerySchema,
  sendInvoiceSchema,
  updateInvoiceSchema,
  type IdParam,
  type InvoiceListQuery,
  type PaymentListQuery,
} from "@brightloop/shared";
import { Router } from "express";
import { currentUser, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { InvoiceActionsService } from "../services/invoice-actions.service.js";
import type { PaymentService } from "../services/payment.service.js";

/** Invoices: admin and staff; credit notes admin only. */
export function createInvoicesRouter({ invoiceActionsService }: { invoiceActionsService: InvoiceActionsService }) {
  const router = Router();
  const svc = invoiceActionsService;

  router.use(requireRole("admin", "staff"));

  router.get("/", validate({ query: invoiceListQuerySchema }), async (req, res) => {
    res.json(await svc.list(req.query as unknown as InvoiceListQuery));
  });

  router.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
    res.json({ invoice: await svc.get((req.params as IdParam).id) });
  });

  router.patch("/:id", validate({ params: idParamSchema, body: updateInvoiceSchema }), async (req, res) => {
    res.json({ invoice: await svc.updateDraft(currentUser(req), (req.params as IdParam).id, req.body) });
  });

  router.post("/:id/confirm", validate({ params: idParamSchema }), async (req, res) => {
    res.json({ invoice: await svc.confirm(currentUser(req), (req.params as IdParam).id) });
  });

  router.post("/:id/cancel", validate({ params: idParamSchema, body: cancelInvoiceSchema }), async (req, res) => {
    res.json({ invoice: await svc.cancel(currentUser(req), (req.params as IdParam).id, req.body) });
  });

  router.post("/:id/send", validate({ params: idParamSchema, body: sendInvoiceSchema }), async (req, res) => {
    const { invoice, sentTo } = await svc.send(currentUser(req), (req.params as IdParam).id, req.body);
    res.json({ invoice, sentTo });
  });

  router.get("/:id/pdf", validate({ params: idParamSchema }), async (req, res) => {
    const { buffer, filename } = await svc.pdf((req.params as IdParam).id);
    res
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", `inline; filename="${filename}"`)
      .set("Cache-Control", "no-store")
      .send(buffer);
  });

  router.post(
    "/:id/credit-notes",
    requireRole("admin"),
    validate({ params: idParamSchema, body: createCreditNoteSchema }),
    async (req, res) => {
      const result = await svc.createCreditNote(currentUser(req), (req.params as IdParam).id, req.body);
      res.status(201).json(result);
    },
  );

  return router;
}

/** Payments: admin and staff. */
export function createPaymentsRouter({ paymentService }: { paymentService: PaymentService }) {
  const router = Router();

  router.use(requireRole("admin", "staff"));

  router.get("/", validate({ query: paymentListQuerySchema }), async (req, res) => {
    res.json(await paymentService.list(req.query as unknown as PaymentListQuery));
  });

  router.post("/", validate({ body: createPaymentSchema }), async (req, res) => {
    res.status(201).json({ payment: await paymentService.create(currentUser(req), req.body) });
  });

  router.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
    res.json({ payment: await paymentService.get((req.params as IdParam).id) });
  });

  router.post(
    "/:id/allocations",
    validate({ params: idParamSchema, body: addPaymentAllocationsSchema }),
    async (req, res) => {
      const { id } = req.params as IdParam;
      res.json({ payment: await paymentService.allocate(currentUser(req), id, req.body.allocations) });
    },
  );

  return router;
}
