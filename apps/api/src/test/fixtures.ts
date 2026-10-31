import type { Response } from "supertest";
import { expect } from "vitest";
import { uniq } from "./db-app.js";

type Agent = {
  post: (path: string, body?: object) => PromiseLike<Response>;
  patch: (path: string, body?: object) => PromiseLike<Response>;
};

async function created(res: PromiseLike<Response>, key: string) {
  const r = await res;
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body[key];
}

/** Catalog fixtures created through the API as an admin. */
export function fixtures(admin: Agent) {
  return {
    tax: (overrides: object = {}) =>
      created(admin.post("/api/taxes", { name: `GST ${uniq()}`, rateBps: 1800, effectiveFrom: "2017-07-01", ...overrides }), "tax"),

    plan: (overrides: object = {}) =>
      created(admin.post("/api/plans", { name: `Plan ${uniq()}`, interval: "month", ...overrides }), "plan"),

    product: (overrides: object = {}) =>
      created(admin.post("/api/products", { name: `Product ${uniq()}`, basePricePaise: 100_000, ...overrides }), "product"),

    template: (planId: string | null, lines: object[], overrides: object = {}) =>
      created(
        admin.post("/api/quotation-templates", {
          name: `Template ${uniq()}`,
          validityDays: 15,
          recurringPlanId: planId,
          lines,
          ...overrides,
        }),
        "template",
      ),

    quotation: (templateId: string, body: object) =>
      created(admin.post(`/api/subscriptions/from-template/${templateId}`, body), "subscription"),
  };
}
