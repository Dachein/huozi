"use client";

/**
 * Client-side controller for the `/p/<slug>` page.
 *
 * The publish surface IS the file — we render full-bleed in always-fullscreen
 * mode using the same FullscreenContent the workspace view uses, so the two
 * surfaces look identical. No top header, no file path strip, no Source
 * toggle: just the content + a single "Open in Huozi" button in the top-right
 * (and a pager when the doc is paginated).
 *
 * For passcoded shares we unlock on the client and then fall through to the
 * standard renderer with the freshly-fetched text.
 */

import { useState } from "react";
import { PasscodeForm } from "./passcode-form";
import { CsvGrid } from "@/components/csv-grid";
import { CollectionView } from "@/components/collection-view";
import {
  FullscreenContent,
  type FullscreenMode,
} from "@/components/workspace/fullscreen-content";
import type { PageEntry } from "@/lib/html/extract-pages";
import type { ShareContent } from "@/lib/drive/shares";

interface ShareViewerProps {
  slug: string;
  filePath: string;
  locked: boolean;
  /** Pre-rendered HTML for the content area when already unlocked at SSR. */
  prerenderedHtml?: string;
  /** Raw text — used for client-side renderers (CsvGrid) and source fallback. */
  rawText?: string;
  /** Outline entries extracted from the raw HTML (paginated formats). */
  pages?: PageEntry[];
  /** Singular noun shown in the outline label. "page" / "slide" / "sheet". */
  pageUnit?: "page" | "slide" | "sheet";
  /** Detected huozi layout (meta tag → class sniff → "web" fallback).
   *  Drives auto-landscape on mobile-portrait for deck via the
   *  [data-huozi-rotate-portrait] opt-in. */
  htmlFormat?: "web" | "mobile" | "deck" | "story" | "paper";
}

type Kind = "csv" | "tsv" | "jsonl" | "prose" | "source";

function kindFor(filePath: string, hasPrerendered: boolean): Kind {
  const i = filePath.lastIndexOf(".");
  const ext = i < 0 ? "" : filePath.slice(i + 1).toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "tsv") return "tsv";
  if (ext === "jsonl") return "jsonl";
  if (hasPrerendered) return "prose";
  return "source";
}

/** Pick the fullscreen content mode by file extension. Mirrors the workspace
 *  view-page logic so the published surface uses the same chrome. Defaults
 *  to "reader" for unknown extensions so source files still get a clean
 *  centered fullscreen rendering instead of unstyled bleed. */
function fullscreenModeFor(filePath: string): FullscreenMode {
  const i = filePath.lastIndexOf(".");
  const ext = i < 0 ? "" : filePath.slice(i + 1).toLowerCase();
  if (ext === "html" || ext === "htm") return "raw";
  if (ext === "csv" || ext === "tsv" || ext === "jsonl") return "grid";
  return "reader";
}

function OpenInHuoziLink({ filePath }: { filePath: string }) {
  const href = `/workspace/view?path=${encodeURIComponent(filePath)}`;
  return (
    <a
      href={href}
      title="Open in huozi workspace"
      aria-label="Open in huozi"
      className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-background/90 backdrop-blur text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <span className="font-serif text-sm leading-none text-accent">字</span>
      <span className="hidden sm:inline">Open in Huozi</span>
    </a>
  );
}

export function ShareViewer(props: ShareViewerProps) {
  const [unlocked, setUnlocked] = useState<ShareContent | null>(null);

  if (props.locked && !unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <PasscodeForm slug={props.slug} onUnlocked={setUnlocked} />
      </div>
    );
  }

  // After client-side unlock we only have raw text — route by extension into
  // the same source / csv / jsonl path. Prose stays as source here (server-
  // side sanitizer / chart pipeline isn't available client-side).
  if (unlocked) {
    const filePath = unlocked.file_path;
    const text = unlocked.text ?? "";
    const kind = kindFor(filePath, false);
    return (
      <FullscreenContent
        mode={fullscreenModeFor(filePath)}
        pages={[]}
        pageUnit="page"
        htmlFormat="web"
        alwaysOpen
        chrome={<OpenInHuoziLink filePath={filePath} />}
      >
        {kind === "csv" || kind === "tsv" ? (
          <CsvGrid content={text} delim={kind === "tsv" ? "\t" : ","} />
        ) : kind === "jsonl" ? (
          <CollectionView content={text} />
        ) : (
          <SourceBlock content={text || "(binary)"} />
        )}
      </FullscreenContent>
    );
  }

  const kind = kindFor(props.filePath, Boolean(props.prerenderedHtml));
  const fullscreenMode = fullscreenModeFor(props.filePath);

  return (
    <FullscreenContent
      mode={fullscreenMode}
      pages={props.pages ?? []}
      pageUnit={props.pageUnit ?? "page"}
      htmlFormat={props.htmlFormat ?? "web"}
      alwaysOpen
      chrome={<OpenInHuoziLink filePath={props.filePath} />}
    >
      {kind === "csv" || kind === "tsv" ? (
        props.rawText ? (
          <CsvGrid
            content={props.rawText}
            delim={kind === "tsv" ? "\t" : ","}
          />
        ) : (
          <EmptyHint />
        )
      ) : kind === "jsonl" ? (
        props.rawText ? (
          <CollectionView content={props.rawText} />
        ) : (
          <EmptyHint />
        )
      ) : kind === "prose" && props.prerenderedHtml ? (
        <article
          className="prose prose-sm sm:prose-base max-w-none break-words huozi-html-host"
          {...(props.htmlFormat === "deck"
            ? { "data-huozi-rotate-portrait": "" }
            : {})}
          dangerouslySetInnerHTML={{ __html: props.prerenderedHtml }}
        />
      ) : props.rawText ? (
        <SourceBlock content={props.rawText} />
      ) : (
        <EmptyHint />
      )}
    </FullscreenContent>
  );
}

function EmptyHint() {
  return (
    <div className="text-sm text-muted-foreground italic">(no content)</div>
  );
}

function SourceBlock({ content }: { content: string }) {
  return (
    <pre className="rounded-lg border border-border bg-muted/40 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}
