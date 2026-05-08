import { describe, expect, it } from "vitest";
import {
  countOccurrences,
  expandToUnique,
  findHtmlInnerRange,
} from "../anchor";

describe("countOccurrences", () => {
  it("returns 0 for missing needle", () => {
    expect(countOccurrences("abc", "x")).toBe(0);
  });
  it("returns 1 for single match", () => {
    expect(countOccurrences("the quick fox", "quick")).toBe(1);
  });
  it("caps at 2 for repeated", () => {
    expect(countOccurrences("aaaa", "a")).toBe(2);
    expect(countOccurrences("hello hello hello", "hello")).toBe(2);
  });
});

describe("expandToUnique", () => {
  it("returns input unchanged when slice is already unique", () => {
    const src = "abcdef";
    const r = expandToUnique(src, 1, 4); // "bcd"
    expect(r.isUnique).toBe(true);
    expect([r.left, r.right]).toEqual([1, 4]);
  });

  it("expands when slice repeats in source", () => {
    // "ab" appears 3 times; widening picks up surrounding context.
    const src = "x ab y ab z ab w";
    const start = src.indexOf("ab", 11); // last occurrence
    const r = expandToUnique(src, start, start + 2);
    expect(r.isUnique).toBe(true);
    expect(src.slice(r.left, r.right)).toContain("ab");
    // Extended slice should include enough context (the trailing "w").
    expect(r.right).toBeGreaterThan(start + 2);
  });

  it("reaches uniqueness on a uniform-character source via boundary", () => {
    // 20 a's, start at [5,6]. countOccurrences uses NON-overlapping
    // matches (pos += needle.length), matching JS's standard
    // string-replace semantics. So a slice that exceeds half the
    // source length becomes "unique" by counting rules — once it
    // does, expansion stops.
    const src = "a".repeat(20);
    const r = expandToUnique(src, 5, 6);
    expect(r.isUnique).toBe(true);
    expect(r.right - r.left).toBeGreaterThan(10);
  });
});

describe("findHtmlInnerRange", () => {
  it("locates inner content of a simple paired tag", () => {
    const s = "<p>hello</p>";
    const r = findHtmlInnerRange(s)!;
    expect(s.slice(r.innerStart, r.innerEnd)).toBe("hello");
  });

  it("locates inner content with attributes", () => {
    const s = '<a href="x?b>c">link</a>';
    const r = findHtmlInnerRange(s)!;
    expect(s.slice(r.innerStart, r.innerEnd)).toBe("link");
  });

  it("returns null for void elements (no inner)", () => {
    expect(findHtmlInnerRange("<br>")).toBeNull();
    expect(findHtmlInnerRange("<img src=\"x\">")).toBeNull();
  });

  it("returns null for self-closing", () => {
    expect(findHtmlInnerRange("<input/>")).toBeNull();
    expect(findHtmlInnerRange('<input type="x"/>')).toBeNull();
  });

  it("locates inner content of empty element", () => {
    const s = "<p></p>";
    const r = findHtmlInnerRange(s)!;
    expect(r.innerStart).toBe(r.innerEnd);
    expect(s.slice(r.innerStart, r.innerEnd)).toBe("");
  });

  it("preserves nested tags inside the inner range", () => {
    const s = "<div>before <em>x</em> after</div>";
    const r = findHtmlInnerRange(s)!;
    expect(s.slice(r.innerStart, r.innerEnd)).toBe("before <em>x</em> after");
  });
});
