"use client";

/**
 * Client-side controller for the `/p/<slug>` page.
 *
 * Boots with the server-fetched share metadata. If the share is locked,
 * renders the passcode form; otherwise it forwards straight to the
 * rendered content (injected as `initialContent` when the server already
 * had the text — avoids a second round-trip on public shares).
 *
 * Content rendering itself is server-side (the caller passes a fully
 * rendered HTML string for text types). For passcoded shares we can't do
 * that at SSR time, so we render markdown/html on the client after unlock
 * using the same pipeline.
 */

import { useState } from "react";
import { PasscodeForm } from "./passcode-form";
import type { ShareContent } from "@/lib/drive/shares";

interface ShareViewerProps {
  slug: string;
  filePath: string;
  locked: boolean;
  /** Pre-rendered HTML for the content area when already unlocked at SSR. */
  prerenderedHtml?: string;
  /** Raw text (for Source toggle). */
  rawText?: string;
  mimeType?: string;
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

  // After client-side unlock, we only have raw text/binary. Client-side
  // rendering of markdown/html requires a library we aren't shipping to
  // the browser; for v1 we show source in a preformatted block for
  // passcoded shares. SSR'd public shares get the full prose rendering.
  if (unlocked) {
    return (
      <ShareContentView
        filePath={unlocked.file_path}
        text={unlocked.text ?? "(binary)"}
        mimeType={unlocked.mime_type}
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between text-xs">
        <div className="text-muted-foreground font-mono truncate max-w-[60%]">
          {props.filePath}
        </div>
        {props.rawText && (
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="rounded border border-border px-2 py-1 hover:border-foreground/40"
          >
            {showSource ? "Rendered" : "Source"}
          </button>
        )}
      </div>
      {showSource && props.rawText ? (
        <SourceBlock content={props.rawText} />
      ) : props.prerenderedHtml ? (
        <article
          className="prose prose-sm sm:prose-base max-w-none break-words"
          dangerouslySetInnerHTML={{ __html: props.prerenderedHtml }}
        />
      ) : (
        <div className="text-sm text-muted-foreground italic">
          (no content)
        </div>
      )}
    </>
  );
}

function ShareContentView({
  filePath,
  text,
  mimeType,
}: {
  filePath: string;
  text: string;
  mimeType: string;
}) {
  return (
    <div>
      <div className="mb-4 text-xs text-muted-foreground font-mono truncate">
        {filePath} · <span className="opacity-70">{mimeType}</span>
      </div>
      <SourceBlock content={text} />
      <div className="mt-4 text-xs text-muted-foreground">
        Passcoded shares display as source in this version. Ask the owner for
        a public link if you want the rendered view.
      </div>
    </div>
  );
}

function SourceBlock({ content }: { content: string }) {
  return (
    <pre className="rounded-lg border border-border bg-muted/40 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}
