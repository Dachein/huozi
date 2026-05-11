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

  it("preserves inline <script> but strips <script src=...>", async () => {
    // Documented sandbox contract: inline JS is allowed (dashboards need
    // it to read sibling files); external src is blocked (validator
    // already warns about these). on* handlers / javascript: URLs are
    // neutralized by the same pipeline — markup-level XSS stays closed.
    const input = `<body>
      <link rel="stylesheet" href="/__assets__/x.css">
      <script>const x = 1;</script>
      <script src="https://evil.example.com/bad.js"></script>
      <p>hi</p>
    </body>`;
    const { html } = await processHtmlDirect(input, { assetBase: "/p/xyz" });
    expect(html).toContain("const x = 1");
    expect(html).not.toContain("evil.example.com");
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

  it("unscoped + fetchAsset inlines workspace stylesheet but keeps other <link> tags", async () => {
    let fetchCalls = 0;
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/__assets__/blog/v1.css">
  <link rel="stylesheet" href="https://cdn.example.com/external.css">
  <link rel="icon" href="/favicon.ico">
</head><body><p>hi</p></body></html>`;
    const { html } = await processHtmlDirect(input, {
      assetBase: "/p/xyz",
      fetchAsset: async (url) => {
        fetchCalls++;
        return url === "/__assets__/blog/v1.css" ? "body { color: red; }" : null;
      },
    });
    expect(fetchCalls).toBe(1);
    // Workspace stylesheet is gone (inlined as <style>).
    expect(html).not.toContain("/__assets__/");
    expect(html).not.toContain("/p/xyz/a/blog/v1.css");
    // External CDN stylesheet stays — we can't inline what we don't fetch.
    expect(html).toContain("cdn.example.com/external.css");
    // Non-stylesheet links pass through unchanged.
    expect(html).toContain('rel="icon"');
    // Inlined CSS shows up as a <style> block (no @scope without scopeTo).
    expect(html).toContain("<style>");
    expect(html).toContain("color: red");
    expect(html).not.toContain("@scope");
  });
});

describe("processHtmlDirect — body > X / body::pseudo rewriting under scopeTo", () => {
  it("rewrites `body > nav` to `:scope > nav` under @scope", async () => {
    const input = `<!doctype html>
<html><head><style>body > nav { padding: 1rem; }</style></head>
<body><nav>x</nav></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
    });
    expect(html).toContain("@scope (.huozi-html-host)");
    expect(html).toContain(":scope > nav");
    expect(html).not.toContain("body > nav");
  });

  it("rewrites `body::before` to `:scope::before` under @scope", async () => {
    const input = `<!doctype html>
<html><head><style>body::before { content: ""; }</style></head>
<body></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
    });
    expect(html).toContain(":scope::before");
    expect(html).not.toMatch(/body::before/);
  });

  it("rewrites all selectors in a `body > nav, body > header, body > section` list", async () => {
    const input = `<!doctype html>
<html><head><style>
body > nav, body > header, body > section { max-width: 38rem; }
</style></head><body></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
    });
    expect(html).toContain(":scope > nav");
    expect(html).toContain(":scope > header");
    expect(html).toContain(":scope > section");
    expect(html).not.toContain("body >");
  });

  it("leaves compound selectors like `body.dark` alone (existing trade-off)", async () => {
    const input = `<!doctype html>
<html><head><style>body.dark { color: white; }</style></head>
<body class="dark"></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
    });
    // body.dark stays as-is — won't match anything in scope, but doesn't
    // get falsely rewritten either.
    expect(html).toContain("body.dark");
  });
});

describe("processHtmlDirect — hostAsBody dual-emit (share path)", () => {
  it("dual-emits `body > nav` to also match `<hostAsBody> > nav` on inline <style>", async () => {
    const input = `<!doctype html>
<html><head><style>
body > nav { max-width: 38rem; padding: 0 1.5rem; margin: 0 auto; }
</style></head><body><nav>x</nav></body></html>`;
    const { html } = await processHtmlDirect(input, {
      hostAsBody: ".huozi-html-host",
    });
    expect(html).toContain("body > nav");
    expect(html).toContain(".huozi-html-host > nav");
  });

  it("applies dual-emit to fetchAsset-inlined CSS too (the share blog flow)", async () => {
    const input = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/__assets__/blog/v1.css">
</head><body><nav>x</nav></body></html>`;
    const { html } = await processHtmlDirect(input, {
      assetBase: "/p/xyz",
      hostAsBody: ".huozi-html-host",
      fetchAsset: async () => "body > nav { padding: 1rem; }",
    });
    expect(html).toContain("body > nav");
    expect(html).toContain(".huozi-html-host > nav");
    expect(html).not.toContain("<link");
  });

  it("hostAsBody is a no-op when scopeTo is set (`@scope` handles it)", async () => {
    const input = `<!doctype html>
<html><head><style>body > nav { padding: 1rem; }</style></head>
<body></body></html>`;
    const { html } = await processHtmlDirect(input, {
      scopeTo: ".huozi-html-host",
      hostAsBody: ".huozi-html-host",
    });
    // Scoped path rewrites body > nav to :scope > nav. We don't ALSO add a
    // dual-emit (would be redundant since :scope IS the host).
    expect(html).toContain(":scope > nav");
    // No bare ".huozi-html-host > nav" outside the @scope wrapper either.
    expect(html).not.toMatch(/\}\s*\.huozi-html-host > nav/);
  });

  it("does not dual-emit selectors that aren't `body > X` (e.g. `header > h1`)", async () => {
    const input = `<!doctype html>
<html><head><style>header > h1 { font-size: 2rem; }</style></head>
<body></body></html>`;
    const { html } = await processHtmlDirect(input, {
      hostAsBody: ".huozi-html-host",
    });
    expect(html).toContain("header > h1");
    expect(html).not.toContain(".huozi-html-host > h1");
  });
});
