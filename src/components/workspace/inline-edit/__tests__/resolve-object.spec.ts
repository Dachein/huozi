import { describe, expect, it } from "vitest";
import {
  resolveObject,
  widenIfSelectionEscapes,
} from "../use-object-selection";

/**
 * Build a fake Element graph that implements just the two DOM APIs
 * `resolveObject` calls — `contains` and `compareDocumentPosition`.
 * Avoids pulling jsdom in as a dev dep for a 4-case test.
 */
interface FakeEl {
  id: string;
  parent: FakeEl | null;
  order: number;
  tagName: string;
  hasObjSrc: boolean;
  parentElement: FakeEl | null;
  contains(other: Node | null): boolean;
  compareDocumentPosition(other: Node): number;
  hasAttribute(name: string): boolean;
}

function isAncestor(a: FakeEl, b: FakeEl): boolean {
  let cur: FakeEl | null = b;
  while (cur) {
    if (cur === a) return true;
    cur = cur.parent;
  }
  return false;
}

function el(
  id: string,
  order: number,
  parent: FakeEl | null = null,
  tagName: string = "span",
  hasObjSrc: boolean = true,
): FakeEl {
  const node: FakeEl = {
    id,
    order,
    parent,
    tagName: tagName.toUpperCase(),
    hasObjSrc,
    parentElement: parent,
    contains(other: Node | null): boolean {
      if (!other) return false;
      return isAncestor(this, other as unknown as FakeEl);
    },
    compareDocumentPosition(other: Node): number {
      const fake = other as unknown as FakeEl;
      return fake.order > this.order ? 0x04 : 0x02;
    },
    hasAttribute(name: string): boolean {
      return name === "data-obj-src" && this.hasObjSrc;
    },
  };
  return node;
}

function asEl(n: FakeEl): HTMLElement {
  return n as unknown as HTMLElement;
}

describe("resolveObject (LCA across data-obj subtrees)", () => {
  it("returns the same node when both endpoints land on it", () => {
    const p = el("p", 1);
    expect(resolveObject(asEl(p), asEl(p))).toBe(asEl(p));
  });

  it("returns the parent when selection straddles a nested object", () => {
    // <p data-obj><strong data-obj>...</strong></p>
    // selection start in p text, end in strong → LCA = p.
    const p = el("p", 1);
    const strong = el("strong", 2, p);
    const r1 = resolveObject(asEl(p), asEl(strong)) as unknown as FakeEl;
    expect(r1.id).toBe("p");
    const r2 = resolveObject(asEl(strong), asEl(p)) as unknown as FakeEl;
    expect(r2.id).toBe("p");
  });

  it("returns first-in-document-order when subtrees are disjoint", () => {
    const p1 = el("p1", 1);
    const p2 = el("p2", 5);
    const r1 = resolveObject(asEl(p1), asEl(p2)) as unknown as FakeEl;
    expect(r1.id).toBe("p1");
    const r2 = resolveObject(asEl(p2), asEl(p1)) as unknown as FakeEl;
    expect(r2.id).toBe("p1");
  });

  it("falls back to the non-null side when one endpoint is outside any object", () => {
    const p = el("p", 1);
    const r1 = resolveObject(asEl(p), null) as unknown as FakeEl;
    expect(r1.id).toBe("p");
    const r2 = resolveObject(null, asEl(p)) as unknown as FakeEl;
    expect(r2.id).toBe("p");
    expect(resolveObject(null, null)).toBeNull();
  });
});

describe("widenIfSelectionEscapes", () => {
  it("keeps the resolved element when it contains both endpoints", () => {
    // <strong> word </strong> — selection inside strong's own text.
    const li = el("li", 1, null, "li");
    const strong = el("strong", 2, li, "strong");
    const text = el("text", 3, strong, "#text");
    const result = widenIfSelectionEscapes(
      asEl(strong),
      text as unknown as Node,
      text as unknown as Node,
    ) as unknown as FakeEl;
    expect(result.id).toBe("strong");
  });

  it("widens an inline LCA to the surrounding block when selection escapes", () => {
    // Source: `- **付款卡**: Mastercard 尾号 **3393**`
    // User selection start in strong1's text, end in plain text or strong2.
    // LCA returns strong1; widening should land on the <li>.
    const li = el("li", 1, null, "li");
    const strong1 = el("strong1", 2, li, "strong");
    const text1 = el("t1", 3, strong1, "#text");
    const middleText = el("mid", 4, li, "#text");
    const strong2 = el("strong2", 5, li, "strong");
    const result = widenIfSelectionEscapes(
      asEl(strong1),
      text1 as unknown as Node,
      // End is in the text node sibling of strong1, outside strong1.
      middleText as unknown as Node,
    ) as unknown as FakeEl;
    expect(result.id).toBe("li");
    // Same for end in strong2 (also outside strong1).
    const result2 = widenIfSelectionEscapes(
      asEl(strong1),
      text1 as unknown as Node,
      strong2 as unknown as Node,
    ) as unknown as FakeEl;
    expect(result2.id).toBe("li");
  });

  it("falls back to resolved when no block ancestor exists", () => {
    // span with no annotated ancestor — widening can't help, return as-is.
    const span = el("s", 1, null, "span");
    const text = el("t", 2, span, "#text");
    const otherText = el("ot", 3, null, "#text");
    const result = widenIfSelectionEscapes(
      asEl(span),
      text as unknown as Node,
      otherText as unknown as Node,
    ) as unknown as FakeEl;
    expect(result.id).toBe("s");
  });

  it("skips ancestors without data-obj-src and lands on the next annotated block", () => {
    // <article (no data-obj)> <li (data-obj)> <strong (data-obj)> </strong>
    // Selection escapes strong → walk up → article skipped → li returned.
    const article = el("article", 1, null, "article", false);
    const li = el("li", 2, article, "li");
    const strong = el("s", 3, li, "strong");
    const text = el("t", 4, strong, "#text");
    const outside = el("o", 99, null, "#text");
    const result = widenIfSelectionEscapes(
      asEl(strong),
      text as unknown as Node,
      outside as unknown as Node,
    ) as unknown as FakeEl;
    expect(result.id).toBe("li");
  });
});
