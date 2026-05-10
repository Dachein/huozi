import { describe, it, expect } from "vitest";
import { summarize, validateHuoziHtml } from "../validate";

describe("validateHuoziHtml", () => {
  it("clean deck returns no issues", () => {
    const html = `<!doctype html>
      <html>
        <head>
          <meta name="huozi:format" content="deck">
        </head>
        <body>
          <section data-page id="s1" data-title="封面">A</section>
          <section data-page id="s2" data-title="问题">B</section>
        </body>
      </html>`;
    expect(validateHuoziHtml(html)).toEqual([]);
  });

  it("flags unknown huozi:format", () => {
    const html = `<meta name="huozi:format" content="widget">`;
    const issues = validateHuoziHtml(html);
    expect(issues.find((i) => i.code === "format-unknown")).toBeDefined();
    expect(issues[0].level).toBe("error");
  });

  it("flags meta vs class mismatch", () => {
    const html = `
      <meta name="huozi:format" content="deck">
      <body class="huozi-story">x</body>
    `;
    const codes = validateHuoziHtml(html).map((i) => i.code);
    expect(codes).toContain("format-meta-class-mismatch");
  });

  it("hints when only class is set (no meta)", () => {
    const html = `<body class="huozi-deck"><section data-page>x</section></body>`;
    const issues = validateHuoziHtml(html);
    const issue = issues.find((i) => i.code === "format-meta-missing");
    expect(issue?.level).toBe("hint");
  });

  it("errors when paginated format has zero pages", () => {
    const html = `<meta name="huozi:format" content="deck"><body>nothing</body>`;
    const issue = validateHuoziHtml(html).find(
      (i) => i.code === "paginated-no-pages",
    );
    expect(issue?.level).toBe("error");
  });

  it("errors on duplicate page ids", () => {
    const html = `
      <meta name="huozi:format" content="deck">
      <section data-page id="cover">A</section>
      <section data-page id="cover">B</section>
    `;
    const issue = validateHuoziHtml(html).find(
      (i) => i.code === "page-id-duplicate",
    );
    expect(issue?.level).toBe("error");
  });

  it("hints on missing data-title", () => {
    const html = `
      <meta name="huozi:format" content="deck">
      <section data-page id="s1">no title</section>
    `;
    const issue = validateHuoziHtml(html).find(
      (i) => i.code === "data-title-missing",
    );
    expect(issue?.level).toBe("hint");
  });

  it("warns on unknown bundle key", () => {
    const html = `
      <meta name="huozi:format" content="web">
      <meta name="huozi:bundle" content="ehcarts,mermaid">
    `;
    const issue = validateHuoziHtml(html).find(
      (i) => i.code === "bundle-unknown-key",
    );
    expect(issue?.level).toBe("warning");
    expect(issue?.message).toContain("ehcarts");
  });

  it("messages do not contain HTML-escaped entities (XSS-safe plain text)", () => {
    // We render messages as text in the banner; entities like &quot; would
    // show up literally. This catches a regression to the broken pattern.
    const html = `<meta name="huozi:format" content="bogus">`;
    const issue = validateHuoziHtml(html).find(
      (i) => i.code === "format-unknown",
    );
    expect(issue?.message).not.toContain("&quot;");
    expect(issue?.message).not.toContain("&amp;");
  });

  it("does not execute injected HTML in format value", () => {
    const html = `<meta name="huozi:format" content="<script>x</script>">`;
    const issues = validateHuoziHtml(html);
    // The message contains the raw payload as text — fine, since the banner
    // renders it via {message}, not dangerouslySetInnerHTML.
    const issue = issues.find((i) => i.code === "format-unknown");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("<script>x</script>");
  });

  it("does not warn when all bundle keys are known", () => {
    const html = `
      <meta name="huozi:bundle" content="mermaid,echarts">
    `;
    const issue = validateHuoziHtml(html).find(
      (i) => i.code === "bundle-unknown-key",
    );
    expect(issue).toBeUndefined();
  });

  it("warns on external <script src='http(s)://...'>", () => {
    const html = `
      <meta name="huozi:format" content="web">
      <script src="https://cdn.jsdelivr.net/npm/mermaid"></script>
    `;
    const issue = validateHuoziHtml(html).find(
      (i) => i.code === "external-script-blocked",
    );
    expect(issue?.level).toBe("warning");
  });

  it("ignores <section data-page> inside HTML comments", () => {
    const html = `
      <meta name="huozi:format" content="deck">
      <!-- example: <section data-page id="x">ignored</section> -->
      <section data-page id="real">real</section>
    `;
    // No paginated-no-pages error (real section exists), no duplicate-id error
    // (commented one isn't counted).
    const codes = validateHuoziHtml(html).map((i) => i.code);
    expect(codes).not.toContain("paginated-no-pages");
    expect(codes).not.toContain("page-id-duplicate");
  });

  it("summarize counts by level", () => {
    const issues = validateHuoziHtml(`
      <meta name="huozi:format" content="widget">
      <meta name="huozi:bundle" content="ehcarts">
    `);
    const s = summarize(issues);
    expect(s.error).toBeGreaterThanOrEqual(1);
    expect(s.warning).toBeGreaterThanOrEqual(1);
    expect(s.total).toBe(s.error + s.warning + s.hint);
  });
});
