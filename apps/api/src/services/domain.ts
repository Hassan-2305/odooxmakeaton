import type { Db } from "../db/client.js";
import type { EventBus } from "../lib/events.js";
import type { Logger } from "../lib/logger.js";
import type { Mailer } from "../lib/mailer.js";
import type { AuditService } from "./audit.service.js";
import { createBillingService } from "./billing.service.js";
import { createBillingRunsRepository } from "../repositories/billing-runs.repository.js";
import { createCatalogRepository } from "../repositories/catalog.repository.js";
import { createDiscountsRepository } from "../repositories/discounts.repository.js";
import { createIntegrityRepository } from "../repositories/integrity.repository.js";
import { createInvoicesRepository } from "../repositories/invoices.repository.js";
import { createPaymentsRepository } from "../repositories/payments.repository.js";
import { createSettingsRepository } from "../repositories/settings.repository.js";
import { createSubscriptionsRepository } from "../repositories/subscriptions.repository.js";
import { createTemplatesRepository } from "../repositories/templates.repository.js";
import { createPlansRepository, createTaxesRepository } from "../repositories/taxes-plans.repository.js";
import { createCatalogService } from "./catalog.service.js";
import { createDiscountService } from "./discount.service.js";
import { createIntegrityService } from "./integrity.service.js";
import { createInvoiceActionsService } from "./invoice-actions.service.js";
import { createInvoiceService, type InvoiceService } from "./invoice.service.js";
import { createPaymentService } from "./payment.service.js";
import { createPlanService } from "./plan.service.js";
import { createSubscriptionService } from "./subscription.service.js";
import { createTaxService } from "./tax.service.js";
import { createTemplateService } from "./template.service.js";

export interface DomainOptions {
  db: Db;
  auditService: AuditService;
  eventBus: EventBus;
  mailer: Mailer;
  /** IANA business timezone: "today", billing days and due dates are evaluated here. */
  timezone: string;
  logger?: Logger;
  /** Clock; tests pin it to a fixed instant. */
  now?: () => Date;
  /** Test seam: wraps the invoice builder used by billing runs (e.g. to inject a failure). */
  wrapInvoiceService?: (service: InvoiceService) => Pick<InvoiceService, "build">;
}

/** Builds the catalog, sales and billing services on one database handle. */
export function createDomainServices(options: DomainOptions) {
  const { db, auditService, eventBus, mailer, timezone, now, logger } = options;
  const taxes = createTaxesRepository(db);
  const plans = createPlansRepository(db);
  const catalog = createCatalogRepository(db);

  const taxService = createTaxService({ taxes });
  const planService = createPlanService({ plans });
  const catalogService = createCatalogService({ catalog, taxes });
  const discountService = createDiscountService({ discounts: createDiscountsRepository(db), auditService });

  const settings = createSettingsRepository(db);
  const templates = createTemplatesRepository(db);
  const subscriptions = createSubscriptionsRepository(db);
  const templateService = createTemplateService({ templates, catalog, plans });
  const subscriptionService = createSubscriptionService({
    subscriptions,
    templates,
    plans,
    catalog,
    settings,
    taxService,
    auditService,
    timezone,
    now,
  });

  const invoices = createInvoicesRepository(db);
  const invoiceService = createInvoiceService({ invoices, subscriptions, settings, taxService, discountService });
  // Billing scans integrity after live runs and integrity resolves through billing:
  // the closure defers the lookup until integrityService exists.
  const integrity = { scan: (...args: Parameters<typeof integrityService.scan>) => integrityService.scan(...args) };
  const billingService = createBillingService({
    runs: createBillingRunsRepository(db),
    subscriptions,
    plans,
    invoices,
    invoiceService: options.wrapInvoiceService?.(invoiceService) ?? invoiceService,
    subscriptionService,
    eventBus,
    integrity,
    timezone,
    logger,
    now,
  });

  const payments = createPaymentsRepository(db);
  const invoiceActionsService = createInvoiceActionsService({
    invoices,
    payments,
    settings,
    auditService,
    mailer,
    timezone,
    now,
  });
  const paymentService = createPaymentService({ payments, invoices, auditService, eventBus });
  const integrityService = createIntegrityService({
    repo: createIntegrityRepository(db),
    timezone,
    now,
    corrections: {
      allocatePayment: (actor, paymentId, allocations) => paymentService.allocate(actor, paymentId, allocations),
      generateInvoice: (actor, subscriptionId, periodStart) =>
        billingService.billPeriod(actor, subscriptionId, periodStart),
    },
  });

  return {
    taxService,
    planService,
    catalogService,
    discountService,
    templateService,
    subscriptionService,
    invoiceService,
    billingService,
    invoiceActionsService,
    paymentService,
    integrityService,
  };
}

export type DomainServices = ReturnType<typeof createDomainServices>;
