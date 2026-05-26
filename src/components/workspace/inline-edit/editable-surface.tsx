"use client";

/**
 * Wraps a rendered file in a context that lets descendant renderers (and
 * the built-in selection-listener for byte-range types) request an inline
 * edit. Owns the popover + modal mount.
 *
 * Two activation paths:
 *
 *   1. **Selection-driven** (md / html) — the user selects text inside an
 *      element with `data-obj-src="<start>,<end>"`. The hook
 *      `useObjectSelection` surfaces the current selection; we render a
 *      floating "Edit" pill near it.
 *
 *   2. **Renderer-driven** (csv / jsonl) — CsvGrid / CollectionView call
 *      `useEditableSurface().requestEdit({...})` directly from a click
 *      handler (no DOM selection involved). The modal opens centered.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/context";
import type {
  EditRequest,
  EditableSurfaceContextValue,
  ObjectKind,
} from "./types";
import { useObjectSelection } from "./use-object-selection";
import { EditModal } from "./edit-modal";
import { findHtmlInnerRange } from "./anchor";
import { buildHighlightPayload, captureHighlight } from "./highlight-capture";
import { notifyError, notifyInfo } from "./notify";
import { runOptimistic } from "@/lib/optimistic/run-optimistic";
import { addPendingMark } from "@/components/workspace/highlights/pending-marks";

const Ctx = createContext<EditableSurfaceContextValue | null>(null);

/**
 * Hook for descendant renderers to dispatch an explicit edit request
 * (CsvGrid cell, CollectionView field, …).
 *
 * Returns `null` if no surface is mounted (e.g. the public `/p/<slug>`
 * viewer never wraps with EditableSurface — renderers must check before
 * showing edit affordances).
 */
export function useEditableSurface(): EditableSurfaceContextValue | null {
  return useContext(Ctx);
}

export interface EditableSurfaceProps {
  filePath: string;
  /** Tells the surface which type's selection model is active. */
  fileKind: ObjectKind | "none";
  /** Original file source. Required for byte-range types (md/html/csv)
   *  so the client can slice out an object's source bytes for old_string
   *  without a separate network fetch. Skipped for jsonl (the line text
   *  travels via the locator). */
  sourceContent?: string;
  /** blob_sha the page already observed during SSR. Threaded into the
   *  EditModal's save POST as `parent_blob_sha` so the BFF can skip the
   *  Read-first round-trip. `null` = unknown (modal falls back to the
   *  slower Read-first path). */
  parentBlobSha?: string | null;
  /** Set to false to render the surface as a no-op pass-through (used
   *  when the user lacks write capability). */
  canEdit?: boolean;
  /** Override the wrapper div's classes. Defaults to `"relative"`. Use
   *  e.g. `"relative flex flex-col flex-1 min-h-0"` so children inheriting
   *  a flex chain (collection-view's email-style 3-pane) keep their
   *  vertical fill all the way down. */
  wrapperClassName?: string;
  children: ReactNode;
}

