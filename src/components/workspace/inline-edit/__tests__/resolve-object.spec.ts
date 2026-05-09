import { describe, expect, it } from "vitest";
import { resolveObject } from "../use-object-selection";

/**
 * Build a fake Element graph that implements just the two DOM APIs
 * `resolveObject` calls — `contains` and `compareDocumentPosition`.
 * Avoids pulling jsdom in as a dev dep for a 4-case test.
 */
interface FakeEl {
  id: string;
  parent: FakeEl | null;
  order: number;
  contains(other: Node | null): boolean;
  compareDocumentPosition(other: Node): number;
}

function isAncestor(a: FakeEl, b: FakeEl): boolean {
  let cur: FakeEl | null = b;
  while (cur) {
    if (cur === a) return true;
    cur = cur.parent;
  }
  return false;
}

function el(id: string, order: number, parent: FakeEl | null = null): FakeEl {
  const node: FakeEl = {
    id,
    order,
    parent,
    contains(other: Node | null): boolean {
      if (!other) return false;
      return isAncestor(this, other as unknown as FakeEl);
    },
    compareDocumentPosition(other: Node): number {
      const fake = other as unknown as FakeEl;
      return fake.order > this.order ? 0x04 : 0x02;
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
