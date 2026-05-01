"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SwitchConfirmDialogProps {
  /** Title shown at the top (already localized). */
  title: string;
  /** Glyph rendered next to the title — single CJK char or letter,
   *  echoing the picker tile so the user sees what they're confirming. */
  glyph: string;
  /** Body sentence (already localized & interpolated). */
  body: string;
  /** Optional warning line shown in accent color. Pass when the
   *  target option is experimental / non-canonical. */
  warning?: string;
  /** Confirm-button label. */
  actionLabel: string;
  /** Cancel-button label. */
  cancelLabel: string;
  /** Visual tone of the confirm button. `"danger"` swaps the fill to
   *  --destructive for irreversible actions (revoke / delete). The
   *  `huozi-button` token-class still applies, so brutal-mono renders
   *  it as a stamped block — only the fill colour differs. */
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation used by both ThemeGrid and LocaleGrid before
 * applying a switch. The grid passes pre-localized strings so the
 * dialog itself is i18n-agnostic — that lets a locale switch render
 * the body in BOTH the current and the target language without the
 * dialog needing to know about either.
 *
 * Layout: backdrop (click to cancel) + small panel with title + body
 * + optional accent warning + cancel/confirm buttons. Confirm is
 * auto-focused so Enter applies and Esc cancels. Mounted at z-80 so
 * it sits above dropdown menus (z-40/50) and below the theme-apply
 * overlay (z-100).
 */
export function SwitchConfirmDialog({
  title,
  glyph,
  body,
  warning,
  actionLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  onCancel,
}: SwitchConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  // The dialog must portal to <body> because the AppHeader and the
  // workspace mobile sub-strip both use `backdrop-blur` — and any
  // `backdrop-filter` ancestor creates a containing block for
  // `position: fixed` descendants. Rendered in-tree, the dialog's
  // `inset-0` would resolve to the small header box (stuck at top,
  // header bg replaced by the dialog backdrop) instead of the
  // viewport.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      // Stop mousedown from bubbling to document. user-menu listens for
      // mousedown on document to close itself on outside-click; without
      // this stop, clicking the confirm button (portaled to <body>,
      // outside the menu's rootRef) would unmount the menu — and the
      // dialog with it — BEFORE the button's click event fires, so the
      // onConfirm handler never runs. This was masked while the dialog
      // rendered in-tree inside the menu; portaling exposed the bug.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-sm rounded-lg border border-border bg-background shadow-xl p-5
                   animate-in fade-in zoom-in-95 duration-150"
      >
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span className="font-serif text-accent">{glyph}</span>
          <span>{title}</span>
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">{body}</p>
        {warning && (
          <p className="mt-2 text-xs text-accent leading-relaxed">{warning}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="huozi-button rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              tone === "danger"
                ? "huozi-button-danger-solid rounded-md border border-destructive bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
                : "huozi-button-primary rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
            }
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