export function EditableSurface({
  filePath,
  fileKind,
  sourceContent,
  parentBlobSha = null,
  canEdit = true,
  wrapperClassName = "relative",
  children,
}: EditableSurfaceProps) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);

  const [request, setRequest] = useState<EditRequest | null>(null);

  const requestEdit = useCallback((req: EditRequest) => {
    setRequest(req);
  }, []);

  const ctxValue = useMemo<EditableSurfaceContextValue>(
    () => ({ requestEdit, canEdit }),
    [requestEdit, canEdit],
  );

  // Selection-driven path: enabled for md/html (byte-range markers) and
  // jsonl (structural markers); disabled for csv (canvas grid). Suppress
  // while a modal is open — no point tracking selection from inside it.
  const selectionEnabled =
    canEdit &&
    (fileKind === "md-block" ||
      fileKind === "html-element" ||
      fileKind === "jsonl-field") &&
    request === null;
  const sel = useObjectSelection(hostRef, selectionEnabled);

  function onPopoverClick() {
    if (!sel) return;
    // The user's selection inside a [data-obj-src] element tells us
    // *which* default object they want to edit. The selection's exact
    // bytes don't matter beyond that — the modal always opens at object
    // granularity. See docs/inline-edit.md §3.
    if (sel.kind === "jsonl-field") {
      // Structural marker — recover the line bytes from the inlined
      // data-source. The CollectionView parser strips an optional BOM,
      // so we mirror that here to keep line text byte-identical with
      // what `huozi_edit` will see as old_string.
      const source = hostRef.current?.getAttribute("data-source") ?? "";
      const stripped =
        source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
      const lines = stripped.split(/\r?\n/);
      const lineText = lines[sel.lineNumber - 1];
      if (lineText === undefined) return;
      let lineRaw: Record<string, unknown>;
      try {
        const parsed = JSON.parse(lineText) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return;
        }
        lineRaw = parsed as Record<string, unknown>;
      } catch {
        return;
      }
      const value = lineRaw[sel.fieldKey];
      // V1 only edits string fields — CollectionView only marks string
      // values with data-obj-src, but defend against drift.
      if (typeof value !== "string") return;
      setRequest({
        objectKind: "jsonl-field",
        initialText: value,
        locator: {
          kind: "jsonl-field",
          lineNumber: sel.lineNumber,
          lineText,
          lineRaw,
          fieldKey: sel.fieldKey,
        },
        anchorRect: sel.rect,
      });
      return;
    }

    // Byte-range markers (md / html). Markdown shows source bytes
    // verbatim (`**bold**`, `[text](url)`); HTML scopes to inner-tag
    // content via findHtmlInnerRange so users can't accidentally delete
    // a tag's open/close. Anchor expansion at save time pins the edit
    // even when the inner slice is non-unique.
    const objectStart = sel.objectStart;
    const objectEnd = sel.objectEnd;
    const objectSrc = readSlice(hostRef.current, objectStart, objectEnd);

    let kind: ObjectKind;
    let editableStart: number;
    let editableEnd: number;
    if (fileKind === "html-element") {
      kind = "html-element";
      const inner = findHtmlInnerRange(objectSrc);
      if (inner) {
        editableStart = objectStart + inner.innerStart;
        editableEnd = objectStart + inner.innerEnd;
      } else {
        // Void element / parse fail — fall back to whole-element edit.
        editableStart = objectStart;
        editableEnd = objectEnd;
      }
    } else {
      kind = "md-block";
      editableStart = objectStart;
      editableEnd = objectEnd;
      // Strip markdown structural prefix when the resolved object is a
      // block whose source includes markup syntax — list items start
      // with `- ` / `* ` / `1. `, headings with `# ` … `###### `. These
      // bytes belong to the renderer, not the content; users editing
      // the body shouldn't see them in the modal. Mirror what
      // findHtmlInnerRange does for HTML.
      const head = readSlice(
        hostRef.current,
        editableStart,
        Math.min(editableStart + 8, editableEnd),
      );
      const stripped = stripMdBlockPrefix(sel.objTagName, head);
      if (stripped > 0) editableStart += stripped;
    }

    // Sub-object narrowing: if the user's selection lives inside a
    // single text node and its plain text appears exactly once in the
    // editable scope, modal opens with just those bytes. Selections
    // that cross any element boundary (entering/leaving inline tags,
    // entities, the like) keep the whole-object behavior — substring
    // search will fail or be ambiguous and we degrade safely.
    // See docs/inline-edit.md §3.1.
    const narrowed = tryNarrowToSelection(
      hostRef.current,
      editableStart,
      editableEnd,
      sel.selectionText,
      sel.isWholeObject,
    );
    if (narrowed) {
      editableStart = narrowed.start;
      editableEnd = narrowed.end;
    }

    const initialText = readSlice(hostRef.current, editableStart, editableEnd);
    setRequest({
      objectKind: kind,
      initialText,
      locator: {
        kind: "bytes",
        start: editableStart,
        end: editableEnd,
      },
      anchorRect: sel.rect,
    });
  }

  function onClipClick() {
    if (!sel) return;
    const host = hostRef.current;
    if (!host) return;
    if (
      fileKind !== "md-block" &&
      fileKind !== "html-element" &&
      fileKind !== "jsonl-field"
    ) {
      return;
    }
    // Capture WHILE the live selection still exists — captureHighlight's
    // narrowing path reads `window.getSelection()`, and the optimistic
    // `applyLocal` below clears the selection so the toolbar dismisses.
    const captured = captureHighlight(host, sel, fileKind);
    if (!captured) {
      notifyError(t("highlights.clip.error"));
      return;
    }
    const liveSel = window.getSelection();
    const pendingRange = liveSel && liveSel.rangeCount > 0
      ? liveSel.getRangeAt(0).cloneRange()
      : null;
    const payload = buildHighlightPayload(captured);

    runOptimistic(
      {
        applyLocal: () => {
          // Pending dotted underline drawn via the CSS Custom Highlight
          // API (huozi-hl-pending registry — same accent dotted style as
          // confirmed clips, reduced opacity). Clear the live selection
          // so the toolbar dismisses and the mark reads as the new
          // visual state.
          const revert = pendingRange ? addPendingMark([pendingRange]) : null;
          window.getSelection()?.removeAllRanges();
          notifyInfo(t("highlights.clip.saved"));
          return revert;
        },
        commit: async () => {
          const res = await fetch("/api/app/drive/highlights", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source_path: filePath,
              source_blob_sha: parentBlobSha,
              highlight: payload,
            }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              message?: string;
            };
            return {
              ok: false,
              message: data.message ?? t("highlights.clip.error"),
            };
          }
          return { ok: true };
        },
        onCommitted: (_data, cleanup) => {
          // Tell the layer + drawer to refresh. Detail carries the source
          // path so multi-pane layouts can ignore events for other files.
          window.dispatchEvent(
            new CustomEvent("huozi:highlights-changed", {
              detail: { sourcePath: filePath },
            }),
          );
          // Clear the pending mark once the confirmed layer has had time
          // to repaint from the new clippings.jsonl state. A short delay
          // lets the layer's GET + resolveRange run, so the dotted line
          // never blinks off between pending-removed and confirmed-drawn.
          window.setTimeout(cleanup, 800);
        },
        onError: (msg) => notifyError(msg),
      },
      undefined,
    );
  }

  return (
    <Ctx.Provider value={ctxValue}>
      <div
        ref={hostRef}
        className={wrapperClassName}
        {...(sourceContent !== undefined ? { "data-source": sourceContent } : {})}
      >
        {children}
        {selectionEnabled && sel && request === null && (
          <SelectionToolbar
            rect={sel.rect}
            actions={[
              {
                kind: "edit",
                label: t("editor.inline.button"),
                onClick: onPopoverClick,
              },
              {
                kind: "clip",
                label: t("highlights.clip.button"),
                onClick: () => {
                  void onClipClick();
                },
              },
            ]}
          />
        )}
        {request && (
          <EditModal
            filePath={filePath}
            objectKind={request.objectKind}
            initialText={request.initialText}
            locator={request.locator}
            parentBlobSha={parentBlobSha}
            onClose={() => setRequest(null)}
          />
        )}
      </div>
    </Ctx.Provider>
  );
}

