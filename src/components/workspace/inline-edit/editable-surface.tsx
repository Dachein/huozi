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
  ObjectLocator,
} from "./types";
import { useObjectSelection } from "./use-object-selection";
import { EditModal } from "./edit-modal";

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
  /** Set to false to render the surface as a no-op pass-through (used
   *  when the user lacks write capability). */
  canEdit?: boolean;
  children: ReactNode;
}

export function EditableSurface({
  filePath,
  fileKind,
  sourceContent,
  canEdit = true,
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

  // Selection-driven path: only enabled for md/html and only when we
  // don't already have a modal open (no point in tracking selection
  // inside a modal).
  const selectionEnabled =
    canEdit &&
    (fileKind === "md-block" || fileKind === "html-element") &&
    request === null;
  const sel = useObjectSelection(hostRef, selectionEnabled);

  function onPopoverClick() {
    if (!sel) return;
    // Build the EditRequest from the current selection.
    // For md/html we always edit the **whole object's source slice** —
    // the user's sub-selection is a hint about which block they care
    // about, not the unit of replacement. (Editing a 2-char selection
    // would frequently fall foul of huozi_edit's uniqueness check.)
    const objectKind: ObjectKind =
      fileKind === "md-block" ? "md-block" : "html-element";
    const locator: ObjectLocator = {
      kind: "bytes",
      start: sel.objectStart,
      end: sel.objectEnd,
    };
    // We need the source slice for `initialText`. The host already has
    // it via the FileRenderer's props — we read it from a data attr the
    // wrapper sets.
    const sourceSlice = readSlice(hostRef.current, sel.objectStart, sel.objectEnd);
    setRequest({
      objectKind,
      initialText: sourceSlice,
      locator,
      anchorRect: sel.rect,
    });
  }

  return (
    <Ctx.Provider value={ctxValue}>
      <div
        ref={hostRef}
        className="relative"
        {...(sourceContent !== undefined ? { "data-source": sourceContent } : {})}
      >
        {children}
        {selectionEnabled && sel && request === null && (
          <FloatingEditButton
            rect={sel.rect}
            label={t("editor.inline.button")}
            onClick={onPopoverClick}
          />
        )}
        {request && (
          <EditModal
            filePath={filePath}
            objectKind={request.objectKind}
            initialText={request.initialText}
            locator={request.locator}
            onClose={() => setRequest(null)}
          />
        )}
      </div>
    </Ctx.Provider>
  );
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

interface FloatingEditButtonProps {
  rect: { top: number; left: number; width: number; height: number };
  label: string;
  onClick(): void;
}

function FloatingEditButton({ rect, label, onClick }: FloatingEditButtonProps) {
  // Position the button just above-right of the selection box. Use
  // `position: fixed` so the rect (which is viewport-relative) lines up
  // without recomputing on scroll — the parent hook re-fires on scroll
  // to update the rect.
  //
  // The `huozi-edit-pill` class is the stable hook the theme layer uses
  // to override appearance per theme (brutal-mono renders this as a
  // stamped black-on-yellow pill instead of the default red fill — see
  // globals.css). Don't drop the class without also updating that file.
  const top = Math.max(8, rect.top - 32);
  const left = rect.left + rect.width;
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Don't let the click clear the selection before our handler runs.
        e.preventDefault();
      }}
      onClick={onClick}
      className="huozi-edit-pill fixed z-[60] px-2 py-1 text-xs rounded shadow-lg bg-accent text-accent-foreground hover:opacity-90 border border-border"
      style={{ top, left }}
    >
      {label}
    </button>
  );
}
