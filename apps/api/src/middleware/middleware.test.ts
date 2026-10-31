import { createListQuerySchema, createProductSchema, idParamSchema } from "@brightloop/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { type Logger, silentLogger } from "../lib/logger.js";
import { createTransitions } from "../lib/transition.js";
import { errorHandler } from "./error-handler.js";
import { requestLogger } from "./request-logger.js";
import { validate } from "./validate.js";

const listQuery = createListQuerySchema({ sortFields: ["name", "createdAt"] });

function testApp(logger: Logger = silentLogger) {
  const app = express();
  app.use(requestLogger(logger));
  app.use(express.json());

  app.post("/products", validate({ body: createProductSchema }), (req, res) => {
    res.status(201).json(req.body);
  });
  app.get("/products", validate({ query: listQuery }), (req, res) => {
    res.json(req.query);
  });
  app.get("/products/:id", validate({ params: idParamSchema }), (req, res) => {
    res.json(req.params);
  });
  app.get("/missing", () => {
    throw new NotFoundError("Invoice");
  });
  app.get("/conflict", async () => {
    throw new ConflictError("Number already used", { number: "INV-1" });
  });
  app.get("/transition", () => {
    createTransitions("invoice", { draft: ["confirmed"], confirmed: [] }).assert("confirmed", "draft");
  });
  app.get("/boom", () => {
    throw new Error("database exploded: password=secret");
  });

  app.use(errorHandler(logger));
  return app;
}

describe("validate()", () => {
  it("replaces the body with parsed values, including defaults", async () => {
    const res = await request(testApp())
      .post("/products")
      .send({ name: "  Pro plan ", basePricePaise: 49900 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: "Pro plan", basePricePaise: 49900, isActive: true });
  });

  it("coerces and defaults the query string", async () => {
    const res = await request(testApp()).get("/products?page=2&sort=-createdAt");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      page: 2,
      pageSize: 20,
      sort: [{ field: "createdAt", direction: "desc" }],
    });
  });

  it("validates route params", async () => {
    const res = await request(testApp()).get("/products/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("id");
  });
});

describe("errorHandler()", () => {
  it("maps a ZodError to 400 with field errors keyed by path", async () => {
    const res = await request(testApp())
      .post("/products")
      .send({ name: "", basePricePaise: 10.5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.message).toBe("Some fields are invalid");
    expect(Object.keys(res.body.error.fields).sort()).toEqual(["basePricePaise", "name"]);
    expect(res.body.error.fields.basePricePaise[0]).toMatch(/int/i);
  });

  it("rejects sort fields outside the allowlist as a validation error", async () => {
    const res = await request(testApp()).get("/products?sort=passwordHash");

    expect(res.status).toBe(400);
    expect(res.body.error.fields.sort[0]).toContain('Cannot sort by "passwordHash"');
  });

  it("maps AppError subclasses to their status and code", async () => {
    const missing = await request(testApp()).get("/missing");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: { code: "not_found", message: "Invoice not found" } });

    const conflict = await request(testApp()).get("/conflict");
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      error: { code: "conflict", message: "Number already used", details: { number: "INV-1" } },
    });
  });

  it("maps an invalid transition to 409 with the allowed moves", async () => {
    const res = await request(testApp()).get("/transition");

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "invalid_transition",
      message: "Cannot move invoice from confirmed to draft",
      details: { entity: "invoice", from: "confirmed", to: "draft", allowed: [] },
    });
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(testApp())
      .post("/products")
      .set("content-type", "application/json")
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_json");
  });

  it("hides unexpected errors behind a generic 500 and logs them", async () => {
    const logger = { ...silentLogger, error: vi.fn() };
    const res = await request(testApp(logger)).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "internal_error", message: "Something went wrong" } });
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(logger.error).toHaveBeenCalledWith(
      "unhandled error",
      expect.objectContaining({ path: "/boom" }),
    );
  });
});

describe("requestLogger()", () => {
  it("logs method, path, status and duration when the response finishes", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await request(testApp(logger)).get("/products?page=1");
    await request(testApp(logger)).get("/missing");

    expect(logger.info).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({
        method: "GET",
        path: "/products?page=1",
        status: 200,
        durationMs: expect.any(Number),
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ status: 404, path: "/missing" }),
    );
  });
});
