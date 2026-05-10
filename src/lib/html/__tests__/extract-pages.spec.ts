import { describe, it, expect } from "vitest";
import { ensurePageIds, extractPages } from "../extract-pages";

describe("ensurePageIds", () => {
  it("injects id=\"s${N}\" onto data-page sections lacking one", () => {
    const input = `
      <section data-page>A</section>
      <section data-page>B</section>
    `;
    const out = ensurePageIds(input);
    expect(out).toContain('<section id="s1" data-page>');
    expect(out).toContain('<section id="s2" data-page>');
  });

  it("leaves explicit ids alone (idempotent)", () => {
    const input = `<section id="cover" data-page>A</section><section data-page>B</section>`;
    const out = ensurePageIds(input);
    expect(out).toContain('<section id="cover" data-page>');
    expect(out).toContain('<section id="s2" data-page>');
    // Second pass produces no further changes.
    expect(ensurePageIds(out)).toBe(out);
  });

  it("works with article tags too", () => {
    const input = `<article data-page>X</article>`;
    expect(ensurePageIds(input)).toContain('<article id="s1" data-page>');
  });

  it("preserves other attributes and quoting", () => {
    const input = `<section class="slide" data-page data-title="封面">x</section>`;
    const out = ensurePageIds(input);
    expect(out).toContain(
      '<section id="s1" class="slide" data-page data-title="封面">',
    );
  });

  it("skips sections inside HTML comments", () => {
    const input = `
      <!-- example: <section data-page>ignored</section> -->
      <section data-page>real</section>
    `;
    const out = ensurePageIds(input);
    expect(out).toContain('<section id="s1" data-page>real</section>');
    // Commented example stays intact, no id injected inside the comment.
    expect(out).toMatch(/<!-- example: <section data-page>ignored<\/section> -->/);
  });

  it("DOM ids match extractPages output indices", () => {
    // Mirror of the deck case: every section has data-page, none has id.
    const input = `
      <section data-page data-title="封面">P1</section>
      <section data-page data-title="问题">P2</section>
      <section data-page data-title="方案">P3</section>
    `;
    const injected = ensurePageIds(input);
    const pages = extractPages(injected);
    // Each id reported by extractPages exists as a literal id="..." in the
    // injected HTML — this is the contract that scrollIntoView depends on.
    for (const p of pages) {
      expect(injected).toContain(`id="${p.id}"`);
    }
    expect(pages.map((p) => p.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("does not touch sections without data-page", () => {
    const input = `<section class="x">no</section>`;
    expect(ensurePageIds(input)).toBe(input);
  });
});
