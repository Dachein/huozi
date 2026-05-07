"use client";

/**
 * Edit modal: textarea for the user to type the new value, then POST to
 * `/api/app/drive/edit` to apply via huozi_edit (audit-trail entry as
 * the cookie's user). On success, calls `router.refresh()` inside a
 * useTransition and keeps the modal in "saving" state until the
 * server re-render lands — closing the modal earlier would either
 * (a) cancel the refresh from a stale closure / unmounting context or
 * (b) flash the old content before the new bytes arrive (Cloudflare D1
 * has cross-replica read-after-write lag of a few hundred ms).
 *
 * Error mapping translates the Worker's MCP error codes to friendly
 * localized strings — see `errorKey()` for the table.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import type { ObjectKind, ObjectLocator } from "./types";

export interface EditModalProps {
  filePath: string;
  objectKind: ObjectKind;
  initialText: string;
  locator: ObjectLocator;
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
  const { filePath, objectKind, initialText, locator, onClose, hint } = props;
  const t = useT();
  const router = useRouter();

  const [value, setValue] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshPending, startTransition] = useTransition();
  // Latched once the POST returns ok. Combined with !refreshPending it
  // tells the close-after-refresh effect that the server re-render has
  // landed and the modal can dismiss.
  const [savedOk, setSavedOk] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close once the post-save refresh transition completes. Don't close
  // synchronously inside the save handler — the refresh runs in a React
  // transition and we want the modal's "Saving…" state to persist until
  // the new server tree is committed, so the user doesn't see the old
  // content for a frame.
  useEffect(() => {
    if (savedOk && !refreshPending) {
      onClose();
    }
  }, [savedOk, refreshPending, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        !saving &&
        !refreshPending &&
        !savedOk
      ) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, refreshPending, savedOk]);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  async function onSave() {
    if (saving) return;
    if (value === initialText) {
      onClose();
      return;
    }
    setSaving(true);
    setErrorText(null);

    // Compute (old_string, new_string) per locator type.
    let old_string: string;
    let new_string: string;
    try {
      if (locator.kind === "bytes") {
        old_string = initialText;
        new_string = value;
      } else if (locator.kind === "csv-cell") {
        // Read the file's raw bytes for the cell from the EditableSurface's
        // data-source, then CSV-encode the user's new value. Old bytes
        // include any surrounding quotes / escapes; new bytes get them
        // re-applied iff the new value needs them.
        const source = readSourceFromHost();
        if (source === null) throw new Error("source unavailable");
        old_string = source.slice(locator.start, locator.end);
        new_string = csvEncodeCell(value, locator.delim);
      } else {
        // jsonl-field: replace the whole line with a re-serialized object
        // that has the field overridden. Preserves key order.
        old_string = locator.lineText;
        const nextRaw = { ...locator.lineRaw, [locator.fieldKey]: value };
        new_string = JSON.stringify(nextRaw);
      }
    } catch (e) {
      setErrorText(
        t("editor.inline.error.generic").replace(
          "{message}",
          e instanceof Error ? e.message : String(e),
        ),
      );
      setSaving(false);
      return;
    }
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
        body: JSON.stringify({ file_path: filePath, old_string, new_string }),
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
      // Trigger the server re-render inside a transition, then latch the
      // success flag. The useEffect above closes the modal once the
      // transition resolves — i.e. once the new content is rendered.
      startTransition(() => {
        router.refresh();
      });
      setSavedOk(true);
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

  const busy = saving || refreshPending || savedOk;

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
          if (!busy) onClose();
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
            disabled={busy}
            aria-label={t("editor.inline.cancel")}
            className="text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-auto">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="w-full min-h-[8rem] max-h-[40vh] rounded border border-border bg-muted/30 p-3 text-sm font-mono leading-relaxed outline-none focus:border-foreground/40 disabled:opacity-50 whitespace-pre-wrap"
            spellCheck={false}
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
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted disabled:opacity-50"
          >
            {t("editor.inline.cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || value === initialText}
            className="px-3 py-1.5 text-sm rounded bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t("editor.inline.saving") : t("editor.inline.save")}
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

/** RFC 4180-ish CSV cell encoder. Quote iff value contains the delim,
 *  a quote, CR, or LF; double up internal quotes. */
function csvEncodeCell(value: string, delim: string): string {
  const needsQuote =
    value.includes(delim) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");
  if (!needsQuote) return value;
  return '"' + value.replace(/"/g, '""') + '"';
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
