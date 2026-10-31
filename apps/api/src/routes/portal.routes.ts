import { idParamSchema, portalRequestSchema, type IdParam, type PortalRequestInput } from "@brightloop/shared";
import { Router } from "express";
import { currentUser } from "../middleware/auth.js";
import { requireCustomerScope, scopeToCustomer } from "../middleware/scope.js";
import { validate } from "../middleware/validate.js";
import type { CustomersService } from "../services/customers.service.js";
import type { PortalService } from "../services/portal.service.js";

/** Customer portal. Every handler scopes by the session's customer, never by input. */
export function createPortalRouter({
  customersService,
  portalService,
}: {
  customersService: CustomersService;
  portalService: PortalService;
}) {
  const router = Router();

  router.use(requireCustomerScope);

  router.get("/profile", async (req, res) => {
    res.json({ customer: await customersService.get(scopeToCustomer(req)) });
  });

  router.get("/subscriptions", async (req, res) => {
    res.json({ data: await portalService.listSubscriptions(scopeToCustomer(req)) });
  });

  router.get("/invoices", async (req, res) => {
    res.json({ data: await portalService.listInvoices(scopeToCustomer(req)) });
  });

  router.get("/invoices/:id", validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.params as unknown as IdParam;
    res.json({ invoice: await portalService.getInvoice(scopeToCustomer(req), id) });
  });

  router.get("/invoices/:id/pdf", validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.params as unknown as IdParam;
    const { buffer, filename } = await portalService.invoicePdf(scopeToCustomer(req), id);
    res
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", `inline; filename="${filename}"`)
      .set("Cache-Control", "private, no-store")
      .send(buffer);
  });

  router.get("/payments", async (req, res) => {
    res.json({ data: await portalService.listPayments(scopeToCustomer(req)) });
  });

  router.post("/requests", validate({ body: portalRequestSchema }), async (req, res) => {
    const request = await portalService.createRequest(
      currentUser(req).id,
      scopeToCustomer(req),
      req.body as PortalRequestInput,
    );
    res.status(202).json({ request });
  });

  return router;
}
