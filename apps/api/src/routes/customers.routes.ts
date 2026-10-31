import {
  createCustomerSchema,
  customerListQuerySchema,
  idParamSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type CustomerListQuery,
  type IdParam,
  type UpdateCustomerInput,
} from "@brightloop/shared";
import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { CustomersService } from "../services/customers.service.js";

/** Back-office customer management. Customers see their own record through the portal. */
export function createCustomersRouter({ customersService }: { customersService: CustomersService }) {
  const router = Router();

  router.use(requireRole("admin", "staff"));

  router.get("/", validate({ query: customerListQuerySchema }), async (req, res) => {
    res.json(await customersService.list(req.query as unknown as CustomerListQuery));
  });

  router.post("/", validate({ body: createCustomerSchema }), async (req, res) => {
    const customer = await customersService.create(req.body as CreateCustomerInput);
    res.status(201).json({ customer });
  });

  router.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.params as IdParam;
    res.json({ customer: await customersService.get(id) });
  });

  router.patch("/:id", validate({ params: idParamSchema, body: updateCustomerSchema }), async (req, res) => {
    const { id } = req.params as IdParam;
    res.json({ customer: await customersService.update(id, req.body as UpdateCustomerInput) });
  });

  router.delete("/:id", validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.params as IdParam;
    await customersService.remove(id);
    res.status(204).end();
  });

  return router;
}
