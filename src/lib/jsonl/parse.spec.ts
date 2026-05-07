import { describe, it, expect } from "vitest";
import {
  distinctIds,
  groupById,
  parseJsonl,
  sortByAt,
} from "./parse";

describe("parseJsonl", () => {
  it("parses well-formed lines into CollectionLine records", () => {
    const content = [
      `{"id":"a","at":"2026-05-07T10:00:00Z","by":"alice","op":"create","name":"Acme"}`,
      `{"id":"a","at":"2026-05-07T11:00:00Z","by":"bob","op":"update","note":"ok"}`,
    ].join("\n");

    const { lines, errors } = parseJsonl(content);

    expect(errors).toEqual([]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      lineNumber: 1,
      id: "a",
      at: "2026-05-07T10:00:00Z",
      by: "alice",
      op: "create",
      fields: { name: "Acme" },
    });
    expect(lines[1]?.fields).toEqual({ note: "ok" });
  });

  it("strips a leading BOM", () => {
    const bom = "\ufeff";
    const { lines, errors } = parseJsonl(`${bom}{"id":"a"}`);
    expect(errors).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.id).toBe("a");
  });

  it("skips blank and whitespace-only lines without error", () => {
    const content = [
      `{"id":"a"}`,
      ``,
      `   `,
      `{"id":"b"}`,
    ].join("\n");
    const { lines, errors } = parseJsonl(content);
    expect(errors).toEqual([]);
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("reports invalid JSON without throwing or aborting", () => {
    const content = [
      `{"id":"a"}`,
      `{not json}`,
      `{"id":"b"}`,
    ].join("\n");
    const { lines, errors } = parseJsonl(content);
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ lineNumber: 2, reason: "invalid-json" });
  });

  it("rejects non-object JSON values", () => {
    const content = [`"a string"`, `42`, `[1,2,3]`, `null`, `{"id":"ok"}`].join(
      "\n",
    );
    const { lines, errors } = parseJsonl(content);
    expect(lines.map((l) => l.id)).toEqual(["ok"]);
    expect(errors.map((e) => e.reason)).toEqual([
      "not-an-object",
      "not-an-object",
      "not-an-object",
      "not-an-object",
    ]);
  });

  it("rejects objects without a string `id`", () => {
    const content = [
      `{"name":"no id"}`,
      `{"id":42}`,
      `{"id":""}`,
      `{"id":"valid"}`,
    ].join("\n");
    const { lines, errors } = parseJsonl(content);
    expect(lines).toHaveLength(1);
    expect(errors.every((e) => e.reason === "missing-id")).toBe(true);
    expect(errors).toHaveLength(3);
  });

  it("preserves nested objects and arrays in `fields`", () => {
    const content = `{"id":"a","items":[{"sku":"x","qty":2}],"meta":{"k":"v"}}`;
    const { lines } = parseJsonl(content);
    expect(lines[0]?.fields.items).toEqual([{ sku: "x", qty: 2 }]);
    expect(lines[0]?.fields.meta).toEqual({ k: "v" });
  });

  it("records line numbers (1-based) even with blank lines mixed in", () => {
    const content = [`{"id":"a"}`, ``, `{"id":"b"}`].join("\n");
    const { lines } = parseJsonl(content);
    expect(lines.map((l) => l.lineNumber)).toEqual([1, 3]);
  });

  it("handles CRLF line endings", () => {
    const content = `{"id":"a"}\r\n{"id":"b"}\r\n`;
    const { lines, errors } = parseJsonl(content);
    expect(errors).toEqual([]);
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("groupById", () => {
  it("groups lines by id, preserving first-appearance order", () => {
    const { lines } = parseJsonl(
      [
        `{"id":"x","at":"1"}`,
        `{"id":"y","at":"2"}`,
        `{"id":"x","at":"3"}`,
      ].join("\n"),
    );
    const groups = groupById(lines);
    expect(Array.from(groups.keys())).toEqual(["x", "y"]);
    expect(groups.get("x")).toHaveLength(2);
    expect(groups.get("y")).toHaveLength(1);
  });
});

describe("sortByAt", () => {
  it("orders lines ascending by `at`", () => {
    const { lines } = parseJsonl(
      [
        `{"id":"a","at":"2026-05-07T03:00:00Z"}`,
        `{"id":"a","at":"2026-05-07T01:00:00Z"}`,
        `{"id":"a","at":"2026-05-07T02:00:00Z"}`,
      ].join("\n"),
    );
    const sorted = sortByAt(lines);
    expect(sorted.map((l) => l.at)).toEqual([
      "2026-05-07T01:00:00Z",
      "2026-05-07T02:00:00Z",
      "2026-05-07T03:00:00Z",
    ]);
  });

  it("falls back to file order for lines without `at`", () => {
    const { lines } = parseJsonl(
      [`{"id":"a","note":"first"}`, `{"id":"a","note":"second"}`].join("\n"),
    );
    const sorted = sortByAt(lines);
    expect(sorted.map((l) => l.fields.note)).toEqual(["first", "second"]);
  });

  it("places lines with `at` before lines without (within the same group)", () => {
    const { lines } = parseJsonl(
      [
        `{"id":"a","note":"undated"}`,
        `{"id":"a","at":"2026-01-01","note":"dated"}`,
      ].join("\n"),
    );
    const sorted = sortByAt(lines);
    expect(sorted[0]?.fields.note).toBe("dated");
    expect(sorted[1]?.fields.note).toBe("undated");
  });
});

describe("schema events", () => {
  it("collects op:\"schema\" lines into `schemas`, not `lines`", () => {
    const content = [
      `{"op":"schema","at":"2026-05-07T09:00:00Z","by":"alice","version":1,"schema":{"fields":{"name":{"type":"text"}}}}`,
      `{"id":"a","at":"2026-05-07T10:00:00Z","name":"Acme"}`,
    ].join("\n");
    const { lines, schemas, errors } = parseJsonl(content);
    expect(errors).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(schemas).toHaveLength(1);
    expect(schemas[0]).toMatchObject({
      lineNumber: 1,
      at: "2026-05-07T09:00:00Z",
      by: "alice",
      version: 1,
      schema: { fields: { name: { type: "text" } } },
    });
  });

  it("does not require `id` on schema events", () => {
    const { schemas, errors } = parseJsonl(
      `{"op":"schema","schema":{"fields":{}}}`,
    );
    expect(errors).toEqual([]);
    expect(schemas).toHaveLength(1);
  });

  it("treats absent `schema` payload as empty object", () => {
    const { schemas } = parseJsonl(`{"op":"schema"}`);
    expect(schemas[0]?.schema).toEqual({});
  });

  it("rejects non-object `schema` payloads (treats them as empty)", () => {
    const { schemas } = parseJsonl(`{"op":"schema","schema":[1,2,3]}`);
    expect(schemas[0]?.schema).toEqual({});
  });

  it("entity lines without id still error even when other lines are schemas", () => {
    const content = [
      `{"op":"schema","schema":{}}`,
      `{"name":"no id"}`,
    ].join("\n");
    const { schemas, errors } = parseJsonl(content);
    expect(schemas).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toBe("missing-id");
  });
});

describe("distinctIds", () => {
  it("returns ids in first-appearance order without duplicates", () => {
    const { lines } = parseJsonl(
      [
        `{"id":"b"}`,
        `{"id":"a"}`,
        `{"id":"b"}`,
        `{"id":"c"}`,
        `{"id":"a"}`,
      ].join("\n"),
    );
    expect(distinctIds(lines)).toEqual(["b", "a", "c"]);
  });
});
