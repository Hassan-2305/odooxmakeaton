import type { Request, RequestHandler } from "express";
import { ForbiddenError } from "../lib/errors.js";
import { currentUser } from "./auth.js";

/**
 * The customer_id every portal query must filter by. It comes from the session only;
 * a customerId in the body, query or params is never used. 401 when signed out,
 * 403 for back-office users or a customer user without a customer record.
 *
 *   const customerId = scopeToCustomer(req);
 *   await invoicesService.listForCustomer(customerId, query);
 */
export function scopeToCustomer(req: Request): string {
  const user = currentUser(req);
  if (user.role !== "customer" || !user.customerId) {
    throw new ForbiddenError("This is only available to customer accounts");
  }
  return user.customerId;
}

/** Router-level guard for portal routes: same checks as scopeToCustomer. */
export const requireCustomerScope: RequestHandler = (req, _res, next) => {
  scopeToCustomer(req);
  next();
};
