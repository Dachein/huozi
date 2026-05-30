/**
 * Single-pass HTML metadata extraction.
 *
 * Both `view/page.tsx` (workspace) and `<FileRenderer>` need the same
 * four pieces — format / pages / tabs / refreshMs — to drive their
 * respective chrome. Until now each layer ran its own scan, so the
 * same HTML string was regex-walked 4-8 times per page render.
 *
 * Callers compute this ONCE at the top of the SSR tree and thread
 * `HtmlMeta` down. Server-to-server prop passing is a cheap reference
 * copy — no serialization cost, no RSC payload bloat.
 */

import { detectHuoziFormat, type HuoziFormat } from "./detect-format";
import { extractPages, type PageEntry } from "./extract-pages";
import {
  extractTabs,
  extractRefreshMs,
  type TabEntry,
} from "./extract-tabs";

export interface HtmlMeta {
  format: HuoziFormat;
  pages: PageEntry[];
  tabs: TabEntry[];
  refreshMs: number | null;
}

export function computeHtmlMeta(content: string): HtmlMeta {
  const format = detectHuoziFormat(content);
  const pages = extractPages(content);
  // Tabs / refresh only apply to dashboards — skip the scans for the
  // 4 other formats so this stays free for the common case.
  const tabs = format === "dashboard" ? extractTabs(content) : [];
  const refreshMs =
    format === "dashboard" ? extractRefreshMs(content) : null;
  return { format, pages, tabs, refreshMs };
}

export const EMPTY_HTML_META: HtmlMeta = {
  format: "blog",
  pages: [],
  tabs: [],
  refreshMs: null,
};
