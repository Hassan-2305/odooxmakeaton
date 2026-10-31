import type { Db } from "../db/client.js";
import type { EventBus } from "../lib/events.js";
import type { Logger } from "../lib/logger.js";
import type { Mailer } from "../lib/mailer.js";
import type { AuditService } from "./audit.service.js";
import { createCatalogRepository } from "../repositories/catalog.repository.js";
import { createDiscountsRepository } from "../repositories/discounts.repository.js";
import { createSettingsRepository } from "../repositories/settings.repository.js";
import { createSubscriptionsRepository } from "../repositories/subscriptions.repository.js";
import { createTemplatesRepository } from "../repositories/templates.repository.js";
import { createPlansRepository, createTaxesRepository } from "../repositories/taxes-plans.repository.js";
import { createCatalogService } from "./catalog.service.js";
import { createDiscountService } from "./discount.service.js";
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
}

/** Builds the catalog, sales and billing services on one database handle. */
export function createDomainServices({ db, auditService, timezone, now }: DomainOptions) {
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

  return { taxService, planService, catalogService, discountService, templateService, subscriptionService };
}

export type DomainServices = ReturnType<typeof createDomainServices>;
