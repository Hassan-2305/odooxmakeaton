import type { Db } from "../db/client.js";
import type { EventBus } from "../lib/events.js";
import type { Logger } from "../lib/logger.js";
import type { Mailer } from "../lib/mailer.js";
import type { AuditService } from "./audit.service.js";
import { createCatalogRepository } from "../repositories/catalog.repository.js";
import { createDiscountsRepository } from "../repositories/discounts.repository.js";
import { createPlansRepository, createTaxesRepository } from "../repositories/taxes-plans.repository.js";
import { createCatalogService } from "./catalog.service.js";
import { createDiscountService } from "./discount.service.js";
import { createPlanService } from "./plan.service.js";
import { createTaxService } from "./tax.service.js";

export interface DomainOptions {
  db: Db;
  auditService: AuditService;
  eventBus: EventBus;
  mailer: Mailer;
  /** IANA business timezone: "today", billing days and due dates are evaluated here. */
  timezone: string;
  logger?: Logger;
}

/** Builds the catalog, sales and billing services on one database handle. */
export function createDomainServices({ db, auditService }: DomainOptions) {
  const taxes = createTaxesRepository(db);
  const plans = createPlansRepository(db);
  const catalog = createCatalogRepository(db);

  const taxService = createTaxService({ taxes });
  const planService = createPlanService({ plans });
  const catalogService = createCatalogService({ catalog, taxes });
  const discountService = createDiscountService({ discounts: createDiscountsRepository(db), auditService });

  return { taxService, planService, catalogService, discountService };
}

export type DomainServices = ReturnType<typeof createDomainServices>;
