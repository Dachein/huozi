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
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import type { ObjectKind, ObjectLocator } from "./types";
import { getStrategy } from "./strategies/registry";
import { isEditError } from "./strategies/types";
import { EditorBody } from "./editor-body";
import { applyOptimisticPatch } from "./optimistic-patch";

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
  const router = useRouter();

  const [value, setValue] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Pull the strategy-declared language for the editor body (markdown /
  // html / null = plain text). The body autofocuses + selects-all on
  // mount on its own; no ref needed here.
  const language = getStrategy(objectKind).editorLanguage ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function onSave() {
    if (saving) return;
    if (value === initialText) {
      onClose();
      return;
    }
    setSaving(true);
    setErrorText(null);

    // Compute (old_string, new_string) by dispatching to the per-type
    // strategy. The framework is type-agnostic; encoding rules (CSV
    // quoting, JSON re-stringify, anchor expansion) live in the strategy
    // files under ./strategies/. See docs/inline-edit.md §4.
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
      setSaving(false);
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
      setSaving(false);
      return;
    }
    const { old_string, new_string } = result;
    if (old_string === new_string) {
      // The user's value re-encodes to the same bytes already in the
      // file (e.g. they "edited" without changing). Treat as cancel.
      onClose();
      return;
    }

    try {
      const res = await fetch("/api/app/drive/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          file_path: filePath,
          old_string,
          new_string,
          // BFF uses this as the freshness proof and skips the Read-first
          // round-trip when present. ~50% latency win on the save POST.
          ...(parentBlobSha ? { parent_blob_sha: parentBlobSha } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ApiError;
      if (!res.ok) {
        const key = errorKey(body.code);
        const msg = t(key as Parameters<typeof t>[0]);
        setErrorText(
          msg.includes("{message}")
            ? msg.replace("{message}", body.message ?? `HTTP ${res.status}`)
            : msg,
        );
        setSaving(false);
        return;
      }
      // Optimistic DOM patch — apply the user's edit to the rendered
      // tree right now so the screen visibly updates instantly. The
      // router.refresh() below kicks off a background SSR sync that
      // eventually replaces the patched DOM with canonical bytes; both
      // should match, so the user sees no flash. See optimistic-patch.ts
      // for per-locator behavior (csv-cell skips, jsonl/md/html patch).
      applyOptimisticPatch(locator, value, source);
      // Fire refresh from a still-mounted context so Next has a live
      // tree to commit the new server payload into. Then close the
      // modal — felt latency wins over avoiding a brief stale flash.
      router.refresh();
      onClose();
      // Belt-and-suspenders second refresh: refresh #1 may have hit a
      // D1 replica that hadn't yet seen the commit. By 250ms the write
      // has propagated to all replicas in practice. Fire-and-forget.
      window.setTimeout(() => {
        try {
          router.refresh();
        } catch {
          /* ignore — page may have navigated */
        }
      }, 250);
    } catch (e) {
      setErrorText(
        t("editor.inline.error.generic").replace(
          "{message}",
          e instanceof Error ? e.message : String(e),
        ),
      );
      setSaving(false);
    }
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
        onClick={() => {
          if (!saving) onClose();
        }}
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
            disabled={saving}
            aria-label={t("editor.inline.cancel")}
            className="text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-auto">
          <EditorBody
            initialValue={initialText}
            language={language}
            disabled={saving}
            onChange={setValue}
          />
          {objectKind === "jsonl-field" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("editor.inline.hint.jsonl")}
            </p>
          )}
          {errorText && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {errorText}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted disabled:opacity-50"
          >
            {t("editor.inline.cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || value === initialText}
            className="px-3 py-1.5 text-sm rounded bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t("editor.inline.saving") : t("editor.inline.save")}
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
