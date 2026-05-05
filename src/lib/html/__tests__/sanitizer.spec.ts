import { describe, expect, it } from "vitest";
import { processHtmlDirect } from "../sanitizer";

describe("processHtmlDirect — link & asset rewriting", () => {
  it("preserves <link rel=stylesheet> from <head>", () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="https://example.com/a.css">
</head><body><p>hi</p></body></html>`;
    const { html } = processHtmlDirect(input);
    expect(html).toContain('<link rel="stylesheet" href="https://example.com/a.css">');
    expect(html).toContain("<p>hi</p>");
  });

  it("rewrites /__assets__/ in href when assetBase is set", () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/__assets__/blog/v1.css">
</head><body><p>hi</p></body></html>`;
    const { html } = processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).toContain('href="/p/xyz/a/blog/v1.css"');
    expect(html).not.toContain("/__assets__/");
  });

  it("rewrites /__assets__/ in <img src> too", () => {
    const input = `<body><img src="/__assets__/cover.png"></body>`;
    const { html } = processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).toContain('src="/p/xyz/a/cover.png"');
  });

  it("does NOT touch external URLs", () => {
    const input = `<body><img src="https://cdn.example.com/x.png"></body>`;
    const { html } = processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).toContain('src="https://cdn.example.com/x.png"');
  });

  it("does NOT rewrite when assetBase is omitted", () => {
    const input = `<body><img src="/__assets__/cover.png"></body>`;
    const { html } = processHtmlDirect(input);
    expect(html).toContain('src="/__assets__/cover.png"');
  });

  it("strips <link> from body to avoid duplication after re-emission", () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/a.css">
</head><body>
  <link rel="stylesheet" href="/b.css">
  <p>hi</p>
</body></html>`;
    const { html } = processHtmlDirect(input);
    // Both links are extracted and re-emitted at the top exactly once each.
    const matches = html.match(/<link\b/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("still strips <script> for security", () => {
    const input = `<body>
      <link rel="stylesheet" href="/__assets__/x.css">
      <script>alert(1)</script>
      <p>hi</p>
    </body>`;
    const { html } = processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).not.toContain("<script");
    expect(html).toContain('href="/p/xyz/a/x.css"');
  });
});
