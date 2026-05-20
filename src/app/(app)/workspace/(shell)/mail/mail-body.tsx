"use client";

/**
 * Plain-text email body renderer.
 *
 * Targets the formatting noise Gmail-style plain-text rendering produces
 * when forwarding HTML mail. Three passes:
 *
 *   1. `blockify` walks the raw body line-by-line and splits it into
 *      paragraph / separator / forwarded-header blocks. Forwarded headers
 *      get parsed into structured fields so they render as a metadata
 *      card instead of a wall of text.
 *   2. Separator lines (`----...----` etc.) collapse to a styled <hr>.
 *   3. Inside paragraphs, `linkify` finds `<https://...>` (angle-bracketed,
 *      the canonical Gmail plain-text link form) and bare `https://...`
 *      URLs, renders them as clickable links with a shortened label
 *      (hostname + first/last path segment), and strips trailing
 *      sentence-terminator punctuation from bare URLs so periods/commas
 *      stay in the surrounding text.
 *
 * Deliberately not a markdown parser — too much false-positive risk on
 * stylistically idiosyncratic newsletter text. If the renderer can't
 * confidently improve a chunk, it stays as-is via `whitespace-pre-wrap`.
 */

import { Fragment, type ReactNode, useMemo } from "react";
import { ImageIcon } from "lucide-react";

// Combined inline pattern: image placeholder (optionally linked) | angle-URL | bare URL.
// Group 1 = image alt, group 2 = image's optional URL, group 3 = angle-URL, group 4 = bare URL.
// Image first so `[image: X] <url>` isn't split into two separate matches.
const INLINE_RE =
  /\[image:\s*([^\]]+)\](?:\s*<(https?:\/\/[^>\s]+)>)?|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>"'`)\]}]+)/g;
const SEPARATOR_RE = /^[-—=*_]{8,}$/;
const FWD_HEADER_RE = /^-{2,}\s*Forwarded message\s*-{2,}$/i;
const HEADER_LINE_RE = /^(From|Date|Subject|To|Cc|Reply-To|Sent):\s*(.*)$/;

interface ForwardedHeaderBlock {
  kind: "fwd";
  fields: Array<{ label: string; value: string }>;
}
interface SeparatorBlock {
  kind: "sep";
}
interface ParagraphBlock {
  kind: "p";
  text: string;
}
type Block = ForwardedHeaderBlock | SeparatorBlock | ParagraphBlock;

function blockify(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (FWD_HEADER_RE.test(trimmed)) {
      i++;
      const fields: Array<{ label: string; value: string }> = [];
      // RFC 5322 folded headers: a line starting with whitespace
      // continues the previous header's value.
      while (i < lines.length && fields.length < 8) {
        const m = lines[i].match(HEADER_LINE_RE);
        if (!m) {
          // Allow continuation of last header value
          if (
            fields.length > 0 &&
            /^\s/.test(lines[i]) &&
            lines[i].trim() !== ""
          ) {
            fields[fields.length - 1].value += " " + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        fields.push({ label: m[1], value: m[2].trim() });
        i++;
      }
      blocks.push({ kind: "fwd", fields });
      continue;
    }

    if (SEPARATOR_RE.test(trimmed)) {
      blocks.push({ kind: "sep" });
      i++;
      continue;
    }

    if (trimmed === "") {
      i++;
      continue;
    }

    // Collect paragraph (run of non-blank, non-separator, non-fwd lines).
    const buf: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      const t = cur.trim();
      if (t === "") break;
      if (FWD_HEADER_RE.test(t)) break;
      if (SEPARATOR_RE.test(t)) break;
      buf.push(cur);
      i++;
    }
    if (buf.length > 0) blocks.push({ kind: "p", text: buf.join("\n") });
  }

  return blocks;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    if (!path) return host;
    const segs = path.split("/").filter(Boolean);
    if (segs.length === 0) return host;
    const last = segs[segs.length - 1];
    if (last.length <= 32) return `${host}${path}`;
    return `${host}/…`;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + "…" : url;
  }
}

function ImageChip({ alt, url }: { alt: string; url?: string }) {
  const chip = (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-[12px] text-muted-foreground align-baseline">
      <ImageIcon className="size-3" aria-hidden="true" />
      <span>{alt}</span>
    </span>
  );
  if (!url) return chip;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      className="hover:opacity-80"
    >
      {chip}
    </a>
  );
}

function linkify(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let k = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    const before = text.slice(cursor, m.index);
    if (before) nodes.push(<Fragment key={`${keyPrefix}-t${k++}`}>{before}</Fragment>);

    if (m[1] !== undefined) {
      // [image: ALT] (optionally followed by <url>)
      nodes.push(
        <ImageChip
          key={`${keyPrefix}-img${k++}`}
          alt={m[1].trim()}
          url={m[2]}
        />,
      );
    } else if (m[3] !== undefined) {
      // <https://...> — already delimited, no trailing-punctuation cleanup needed
      const url = m[3];
      nodes.push(
        <a
          key={`${keyPrefix}-l${k++}`}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={url}
          className="text-[var(--primary)] underline underline-offset-2 hover:opacity-80 break-all"
        >
          {shortenUrl(url)}
        </a>,
      );
    } else if (m[4] !== undefined) {
      // Bare https://... — strip trailing sentence punctuation, emit as tail text
      let url = m[4];
      let tail = "";
      const t = url.match(/[.,;:!?)\]]+$/);
      if (t) {
        tail = t[0];
        url = url.slice(0, -tail.length);
      }
      nodes.push(
        <a
          key={`${keyPrefix}-l${k++}`}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={url}
          className="text-[var(--primary)] underline underline-offset-2 hover:opacity-80 break-all"
        >
          {shortenUrl(url)}
        </a>,
      );
      if (tail) nodes.push(<Fragment key={`${keyPrefix}-tt${k++}`}>{tail}</Fragment>);
    }

    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t${k++}`}>{text.slice(cursor)}</Fragment>);
  }
  return nodes;
}

export function EmailBody({ raw }: { raw: string }) {
  const blocks = useMemo(() => blockify(raw), [raw]);
  if (blocks.length === 0) {
    return <div className="text-sm text-muted-foreground italic">(empty body)</div>;
  }
  return (
    <div className="text-[14px] leading-relaxed text-foreground space-y-3">
      {blocks.map((b, idx) => {
        if (b.kind === "sep") {
          return <hr key={idx} className="border-border/40 my-2" />;
        }
        if (b.kind === "fwd") {
          return (
            <div
              key={idx}
              className="rounded border border-border/60 bg-muted/30 px-3 py-2 text-[12px]"
            >
              <div className="text-muted-foreground font-semibold mb-1.5 text-[11px] uppercase tracking-wider">
                Forwarded message
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {b.fields.map((f, fi) => (
                  <Fragment key={fi}>
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="text-foreground/90 break-words">{f.value}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-wrap break-words">
            {linkify(b.text, `p${idx}`)}
          </p>
        );
      })}
    </div>
  );
}
