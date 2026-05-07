import { describe, expect, it } from "vitest";
import { injectSourcePositions } from "../source-pos";

/**
 * The injector adds `data-obj-src="<start>,<end>"` to every open tag.
 * Offsets must reference the **original** input bytes — when the client
 * reads `attr.split(",")` and slices into the unmodified source, it
 * should get back exactly the element's bytes.
 */

function parseAttr(value: string): [number, number] | null {
  const m = value.match(/^(\d+),(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function extractFirstSrc(html: string, tagName: string): [number, number] | null {
  // Locate the first `<tagName` ... `>` and pull the data-obj-src out of
  // its attribute soup. Don't try to match `[^>]*` — attribute values
  // can themselves contain `>`.
  const tagStart = html.search(new RegExp(`<${tagName}\\b`, "i"));
  if (tagStart < 0) return null;
  // Walk to the closing `>` honoring quotes.
  let i = tagStart + tagName.length + 1;
  let inS = false;
  let inD = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inS) {
      if (c === "'") inS = false;
    } else if (inD) {
      if (c === '"') inD = false;
    } else {
      if (c === "'") inS = true;
      else if (c === '"') inD = true;
      else if (c === ">") break;
    }
  }
  const tag = html.slice(tagStart, i + 1);
  const m = tag.match(/data-obj-src="(\d+,\d+)"/);
  return m ? parseAttr(m[1]!) : null;
}

describe("injectSourcePositions", () => {
  it("attaches a span covering paired open/close tags", () => {
    const input = "<p>hi</p>";
    const out = injectSourcePositions(input);
    const span = extractFirstSrc(out, "p");
    expect(span).not.toBeNull();
    const [start, end] = span!;
    expect(input.slice(start, end)).toBe("<p>hi</p>");
  });

  it("attaches a span covering only the open tag for void elements", () => {
    const input = "before<br>after";
    const out = injectSourcePositions(input);
    const span = extractFirstSrc(out, "br");
    expect(span).not.toBeNull();
    const [start, end] = span!;
    expect(input.slice(start, end)).toBe("<br>");
  });

  it("handles nested elements — inner span is contained in outer", () => {
    const input = "<div><p>x</p></div>";
    const out = injectSourcePositions(input);
    const div = extractFirstSrc(out, "div")!;
    const p = extractFirstSrc(out, "p")!;
    expect(input.slice(div[0], div[1])).toBe("<div><p>x</p></div>");
    expect(input.slice(p[0], p[1])).toBe("<p>x</p>");
    expect(p[0]).toBeGreaterThan(div[0]);
    expect(p[1]).toBeLessThan(div[1]);
  });

  it("does not treat `<` inside <script> body as a tag", () => {
    const input = "<script>if (a < b) { }</script><p>hi</p>";
    const out = injectSourcePositions(input);
    // The <p> after the script must still be tagged correctly.
    const p = extractFirstSrc(out, "p")!;
    expect(input.slice(p[0], p[1])).toBe("<p>hi</p>");
  });

  it("preserves attribute values with `>` inside quotes", () => {
    const input = '<a href="x?b>c">link</a>';
    const out = injectSourcePositions(input);
    const a = extractFirstSrc(out, "a")!;
    expect(input.slice(a[0], a[1])).toBe('<a href="x?b>c">link</a>');
  });

  it("ignores HTML comments", () => {
    const input = "<!-- <p>not a tag</p> --><p>real</p>";
    const out = injectSourcePositions(input);
    // Comment should pass through unchanged, no data-obj-src injected
    // anywhere inside it.
    expect(out).toContain("<!-- <p>not a tag</p> -->");
    // Exactly one data-obj-src attribute in the output (the real <p>).
    const matches = out.match(/data-obj-src="(\d+,\d+)"/g) ?? [];
    expect(matches.length).toBe(1);
    const m = matches[0]!.match(/data-obj-src="(\d+),(\d+)"/)!;
    const span: [number, number] = [Number(m[1]), Number(m[2])];
    expect(input.slice(span[0], span[1])).toBe("<p>real</p>");
  });

  it("does not inject when input has no tags", () => {
    const input = "plain text only";
    expect(injectSourcePositions(input)).toBe(input);
  });

  it("survives unclosed tags by emitting a span to end-of-input", () => {
    const input = "<div>oops";
    const out = injectSourcePositions(input);
    const div = extractFirstSrc(out, "div")!;
    expect(div[0]).toBe(0);
    expect(div[1]).toBe(input.length);
  });
});
