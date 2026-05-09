import { describe, expect, it } from "vitest";
import { renderMarkdown, rewriteAssetUrls } from "../renderer";

/**
 * Inline-edit regression tests: when `withSourcePos: true`, the renderer
 * must annotate inline mdast nodes (strong, em, a, code, …) with
 * `data-obj-src="<start>,<end>"` so the workspace selection hook can
 * resolve a click inside `**bold**` back to the markdown bytes. The
 * sanitizer schema is what makes or breaks this — it has to whitelist
 * the attribute on every annotated tag. See docs/inline-edit.md §2.
 */
describe("renderMarkdown with source positions (inline granularity)", () => {
  it("annotates <strong> inside a paragraph with byte offsets", async () => {
    const md = "讲完观察。我们的设计决定，是**不要再发明 API**。";
    const html = await renderMarkdown(md, { withSourcePos: true });
    // Both the wrapping <p> and the inner <strong> should carry markers.
    expect(html).toMatch(/<p\s[^>]*data-obj-src="\d+,\d+"/);
    const strongMatch = html.match(
      /<strong\s[^>]*data-obj-src="(\d+),(\d+)"[^>]*>/,
    );
    expect(strongMatch).not.toBeNull();
    if (!strongMatch) return;
    const start = Number(strongMatch[1]);
    const end = Number(strongMatch[2]);
    // The recovered slice should be exactly `**...**` with the markers.
    expect(md.slice(start, end)).toBe("**不要再发明 API**");
  });

  it("annotates <a> link nodes with their full source span", async () => {
    const md = "See [the docs](https://example.com) for details.";
    const html = await renderMarkdown(md, { withSourcePos: true });
    const aMatch = html.match(/<a\s[^>]*data-obj-src="(\d+),(\d+)"/);
    expect(aMatch).not.toBeNull();
    if (!aMatch) return;
    expect(md.slice(Number(aMatch[1]), Number(aMatch[2]))).toBe(
      "[the docs](https://example.com)",
    );
  });

  it("does NOT annotate when withSourcePos is omitted", async () => {
    const md = "**bold**";
    const html = await renderMarkdown(md);
    expect(html).not.toMatch(/data-obj-src/);
  });
});

describe("rewriteAssetUrls", () => {
  const base = "/p/abc123";

  it("rewrites double-quoted src", () => {
    const out = rewriteAssetUrls(
      '<img src="/__assets__/foo.png" alt="x">',
      base,
    );
    expect(out).toBe('<img src="/p/abc123/a/foo.png" alt="x">');
  });

  it("rewrites single-quoted src", () => {
    const out = rewriteAssetUrls(
      "<img src='/__assets__/foo.png' />",
      base,
    );
    expect(out).toBe("<img src='/p/abc123/a/foo.png' />");
  });

  it("rewrites unquoted src (rehype edge case)", () => {
    const out = rewriteAssetUrls(
      "<img src=/__assets__/foo.png>",
      base,
    );
    expect(out).toBe("<img src=/p/abc123/a/foo.png>");
  });

  it("rewrites href the same way", () => {
    const out = rewriteAssetUrls(
      '<a href="/__assets__/diagram.svg">link</a>',
      base,
    );
    expect(out).toBe('<a href="/p/abc123/a/diagram.svg">link</a>');
  });

  it("rewrites paths with subfolders", () => {
    const out = rewriteAssetUrls(
      '<img src="/__assets__/figures/2025/q1/chart.png">',
      base,
    );
    expect(out).toBe('<img src="/p/abc123/a/figures/2025/q1/chart.png">');
  });

  it("rewrites multiple references in one document", () => {
    const html = `<p><img src="/__assets__/a.png"><img src="/__assets__/b.png"></p>`;
    const out = rewriteAssetUrls(html, base);
    expect(out).toBe(
      `<p><img src="/p/abc123/a/a.png"><img src="/p/abc123/a/b.png"></p>`,
    );
  });

  it("does NOT touch non-asset paths", () => {
    const html = `<img src="/static/logo.png"><img src="https://cdn.example.com/x.png">`;
    expect(rewriteAssetUrls(html, base)).toBe(html);
  });

  it("does NOT match `__assets__` deeper in a path", () => {
    // Only matches `/__assets__/...` at the start of the URL, not a
    // segment buried inside another path.
    const html = `<img src="/blog/__assets__/x.png">`;
    expect(rewriteAssetUrls(html, base)).toBe(html);
  });

  it("strips trailing slashes from base", () => {
    const out = rewriteAssetUrls(
      '<img src="/__assets__/foo.png">',
      "/p/abc123///",
    );
    expect(out).toBe('<img src="/p/abc123/a/foo.png">');
  });

  it("preserves attribute order and surrounding markup", () => {
    const html =
      '<figure class="x"><img alt="cap" src="/__assets__/c.png" loading="lazy"/><figcaption>cap</figcaption></figure>';
    const out = rewriteAssetUrls(html, base);
    expect(out).toContain('src="/p/abc123/a/c.png"');
    expect(out).toContain('alt="cap"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain("<figcaption>cap</figcaption>");
  });

  it("does not touch query strings on non-asset URLs", () => {
    const html = '<a href="/search?q=__assets__">x</a>';
    expect(rewriteAssetUrls(html, base)).toBe(html);
  });
});

describe("renderMarkdown end-to-end with assetBase", () => {
  it("rewrites markdown image references through the pipeline", async () => {
    const md = `# Title\n\n![alt](/__assets__/figure-1.png)\n`;
    const html = await renderMarkdown(md, { assetBase: "/p/xyz" });
    expect(html).toContain('src="/p/xyz/a/figure-1.png"');
    expect(html).not.toContain("/__assets__/");
  });

  it("rewrites raw HTML <img> embedded in markdown", async () => {
    const md = `Inline: <img src="/__assets__/bar.png" alt="b" />`;
    const html = await renderMarkdown(md, { assetBase: "/p/xyz" });
    expect(html).toContain('src="/p/xyz/a/bar.png"');
  });

  it("leaves /__assets__/ alone when assetBase is omitted", async () => {
    const md = `![alt](/__assets__/figure-1.png)`;
    const html = await renderMarkdown(md);
    expect(html).toContain('src="/__assets__/figure-1.png"');
    expect(html).not.toContain("/p/");
  });
});
