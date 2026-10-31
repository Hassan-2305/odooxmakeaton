import { createStaffSchema, type CreateStaffInput } from "@brightloop/shared";
import { Router } from "express";
import { currentUser, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { StaffService } from "../services/staff.service.js";

export function createStaffRouter({ staffService }: { staffService: StaffService }) {
  const router = Router();

  router.use(requireRole("admin"));

  router.post("/", validate({ body: createStaffSchema }), async (req, res) => {
    const user = await staffService.create(req.body as CreateStaffInput, currentUser(req));
    res.status(201).json({ user });
  });

  return router;
}
