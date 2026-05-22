import { describe, it, expect } from "vitest";
import { detectHuoziFormat } from "../detect-format";

describe("detectHuoziFormat", () => {
  it("detects deck from explicit meta", () => {
    expect(
      detectHuoziFormat(
        `<meta name="huozi:format" content="deck"><body>x</body>`,
      ),
    ).toBe("deck");
  });

  it("detects deck from body class (legacy)", () => {
    expect(detectHuoziFormat(`<body class="huozi-deck">x</body>`)).toBe(
      "deck",
    );
  });

  it("falls back to blog when nothing is declared", () => {
    expect(detectHuoziFormat(`<html><body>plain</body></html>`)).toBe("blog");
  });

  it("does NOT detect format from <pre><code> example markup", () => {
    // Spec doc that shows example HTML inside code blocks must stay "blog".
    // Previously this false-positived to deck and broke ShareViewer scroll.
    const specDoc = `<html><head></head><body>
      <h1>spec</h1>
      <p>example:</p>
      <pre><code>&lt;body class="huozi-deck"&gt; ... &lt;/body&gt;</code></pre>
    </body></html>`;
    expect(detectHuoziFormat(specDoc)).toBe("blog");
  });

  it("does NOT detect format from meta inside code blocks", () => {
    const html = `<html><body>
      <pre><code>&lt;meta name="huozi:format" content="story"&gt;</code></pre>
    </body></html>`;
    expect(detectHuoziFormat(html)).toBe("blog");
  });

  it("does NOT detect format from HTML comments", () => {
    const html = `<!-- <body class="huozi-paper"> example --><body>x</body>`;
    expect(detectHuoziFormat(html)).toBe("blog");
  });

  it("does NOT detect format from <style> rules", () => {
    // CSS rules mentioning huozi-deck shouldn't trigger format detection.
    const html = `<style>.huozi-deck { color: red }</style><body>x</body>`;
    expect(detectHuoziFormat(html)).toBe("blog");
  });

  it("real format declaration outside code wins over examples inside", () => {
    const html = `
      <meta name="huozi:format" content="story">
      <pre><code>&lt;meta name="huozi:format" content="deck"&gt;</code></pre>
      <body>x</body>
    `;
    expect(detectHuoziFormat(html)).toBe("story");
  });
});
