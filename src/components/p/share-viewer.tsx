"use client";

/**
 * Client-side controller for the `/p/<slug>` page.
 *
 * Routes the share content to the right renderer:
 *   - Prose (md/html): uses the server-prerendered HTML string.
 *   - CSV/TSV: mounts the interactive CsvGrid.
 *   - Everything else: source block.
 *
 * For passcoded shares we unlock on the client and then apply the same
 * routing to the freshly-fetched text.
 */

import { useState } from "react";
import { PasscodeForm } from "./passcode-form";
import { CsvGrid } from "@/components/csv-grid";
import { PageOutlineMenu } from "@/components/workspace/page-outline-menu";
import type { PageEntry } from "@/lib/html/extract-pages";
import type { ShareContent } from "@/lib/drive/shares";

interface ShareViewerProps {
  slug: string;
  filePath: string;
  locked: boolean;
  /** Pre-rendered HTML for the content area when already unlocked at SSR. */
  prerenderedHtml?: string;
  /** Raw text (for Source toggle + client-side renderers like CSV). */
  rawText?: string;
  mimeType?: string;
  /** Outline entries extracted from the raw HTML (paginated formats). */
  pages?: PageEntry[];
  /** Singular noun shown in the outline label. "page" / "slide" / "sheet". */
  pageUnit?: "page" | "slide" | "sheet";
}

type Kind = "csv" | "tsv" | "prose" | "source";

function kindFor(filePath: string, hasPrerendered: boolean): Kind {
  const i = filePath.lastIndexOf(".");
  const ext = i < 0 ? "" : filePath.slice(i + 1).toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "tsv") return "tsv";
  if (hasPrerendered) return "prose";
  return "source";
}

export function ShareViewer(props: ShareViewerProps) {
  const [unlocked, setUnlocked] = useState<ShareContent | null>(null);
  const [showSource, setShowSource] = useState(false);

  if (props.locked && !unlocked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <PasscodeForm slug={props.slug} onUnlocked={setUnlocked} />
      </div>
    );
  }

  // After client-side unlock we only have raw text — route by extension.
  if (unlocked) {
    const filePath = unlocked.file_path;
    const text = unlocked.text ?? "";
    const kind = kindFor(filePath, false);
    return (
      <>
        <div className="mb-4 text-xs text-muted-foreground font-mono truncate">
          {filePath} · <span className="opacity-70">{unlocked.mime_type}</span>
        </div>
        {kind === "csv" || kind === "tsv" ? (
          <CsvGrid content={text} delim={kind === "tsv" ? "\t" : ","} />
        ) : (
          <SourceBlock content={text || "(binary)"} />
        )}
        {kind !== "csv" && kind !== "tsv" && (
          <div className="mt-4 text-xs text-muted-foreground">
            Passcoded prose shares display as source. Ask the owner for a public
            link if you want the rendered view.
          </div>
        )}
      </>
    );
  }

  const kind = kindFor(props.filePath, Boolean(props.prerenderedHtml));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2 text-xs">
        <div className="text-muted-foreground font-mono truncate min-w-0 flex-1">
          {props.filePath}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {props.pages && props.pages.length > 1 && (
            <PageOutlineMenu
              pages={props.pages}
              unit={props.pageUnit ?? "page"}
            />
          )}
          {props.rawText && kind !== "source" && (
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              className="rounded border border-border px-2 py-1 h-8 hover:border-foreground/40"
            >
              {showSource ? "Rendered" : "Source"}
            </button>
          )}
        </div>
      </div>
      {showSource && props.rawText ? (
        <SourceBlock content={props.rawText} />
      ) : kind === "csv" || kind === "tsv" ? (
        props.rawText ? (
          <CsvGrid
            content={props.rawText}
            delim={kind === "tsv" ? "\t" : ","}
          />
        ) : (
          <EmptyHint />
        )
      ) : kind === "prose" && props.prerenderedHtml ? (
        <article
          className="prose prose-sm sm:prose-base max-w-none break-words"
          dangerouslySetInnerHTML={{ __html: props.prerenderedHtml }}
        />
      ) : props.rawText ? (
        <SourceBlock content={props.rawText} />
      ) : (
        <EmptyHint />
      )}
    </>
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