/**
 * For a markdown block element, return how many leading bytes are
 * structural markup (the part NOT in the rendered text). The caller
 * advances `editableStart` by this many bytes to keep the markup out
 * of the modal.
 *
 * Currently handles:
 *   - `<li>`: leading `- ` / `* ` / `+ ` / `1. ` / `12. ` …
 *   - `<h1>` … `<h6>`: leading `#` … `######` plus its space
 *
 * Other blocks (`<p>`, `<td>`, `<th>`, `<blockquote>`, `<pre>`) either
 * have no inline-level prefix in source (paragraph, cells) or need
 * line-by-line treatment we haven't tackled yet (blockquote `> `, pre
 * fences). Falling through is safe — the modal still works, it just
 * shows the whole block including markup.
 */
function stripMdBlockPrefix(tagName: string, head: string): number {
  if (tagName === "li") {
    const m = head.match(/^([-*+]|\d+\.)[ \t]+/);
    return m ? m[0].length : 0;
  }
  if (/^h[1-6]$/.test(tagName)) {
    const m = head.match(/^#{1,6}[ \t]+/);
    return m ? m[0].length : 0;
  }
  return 0;
}

/** Read the source slice for the object out of a hidden data attribute on
 *  the host. The FileRenderer wrapper inlines the original file content
 *  (server-rendered) into a `data-source` attribute so the client can do
 *  byte-range slicing without a separate fetch. */
function readSlice(
  host: HTMLElement | null,
  start: number,
  end: number,
): string {
  if (!host) return "";
  const src = host.getAttribute("data-source");
  if (src === null) return "";
  return src.slice(start, end);
}

/**
 * Try to narrow [editableStart, editableEnd) to just the bytes the user
 * actually selected. Returns null when narrowing isn't safe — caller
 * keeps the whole-object scope.
 *
 * Safety rules:
 *   1. Selection must live in a single text node — i.e. it doesn't
 *      cross any element boundary. If commonAncestor is an Element,
 *      the selection straddled markup (an inline tag, an entity widget,
 *      a `<br>`) and we MUST keep the whole object so the user sees
 *      what's around the splice.
 *   2. Selection text must appear exactly once in the editable source.
 *      Multiple matches would mean we can't tell which one to edit.
 *   3. Selection text must be the user's *plain* selection (the
 *      `isWholeObject` shortcut from the hook means triple-click; in
 *      that case the user wants the whole object, not a narrowed slice).
 *
 * When all three pass, this returns the new tighter byte range. The
 * caller then uses just those bytes as both the modal's initial text
 * and the locator — the rest of the object stays untouched on save.
 */
function tryNarrowToSelection(
  host: HTMLElement | null,
  editableStart: number,
  editableEnd: number,
  selectionText: string,
  isWholeObject: boolean,
): { start: number; end: number } | null {
  if (!host) return null;
  if (isWholeObject) return null;
  const text = selectionText;
  if (text.length === 0) return null;

  // Rule 1 — single text node.
  const range = window.getSelection()?.rangeCount
    ? window.getSelection()!.getRangeAt(0)
    : null;
  if (!range) return null;
  if (range.commonAncestorContainer.nodeType !== Node.TEXT_NODE) return null;

  // Rule 2 — unique within editable scope.
  const src = host.getAttribute("data-source");
  if (src === null) return null;
  const editableSrc = src.slice(editableStart, editableEnd);
  const first = editableSrc.indexOf(text);
  if (first === -1) return null;
  if (editableSrc.indexOf(text, first + 1) !== -1) return null;

  return {
    start: editableStart + first,
    end: editableStart + first + text.length,
  };
}

interface SelectionToolbarProps {
  rect: { top: number; left: number; width: number; height: number };
  actions: Array<{
    /** `kind` lets the theme layer style edit vs. clip differently if
     *  desired (data attribute on the button). */
    kind: "edit" | "clip";
    label: string;
    onClick(): void;
  }>;
}

function SelectionToolbar({ rect, actions }: SelectionToolbarProps) {
  // Position the pill row just above-right of the selection box. Use
  // `position: fixed` so the rect (viewport-relative) lines up without
  // recomputing on scroll — the parent hook re-fires on scroll to
  // update the rect.
  //
  // The `huozi-edit-pill` class is the stable hook the theme layer uses
  // to override appearance per theme (brutal-mono renders this as a
  // stamped black-on-yellow pill — see globals.css). Don't drop the class
  // without also updating that file.
  const top = Math.max(8, rect.top - 32);
  const left = rect.left + rect.width;
  return (
    <div
      className="fixed z-[60] flex gap-1"
      style={{ top, left }}
      onMouseDown={(e) => {
        // Don't let clicks inside the toolbar clear the selection before
        // any handler runs.
        e.preventDefault();
      }}
    >
      {actions.map((a) => (
        <button
          key={a.kind}
          type="button"
          data-action={a.kind}
          onClick={a.onClick}
          className="huozi-edit-pill px-2.5 py-1 text-xs font-medium rounded shadow-md bg-foreground text-background hover:opacity-85 border border-border/40"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
