import { describe, expect, it, vi } from "vitest";
import { InvalidTransitionError } from "./errors.js";
import { createEventBus } from "./events.js";
import { pageWindow, paginate } from "./paginate.js";
import { createTransitions } from "./transition.js";

describe("paginate()", () => {
  it("turns page/pageSize into limit/offset", () => {
    expect(pageWindow({ page: 1, pageSize: 20 })).toEqual({ limit: 20, offset: 0 });
    expect(pageWindow({ page: 3, pageSize: 25 })).toEqual({ limit: 25, offset: 50 });
  });

  it("returns { data, total, tookMs }", async () => {
    const fetch = vi.fn(async () => ({ rows: [{ id: "a" }, { id: "b" }], total: 42 }));

    const result = await paginate({ page: 2, pageSize: 2 }, fetch);

    expect(fetch).toHaveBeenCalledWith({ limit: 2, offset: 2 });
    expect(result).toEqual({ data: [{ id: "a" }, { id: "b" }], total: 42, tookMs: expect.any(Number) });
    expect(result.tookMs).toBeGreaterThanOrEqual(0);
  });

  it("normalises a bigint-as-string count from Postgres to a number", async () => {
    const result = await paginate({ page: 1, pageSize: 10 }, async () => ({
      rows: [],
      total: "7" as unknown as number,
    }));
    expect(result.total).toBe(7);
  });
});

describe("createTransitions()", () => {
  const subscription = createTransitions("subscription", {
    draft: ["quotation", "cancelled"],
    quotation: ["active", "cancelled"],
    active: ["paused", "closed"],
    paused: ["active", "closed"],
    closed: [],
    cancelled: [],
  });

  it("allows moves in the map", () => {
    expect(subscription.can("draft", "quotation")).toBe(true);
    expect(() => subscription.assert("paused", "active")).not.toThrow();
  });

  it("throws InvalidTransitionError for moves not in the map", () => {
    expect(subscription.can("draft", "active")).toBe(false);
    expect(() => subscription.assert("draft", "active")).toThrow(InvalidTransitionError);
  });

  it("treats terminal statuses as having no moves", () => {
    expect(subscription.allowedFrom("closed")).toEqual([]);
    expect(() => subscription.assert("closed", "active")).toThrow(
      "Cannot move subscription from closed to active",
    );
  });

  it("puts the allowed moves on the error", () => {
    try {
      subscription.assert("active", "draft");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as InvalidTransitionError).status).toBe(409);
      expect((err as InvalidTransitionError).details).toEqual({
        entity: "subscription",
        from: "active",
        to: "draft",
        allowed: ["paused", "closed"],
      });
    }
  });
});

describe("createEventBus()", () => {
  it("delivers emitted events to subscribers with increasing ids", () => {
    const bus = createEventBus();
    const received: unknown[] = [];
    bus.subscribe((event) => received.push(event));

    bus.emit("invoice.confirmed", { id: "inv-1" });
    bus.emit("payment.recorded", { id: "pay-1" });

    expect(received).toEqual([
      { id: 1, event: "invoice.confirmed", payload: { id: "inv-1" }, at: expect.any(String) },
      { id: 2, event: "payment.recorded", payload: { id: "pay-1" }, at: expect.any(String) },
    ]);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    unsubscribe();
    bus.emit("x", {});

    expect(listener).not.toHaveBeenCalled();
    expect(bus.listenerCount()).toBe(0);
  });
});
