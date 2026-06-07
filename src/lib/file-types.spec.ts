import { describe, it, expect } from "vitest";
import {
  FOUR_TYPES,
  filterByType,
  getExt,
  getFileType,
  isAssetPath,
  isSystemPath,
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

describe("isSystemPath", () => {
  const projects = new Set(["myproj"]);

  it("hides any path with a dot segment (family ①)", () => {
    expect(isSystemPath(".huozi/clippings/u1/clippings.jsonl")).toBe(true);
    expect(isSystemPath("myproj/.huozi/memory.md")).toBe(true);
    expect(isSystemPath(".huozi-keep")).toBe(true);
    expect(isSystemPath("sub/.huozi-keep")).toBe(true);
  });

  it("hides root inbox.jsonl only at the root (family ②)", () => {
    expect(isSystemPath("inbox.jsonl")).toBe(true);
    // A nested inbox.jsonl is user content, not the mail store.
    expect(isSystemPath("archive/inbox.jsonl")).toBe(false);
  });

  it("hides the root tasks/ subtree (family ③)", () => {
    expect(isSystemPath("tasks/abc-123.jsonl")).toBe(true);
    // Bare root tasks.jsonl is not under tasks/ and not a project task.
    expect(isSystemPath("tasks.jsonl")).toBe(false);
  });

  it("hides <project>/tasks.jsonl only under a project folder (family ④)", () => {
    expect(isSystemPath("myproj/tasks.jsonl", projects)).toBe(true);
    // Same basename outside a project is kept.
    expect(isSystemPath("other/tasks.jsonl", projects)).toBe(false);
    // Also accepts an array of project folders.
    expect(isSystemPath("myproj/tasks.jsonl", ["myproj"])).toBe(true);
    // Without projectFolders we can't classify family ④ — kept.
    expect(isSystemPath("myproj/tasks.jsonl")).toBe(false);
  });

  it("keeps user content that merely looks system-y", () => {
    for (const p of [
      "people.jsonl",
      "README.md",
      "schema.json",
      "mail-threads.jsonl",
      "threads.jsonl",
      "blog/post.html",
      "modules/x.md",
    ]) {
      expect(isSystemPath(p, projects)).toBe(false);
    }
  });

  it("does NOT classify dunder assets as system (that is isAssetPath's job)", () => {
    expect(isSystemPath("__assets__/a1b2.png")).toBe(false);
  });
});

describe("isAssetPath", () => {
  it("matches a __dunder__ segment at any depth", () => {
    expect(isAssetPath("__assets__/a1b2.png")).toBe(true);
    expect(isAssetPath("deep/__assets__/x.png")).toBe(true);
  });

  it("does not match dot paths or ordinary names", () => {
    expect(isAssetPath(".huozi/memory.md")).toBe(false);
    expect(isAssetPath("assets/x.png")).toBe(false);
    expect(isAssetPath("__not_closed/x.png")).toBe(false);
    expect(isAssetPath("report.md")).toBe(false);
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
