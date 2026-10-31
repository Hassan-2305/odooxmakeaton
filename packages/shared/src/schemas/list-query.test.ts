import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createListQuerySchema, listQuerySchema, MAX_PAGE_SIZE } from "./list-query.js";

describe("listQuerySchema", () => {
  it("defaults to page 1, pageSize 20, no sort", () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("coerces query-string numbers", () => {
    expect(listQuerySchema.parse({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50 });
  });

  it(`allows pageSize up to ${MAX_PAGE_SIZE}`, () => {
    expect(listQuerySchema.parse({ pageSize: "100" }).pageSize).toBe(100);
    expect(listQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });

  it.each([
    ["page", "0"],
    ["page", "-1"],
    ["page", "1.5"],
    ["page", "abc"],
    ["pageSize", "0"],
    ["pageSize", "2.5"],
  ])("rejects %s=%s", (key, value) => {
    expect(listQuerySchema.safeParse({ [key]: value }).success).toBe(false);
  });

  it("parses sort into fields and directions", () => {
    expect(listQuerySchema.parse({ sort: "-createdAt,name" }).sort).toEqual([
      { field: "createdAt", direction: "desc" },
      { field: "name", direction: "asc" },
    ]);
  });

  it.each(["", "name,", ",name", "--name", "name desc", "na-me", "name;drop table"])(
    "rejects malformed sort %j",
    (sort) => {
      expect(listQuerySchema.safeParse({ sort }).success).toBe(false);
    },
  );
});

describe("createListQuerySchema", () => {
  const invoicesQuery = createListQuerySchema({
    sortFields: ["dueDate", "total", "number"],
    defaultSort: [{ field: "dueDate", direction: "desc" }],
    filters: { status: z.enum(["draft", "confirmed"]).optional() },
  });

  it("accepts allowed sort fields", () => {
    expect(invoicesQuery.parse({ sort: "-total,number" }).sort).toEqual([
      { field: "total", direction: "desc" },
      { field: "number", direction: "asc" },
    ]);
  });

  it("rejects sort fields outside the allowlist", () => {
    const result = invoicesQuery.safeParse({ sort: "passwordHash" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('Cannot sort by "passwordHash"');
  });

  it("falls back to the default sort", () => {
    expect(invoicesQuery.parse({}).sort).toEqual([{ field: "dueDate", direction: "desc" }]);
  });

  it("validates endpoint filters alongside paging", () => {
    expect(invoicesQuery.parse({ status: "confirmed", page: "2" })).toMatchObject({
      status: "confirmed",
      page: 2,
      pageSize: 20,
    });
    expect(invoicesQuery.safeParse({ status: "bogus" }).success).toBe(false);
  });

  it("still caps pageSize", () => {
    expect(invoicesQuery.safeParse({ pageSize: "500" }).success).toBe(false);
  });
});
