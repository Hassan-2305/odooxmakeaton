import {
  reportAgingQuerySchema,
  reportCollectionsQuerySchema,
  reportRenewalsQuerySchema,
  reportSummaryQuerySchema,
  type ReportAgingQuery,
  type ReportCollectionsQuery,
  type ReportRenewalsQuery,
  type ReportSummaryQuery,
} from "@brightloop/shared";
import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { ReportsService } from "../services/reports.service.js";

/** Back-office finance reports. */
export function createReportsRouter({ reportsService }: { reportsService: ReportsService }) {
  const router = Router();

  router.use(requireRole("admin", "staff"));

  router.get("/summary", validate({ query: reportSummaryQuerySchema }), async (req, res) => {
    res.json(await reportsService.summary(req.query as unknown as ReportSummaryQuery));
  });

  router.get("/aging", validate({ query: reportAgingQuerySchema }), async (req, res) => {
    res.json(await reportsService.aging(req.query as unknown as ReportAgingQuery));
  });

  router.get("/collections", validate({ query: reportCollectionsQuerySchema }), async (req, res) => {
    res.json(await reportsService.collections(req.query as unknown as ReportCollectionsQuery));
  });

  router.get("/renewals", validate({ query: reportRenewalsQuerySchema }), async (req, res) => {
    res.json(await reportsService.renewals(req.query as unknown as ReportRenewalsQuery));
  });

  return router;
}
