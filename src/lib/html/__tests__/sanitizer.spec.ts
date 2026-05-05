import { describe, expect, it } from "vitest";
import { processHtmlDirect } from "../sanitizer";

describe("processHtmlDirect — link & asset rewriting", () => {
  it("preserves <link rel=stylesheet> from <head>", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="https://example.com/a.css">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input);
    expect(html).toContain('<link rel="stylesheet" href="https://example.com/a.css">');
    expect(html).toContain("<p>hi</p>");
  });

  it("rewrites /__assets__/ in href when assetBase is set", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/__assets__/blog/v1.css">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).toContain('href="/p/xyz/a/blog/v1.css"');
    expect(html).not.toContain("/__assets__/");
  });

  it("rewrites /__assets__/ in <img src> too", async () => {
    const input = `<body><img src="/__assets__/cover.png"></body>`;
    const { html } = await processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).toContain('src="/p/xyz/a/cover.png"');
  });

  it("does NOT touch external URLs", async () => {
    const input = `<body><img src="https://cdn.example.com/x.png"></body>`;
    const { html } = await processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).toContain('src="https://cdn.example.com/x.png"');
  });

  it("does NOT rewrite when assetBase is omitted", async () => {
    const input = `<body><img src="/__assets__/cover.png"></body>`;
    const { html } = await processHtmlDirect(input);
    expect(html).toContain('src="/__assets__/cover.png"');
  });

  it("strips <link> from body to avoid duplication after re-emission", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/a.css">
</head><body>
  <link rel="stylesheet" href="/b.css">
  <p>hi</p>
</body></html>`;
    const { html } = await processHtmlDirect(input);
    // Both links are extracted and re-emitted at the top exactly once each.
    const matches = html.match(/<link\b/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("still strips <script> for security", async () => {
    const input = `<body>
      <link rel="stylesheet" href="/__assets__/x.css">
      <script>alert(1)</script>
      <p>hi</p>
    </body>`;
    const { html } = await processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).not.toContain("<script");
    expect(html).toContain('href="/p/xyz/a/x.css"');
  });
});

describe("processHtmlDirect — scoped mode + fetchAsset", () => {
  it("inlines /__assets__/ stylesheets as @scope-wrapped <style>", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/__assets__/blog/v1.css">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
      fetchAsset: async (url) => {
        expect(url).toBe("/__assets__/blog/v1.css");
        return "body { color: red; }";
      },
    });
    // Original <link> is gone — the bytes ride the @scope path now.
    expect(html).not.toContain("<link");
    expect(html).toContain("@scope (.huozi-html-host)");
    // body → :scope rewrite still applies (existing behavior).
    expect(html).toContain(":scope");
    expect(html).toContain("color: red");
  });

  it("drops cross-origin <link rel=stylesheet> in scoped mode (can't isolate)", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="https://cdn.example.com/external.css">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
      fetchAsset: async () => null,
    });
    expect(html).not.toContain("<link");
    expect(html).not.toContain("cdn.example.com");
    expect(html).toContain("<p>hi</p>");
  });

  it("drops non-stylesheet <link> (icon / alternate) in scoped mode", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="icon" href="/favicon.ico">
  <link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
    });
    expect(html).not.toContain("<link");
    expect(html).toContain("<p>hi</p>");
  });

  it("drops a workspace stylesheet whose fetchAsset returns null", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/__assets__/missing.css">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
      fetchAsset: async () => null,
    });
    expect(html).not.toContain("<link");
    expect(html).not.toContain("@scope");
  });

  it("unscoped (share) mode keeps all <link> tags untouched and never calls fetchAsset", async () => {
    let fetchCalls = 0;
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/__assets__/blog/v1.css">
  <link rel="icon" href="/favicon.ico">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input, {
      assetBase: "/p/xyz",
      fetchAsset: async () => {
        fetchCalls++;
        return "body { color: red; }";
      },
    });
    expect(fetchCalls).toBe(0);
    expect(html).toContain('href="/p/xyz/a/blog/v1.css"');
    expect(html).toContain('rel="icon"');
  });
});
