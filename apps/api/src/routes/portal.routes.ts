import { Router } from "express";
import { requireCustomerScope, scopeToCustomer } from "../middleware/scope.js";
import type { CustomersService } from "../services/customers.service.js";

/** Customer portal. Every handler scopes by the session's customer, never by input. */
export function createPortalRouter({ customersService }: { customersService: CustomersService }) {
  const router = Router();

  router.use(requireCustomerScope);

  router.get("/profile", async (req, res) => {
    res.json({ customer: await customersService.get(scopeToCustomer(req)) });
  });

  return router;
}
