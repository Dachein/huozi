import { describe, it, expect } from "vitest";
import {
  FOUR_TYPES,
  filterByType,
  getExt,
  getFileType,
} from "./file-types";

describe("getExt", () => {
  it("returns lowercase extension without leading dot", () => {
    expect(getExt("notes.MD")).toBe("md");
    expect(getExt("a/b/c.JSONL")).toBe("jsonl");
  });

  it("returns empty string for paths without extension", () => {
    expect(getExt("README")).toBe("");
    expect(getExt("foo/")).toBe("");
    expect(getExt("trailing.")).toBe("");
  });

  it("uses the last dot only", () => {
    expect(getExt("a.b.c.tsv")).toBe("tsv");
  });
});

describe("getFileType", () => {
  it("maps CSV / TSV to table", () => {
    expect(getFileType("data.csv")).toBe("table");
    expect(getFileType("data.tsv")).toBe("table");
  });

  it("maps MD / MDX to document", () => {
    expect(getFileType("notes.md")).toBe("document");
    expect(getFileType("blog/post.mdx")).toBe("document");
  });

  it("maps JSONL to collection", () => {
    expect(getFileType("orders.jsonl")).toBe("collection");
  });

  it("maps HTML / HTM to page", () => {
    expect(getFileType("cover.html")).toBe("page");
    expect(getFileType("legacy.htm")).toBe("page");
  });

  it("maps unknown extensions (incl. plain JSON) to other", () => {
    expect(getFileType("script.ts")).toBe("other");
    // Plain JSON is intentionally NOT a Collection — only JSONL is.
    expect(getFileType("config.json")).toBe("other");
    expect(getFileType("README")).toBe("other");
  });

  it("is case-insensitive on the extension", () => {
    expect(getFileType("DATA.CSV")).toBe("table");
    expect(getFileType("Notes.MD")).toBe("document");
    expect(getFileType("Stream.JSONL")).toBe("collection");
    expect(getFileType("Cover.HTML")).toBe("page");
  });
});

describe("filterByType", () => {
  const paths = [
    "crm/customers.csv",
    "crm/playbook.md",
    "crm/interactions.jsonl",
    "crm/proposals/acme.html",
    "scripts/build.ts",
  ];

  it("returns only paths of the requested type", () => {
    expect(filterByType(paths, "table")).toEqual(["crm/customers.csv"]);
    expect(filterByType(paths, "document")).toEqual(["crm/playbook.md"]);
    expect(filterByType(paths, "collection")).toEqual([
      "crm/interactions.jsonl",
    ]);
    expect(filterByType(paths, "page")).toEqual(["crm/proposals/acme.html"]);
    expect(filterByType(paths, "other")).toEqual(["scripts/build.ts"]);
  });
});

describe("FOUR_TYPES", () => {
  it("lists the four primary types in canonical order", () => {
    expect(FOUR_TYPES).toEqual([
      "table",
      "document",
      "collection",
      "page",
    ]);
  });

  it("does not include 'other' (which is a fallback, not a peer)", () => {
    expect(FOUR_TYPES).not.toContain("other");
  });
});
