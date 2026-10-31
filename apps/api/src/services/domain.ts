import type { Db } from "../db/client.js";
import type { EventBus } from "../lib/events.js";
import type { Logger } from "../lib/logger.js";
import type { Mailer } from "../lib/mailer.js";
import type { AuditService } from "./audit.service.js";
import { createBillingService } from "./billing.service.js";
import { createBillingRunsRepository } from "../repositories/billing-runs.repository.js";
import { createCatalogRepository } from "../repositories/catalog.repository.js";
import { createDiscountsRepository } from "../repositories/discounts.repository.js";
import { createInvoicesRepository } from "../repositories/invoices.repository.js";
import { createSettingsRepository } from "../repositories/settings.repository.js";
import { createSubscriptionsRepository } from "../repositories/subscriptions.repository.js";
import { createTemplatesRepository } from "../repositories/templates.repository.js";
import { createPlansRepository, createTaxesRepository } from "../repositories/taxes-plans.repository.js";
import { createCatalogService } from "./catalog.service.js";
import { createDiscountService } from "./discount.service.js";
import { createInvoiceService, type InvoiceService } from "./invoice.service.js";
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
  const { db, auditService, eventBus, timezone, now, logger } = options;
  const taxes = createTaxesRepository(db);
  const plans = createPlansRepository(db);
  const catalog = createCatalogRepository(db);

  const taxService = createTaxService({ taxes });
  const planService = createPlanService({ plans });
  const catalogService = createCatalogService({ catalog, taxes });
  const discountService = createDiscountService({ discounts: createDiscountsRepository(db), auditService });

  const settings = createSettingsRepository();
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
  const billingService = createBillingService({
    runs: createBillingRunsRepository(db),
    subscriptions,
    plans,
    invoices,
    invoiceService: options.wrapInvoiceService?.(invoiceService) ?? invoiceService,
    subscriptionService,
    eventBus,
    timezone,
    logger,
    now,
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
  };
}

export type DomainServices = ReturnType<typeof createDomainServices>;
