"use client";

/**
 * Edit modal: textarea for the user to type the new value, then POST to
 * `/api/app/drive/edit` to apply via huozi_edit (audit-trail entry as
 * the cookie's user).
 *
 * Save-flow timing (matters — see commits where we tuned this twice):
 *   1. POST returns ok → fire `router.refresh()` from a still-mounted
 *      context, then close the modal immediately. The refresh returns
 *      void; we don't block on it because the felt latency of "Saving…"
 *      hanging for half a second to clear D1 cross-replica read-after-
 *      write lag is worse than a brief flash of pre-edit content.
 *   2. After ~250ms (typical D1 settle time), fire a second refresh.
 *      This catches the case where refresh #1 hit a stale replica and
 *      re-rendered with the old bytes.
 *   3. The CloudLiveEvents WS path independently triggers `router.refresh`
 *      when the commit broadcast lands — a third belt-and-suspenders.
 *
 * Net: modal closes within one POST round-trip, content lights up within
 * 0–300ms.
 *
 * Error mapping translates the Worker's MCP error codes to friendly
 * localized strings — see `errorKey()` for the table.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/context";
import type { ObjectKind, ObjectLocator } from "./types";
import { getStrategy } from "./strategies/registry";
import { isEditError } from "./strategies/types";
import { applyOptimisticPatch } from "./optimistic-patch";
import { notifyError } from "./notify";
import { runOptimistic } from "@/lib/optimistic/run-optimistic";

// CodeMirror (+ language packs) is ~200KB gzipped. Only load it once the
// user actually opens the edit modal — view-only sessions never pay for
// it. ssr:false because CodeMirror touches the DOM during init.
const EditorBody = dynamic(
  () => import("./editor-body").then((m) => m.EditorBody),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[140px] rounded border border-border bg-muted/30 animate-pulse" />
    ),
  },
);

export interface EditModalProps {
  filePath: string;
  objectKind: ObjectKind;
  initialText: string;
  locator: ObjectLocator;
  /** blob_sha SSR observed for this file. Sent as `parent_blob_sha` in
   *  the save POST so the BFF can short-circuit the Read-first round-trip
   *  on the Worker side. `null` = unknown; BFF falls back to slower path. */
  parentBlobSha?: string | null;
  onClose(): void;
  /** Optional override of the default field hint (e.g. CSV cell label). */
  hint?: string;
}

const SCOPE_KEY: Record<ObjectKind, string> = {
  "md-block": "editor.inline.scope.md",
  "html-element": "editor.inline.scope.html",
  "csv-cell": "editor.inline.scope.csv",
  "jsonl-field": "editor.inline.scope.jsonl",
};

interface ApiError {
  error?: string;
  code?: number;
  message?: string;
}

function errorKey(code: number | undefined): string {
  switch (code) {
    case 7:
      return "editor.inline.error.stale";
    case 8:
      return "editor.inline.error.notfound";
    case 9:
      return "editor.inline.error.ambiguous";
    case 101:
    case 403:
      return "editor.inline.error.forbidden";
    default:
      return "editor.inline.error.generic";
  }
}

export function EditModal(props: EditModalProps) {
  const {
    filePath,
    objectKind,
    initialText,
    locator,
    parentBlobSha = null,
    onClose,
    hint,
  } = props;
  const t = useT();

  const [value, setValue] = useState(initialText);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Pull the strategy-declared language for the editor body (markdown /
  // html / null = plain text). The body autofocuses + selects-all on
  // mount on its own; no ref needed here.
  const language = getStrategy(objectKind).editorLanguage ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSave() {
    if (value === initialText) {
      onClose();
      return;
    }
    setErrorText(null);

    // Synchronous prep: build (old_string, new_string) via the per-type
    // strategy. Errors here keep the modal open so the user can fix
    // their input — encoding errors are deterministic and shouldn't
    // cost a server round-trip.
    const strategy = getStrategy(objectKind);
    const source =
      locator.kind === "bytes" || locator.kind === "csv-cell"
        ? readSourceFromHost() ?? ""
        : "";
    if (
      (locator.kind === "bytes" || locator.kind === "csv-cell") &&
      source === ""
    ) {
      setErrorText(
        t("editor.inline.error.generic").replace(
          "{message}",
          "source unavailable",
        ),
      );
      return;
    }
    const result = strategy.buildEdit(
      { objectKind, initialText, locator },
      value,
      source,
    );
    if (isEditError(result)) {
      setErrorText(
        t("editor.inline.error.generic").replace("{message}", result.error),
      );
      return;
    }
    const { old_string, new_string } = result;
    if (old_string === new_string) {
      // User "edited" without changing bytes (e.g. typed and undid).
      onClose();
      return;
    }

    // Optimistic flow — the shared `runOptimistic` primitive applies
    // the DOM patch immediately, closes the modal, fires the background
    // POST, and reverts the patch + toasts on failure. Success is a
    // no-op here; CloudLiveEvents WS will broadcast the commit and
    // trigger router.refresh(), replacing the optimistic bytes with
    // canonical SSR (byte-identical → no flicker).
    onClose();
    runOptimistic(
      {
        applyLocal: () => applyOptimisticPatch(locator, value, source),
        commit: async () => {
          let res: Response;
          try {
            res = await fetch("/api/app/drive/edit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                file_path: filePath,
                old_string,
                new_string,
                ...(parentBlobSha ? { parent_blob_sha: parentBlobSha } : {}),
              }),
            });
          } catch (e) {
            // Transport error: keep the modal's generic-error template so
            // the toast reads the same as it did before this refactor.
            return {
              ok: false,
              message: t("editor.inline.error.generic").replace(
                "{message}",
                e instanceof Error ? e.message : String(e),
              ),
            };
          }
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ApiError;
            const key = errorKey(body.code);
            const msg = t(key as Parameters<typeof t>[0]);
            const finalMsg = msg.includes("{message}")
              ? msg.replace("{message}", body.message ?? `HTTP ${res.status}`)
              : msg;
            return { ok: false, message: finalMsg };
          }
          return { ok: true };
        },
        onError: (msg) => notifyError(msg),
      },
      undefined,
    );
  }

  const scopeLabel = t(SCOPE_KEY[objectKind] as Parameters<typeof t>[0]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-lg border border-border bg-background shadow-xl flex flex-col
                   animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between px-6 pt-6 gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">
              {t("editor.inline.title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {scopeLabel} · {filePath}
              {hint ? ` · ${hint}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("editor.inline.cancel")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-auto">
          <EditorBody
            initialValue={initialText}
            language={language}
            disabled={false}
            onChange={setValue}
          />
          {objectKind === "jsonl-field" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("editor.inline.hint.jsonl")}
            </p>
          )}
          {errorText && (
            <p className="mt-3 text-sm text-red-600">
              {errorText}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted"
          >
            {t("editor.inline.cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={value === initialText}
            className="px-3 py-1.5 text-sm rounded bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("editor.inline.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Read the source content the EditableSurface inlined into a `data-source`
 * attribute on its outer div. Used by csv-cell saves to recover the raw
 * cell bytes for `old_string`.
 */
function readSourceFromHost(): string | null {
  if (typeof document === "undefined") return null;
  // Walk up from any element under [data-source]. The modal portals are
  // siblings of the surface in the DOM tree, so we search from the
  // EditableSurface div directly via attribute selector.
  const el = document.querySelector<HTMLElement>("[data-source]");
  return el?.getAttribute("data-source") ?? null;
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4 L12 12 M12 4 L4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
