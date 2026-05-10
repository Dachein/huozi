import { describe, it, expect } from "vitest";
import { processHtmlDirect } from "../sanitizer";

describe("processHtmlDirect — platform asset injection", () => {
  it("injects layout CSS for huozi:format=deck", async () => {
    const html = `<!doctype html>
      <html>
      <head><meta name="huozi:format" content="deck"></head>
      <body><div class="huozi-deck"><div class="slides">
        <section class="slide" data-page id="s1">A</section>
      </div></div></body>
      </html>`;
    const out = await processHtmlDirect(html);
    expect(out.html).toContain('<link rel="stylesheet" href="/lib/huozi-layout-deck.css">');
  });

  it("does not inject layout CSS for huozi:format=web (default)", async () => {
    const html = `<!doctype html><html><head></head><body>plain</body></html>`;
    const out = await processHtmlDirect(html);
    expect(out.html).not.toContain("/lib/huozi-layout-");
  });

  it("injects mermaid bundle script + init shim when declared", async () => {
    const html = `<!doctype html>
      <html>
      <head>
        <meta name="huozi:format" content="web">
        <meta name="huozi:bundle" content="mermaid">
      </head>
      <body><pre class="mermaid">flowchart LR\nA --&gt; B</pre></body>
      </html>`;
    const out = await processHtmlDirect(html);
    expect(out.html).toContain(
      '<script defer src="/lib/mermaid-10.9.4.min.js"></script>',
    );
    // Init shim is appended as inline <script>, contains the auto-init source.
    expect(out.html).toContain("mermaid.initialize");
    expect(out.html).toContain("DOMContentLoaded");
  });

  it("injects multiple bundles in declared order with dedup", async () => {
    const html = `<!doctype html>
      <html>
      <head>
        <meta name="huozi:format" content="web">
        <meta name="huozi:bundle" content="highlight,katex,marked,highlight">
      </head>
      <body>x</body>
      </html>`;
    const out = await processHtmlDirect(html);
    expect(out.html).toContain('href="/lib/highlight-github-11.9.0.min.css"');
    expect(out.html).toContain('href="/lib/katex-0.16.11.min.css"');
    expect(out.html).toContain(
      '<script defer src="/lib/highlight-11.9.0.min.js"></script>',
    );
    expect(out.html).toContain(
      '<script defer src="/lib/katex-0.16.11.min.js"></script>',
    );
    expect(out.html).toContain(
      '<script defer src="/lib/katex-auto-render-0.16.11.min.js"></script>',
    );
    expect(out.html).toContain(
      '<script defer src="/lib/dompurify-3.0.11.min.js"></script>',
    );
    expect(out.html).toContain(
      '<script defer src="/lib/marked-12.0.2.min.js"></script>',
    );
    // highlight declared twice — should appear once in output.
    const highlightCount = out.html.match(
      /<script defer src="\/lib\/highlight-11\.9\.0\.min\.js">/g,
    );
    expect(highlightCount?.length).toBe(1);
  });

  it("ignores unknown bundle keys silently (validator handles warning)", async () => {
    const html = `<!doctype html>
      <html><head>
        <meta name="huozi:format" content="web">
        <meta name="huozi:bundle" content="ehcarts">
      </head><body>x</body></html>`;
    const out = await processHtmlDirect(html);
    expect(out.html).not.toContain("ehcarts");
    expect(out.html).not.toContain("<script defer src");
  });

  it("strips author <script src=cdn> but preserves huozi-injected ones", async () => {
    const html = `<!doctype html>
      <html><head>
        <meta name="huozi:format" content="web">
        <meta name="huozi:bundle" content="mermaid">
        <script src="https://cdn.jsdelivr.net/npm/mermaid"></script>
      </head><body>x</body></html>`;
    const out = await processHtmlDirect(html);
    // Author CDN script is stripped.
    expect(out.html).not.toContain("cdn.jsdelivr.net");
    // huozi-injected bundle survives.
    expect(out.html).toContain('src="/lib/mermaid-10.9.4.min.js"');
  });

  it("zero declarations means zero JS / CSS injected", async () => {
    const html = `<!doctype html><html><head></head><body>plain</body></html>`;
    const out = await processHtmlDirect(html);
    expect(out.html).not.toContain("/lib/");
    expect(out.html).not.toContain("<script");
  });

  it("preserves layout CSS in scoped (workspace) mode", async () => {
    const html = `<!doctype html>
      <html><head><meta name="huozi:format" content="story"></head>
      <body><div class="huozi-story"><div class="slides">
        <section class="slide" data-page>A</section>
      </div></div></body></html>`;
    const out = await processHtmlDirect(html, {
      scopeTo: ".huozi-html-host",
    });
    // Author <link>s would be dropped in scoped mode; platform layout CSS
    // is injected via parts and survives — the FileRenderer overrides
    // handle the inline-preview sizing conflict.
    expect(out.html).toContain('href="/lib/huozi-layout-story.css"');
  });
});
