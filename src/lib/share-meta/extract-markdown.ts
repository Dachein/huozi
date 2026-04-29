/**
 * Tiny YAML frontmatter parser for the publish surface.
 *
 * Supports the subset agents actually emit:
 *   - `key: value` scalars (string / number / boolean / null)
 *   - quoted strings: 'single' or "double"
 *   - inline arrays: `tags: [a, b, c]`
 *   - block arrays:
 *       tags:
 *         - a
 *         - b
 *
 * Anything more exotic (anchors, multi-line scalars, nested maps) is ignored —
 * the share surface only needs flat metadata fields, so we keep this dependency-
 * free instead of pulling gray-matter / js-yaml into the edge bundle.
 *
 * Frontmatter delimiter is `---` on its own line. Optional BOM is tolerated.
 * If no frontmatter is present, returns the input as `content` and empty `data`.
 *
 * The first H1 of the body is exposed as `firstHeading` so the metadata layer
 * can fall back to it when no explicit title is set.
 */

export type Frontmatter = Record<
  string,
  string | number | boolean | null | string[]
>;

export interface ParsedMarkdown {
  data: Frontmatter;
  content: string;
  firstHeading?: string;
}

const DELIM = /^-{3,}\s*$/;
const H1_RE = /^#\s+(.+?)\s*$/m;
const SETEXT_H1_RE = /^(.+)\n=+\s*$/m;

function parseScalar(raw: string): string | number | boolean | null {
  const v = raw.trim();
  if (v === "" || v === "~" || v.toLowerCase() === "null") return null;
  if (v.toLowerCase() === "true") return true;
  if (v.toLowerCase() === "false") return false;
  // Quoted string — strip outer quotes and unescape minimally.
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    const inner = v.slice(1, -1);
    return v[0] === '"' ? inner.replace(/\\"/g, '"') : inner.replace(/''/g, "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().slice(1, -1);
  if (!inner.trim()) return [];
  return inner
    .split(",")
    .map((p) => {
      const v = parseScalar(p);
      return v == null ? "" : String(v);
    })
    .filter(Boolean);
}

export function parseMarkdown(input: string): ParsedMarkdown {
  const text = input.replace(/^\uFEFF/, "");
  const lines = text.split("\n");

  // Frontmatter must start on the very first line.
  if (!lines.length || !DELIM.test(lines[0])) {
    return { data: {}, content: text, firstHeading: findFirstHeading(text) };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (DELIM.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { data: {}, content: text, firstHeading: findFirstHeading(text) };
  }

  const data = parseBlock(lines.slice(1, endIdx));
  const content = lines.slice(endIdx + 1).join("\n").replace(/^\n+/, "");
  return { data, content, firstHeading: findFirstHeading(content) };
}

function parseBlock(blockLines: string[]): Frontmatter {
  const data: Frontmatter = {};
  let i = 0;
  while (i < blockLines.length) {
    const line = blockLines[i];
    // Skip blanks and comments.
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z_][\w.-]*)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];

    if (rest.trim() === "") {
      // Could be a block array on the next lines.
      const items: string[] = [];
      let j = i + 1;
      while (j < blockLines.length) {
        const next = blockLines[j];
        const itemMatch = next.match(/^\s*-\s+(.*)$/);
        if (!itemMatch) break;
        const v = parseScalar(itemMatch[1]);
        if (v != null) items.push(String(v));
        j++;
      }
      if (items.length) {
        data[key] = items;
        i = j;
        continue;
      }
      data[key] = null;
      i++;
      continue;
    }

    if (rest.trim().startsWith("[") && rest.trim().endsWith("]")) {
      data[key] = parseInlineArray(rest);
      i++;
      continue;
    }

    data[key] = parseScalar(rest);
    i++;
  }
  return data;
}

function findFirstHeading(body: string): string | undefined {
  const atx = body.match(H1_RE);
  if (atx) return atx[1].trim() || undefined;
  const setext = body.match(SETEXT_H1_RE);
  if (setext) return setext[1].trim() || undefined;
  return undefined;
}
