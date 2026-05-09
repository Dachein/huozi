"use client";

/**
 * CodeMirror-backed editor body for the inline-edit modal. Replaces the
 * raw textarea with a CM6 EditorView so we can attach overlays
 * (entity glyphs, syntax highlighting) without changing the underlying
 * byte model. See docs/inline-edit.md §6.
 *
 * Behavior contract — externally identical to a textarea:
 *   - controlled `value` prop (initial only — see below),
 *   - `onChange` fires on every keystroke,
 *   - `disabled` puts the editor in read-only mode,
 *   - body autofocuses on mount and selects all content (matches the
 *     old textarea UX so power users can immediately retype).
 *
 * NOTE on controlledness: CM6 owns its own document state. We seed with
 * the initial `value`, then push changes outward. We deliberately do
 * NOT pipe `value` back IN on every render — that would either fight
 * with user input or require a full document replace each keystroke.
 * The modal's React state is the side channel for save; CM6 is the
 * source of truth while the modal is open.
 */

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { entityOverlay } from "./entity-overlay";

export type EditorLanguage = "markdown" | "html" | null;

export interface EditorBodyProps {
  initialValue: string;
  language: EditorLanguage;
  disabled: boolean;
  onChange(next: string): void;
}

export function EditorBody({
  initialValue,
  language,
  disabled,
  onChange,
}: EditorBodyProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // The latest onChange — read inside the update listener so we don't
  // need to recreate the EditorView when the parent re-renders with a
  // fresh callback. Updated in an effect (refs may not be mutated during
  // render in React 19's strict checks).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!hostRef.current) return;

    let cancelled = false;
    let view: EditorView | null = null;

    // Lazy-load the language extension. Markdown / html packages add
    // a few dozen KB each; only pull the one we actually need.
    const loadLanguage = async () => {
      if (language === "markdown") {
        const { markdown } = await import("@codemirror/lang-markdown");
        return markdown();
      }
      if (language === "html") {
        const { html } = await import("@codemirror/lang-html");
        // matchClosingTags off — modal often shows partial HTML that
        // isn't well-formed (e.g. an inner slice of one element).
        return html({ matchClosingTags: false });
      }
      return null;
    };

    void loadLanguage().then((langExt) => {
      if (cancelled || !hostRef.current) return;

      const extensions = [
        history(),
        drawSelection(),
        highlightSpecialChars(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        entityOverlay,
        EditorState.readOnly.of(disabled),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": {
            fontSize: "13px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          },
          ".cm-content": {
            padding: "12px",
            minHeight: "8rem",
          },
          ".cm-focused": { outline: "none" },
        }),
      ];
      if (langExt) extensions.push(langExt);
      // Show line numbers only for non-trivial documents — saves
      // horizontal real estate in the modal for short md/html slices.
      if (initialValue.includes("\n") && initialValue.length > 80) {
        extensions.push(lineNumbers());
      }

      view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: initialValue,
          extensions,
        }),
      });
      viewRef.current = view;

      // Match the old textarea UX: focus + select-all on mount.
      view.focus();
      view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length },
      });
    });

    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
    // We intentionally don't depend on `disabled` / `language` after the
    // initial mount — the modal lifecycle is open-then-close, no in-place
    // reconfiguration. Keeps the editor stable while the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      className="w-full min-h-[8rem] max-h-[40vh] rounded border border-border bg-muted/30 overflow-auto focus-within:border-foreground/40 disabled:opacity-50"
    />
  );
}
