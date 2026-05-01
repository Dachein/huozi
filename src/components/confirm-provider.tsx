"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { SwitchConfirmDialog } from "@/components/switch-confirm-dialog";

export interface ConfirmRequest {
  /** Headline shown at the top of the dialog. */
  title: string;
  /** Body sentence — explain consequences, not the action. */
  body: string;
  /** Single-character glyph echoed next to the title. Defaults to "?"
   *  for generic asks, "!" for destructive ones. */
  glyph?: string;
  /** Optional accent-colored warning line (e.g. "this can't be undone"). */
  warning?: string;
  /** Confirm-button label. Defaults to a localized "Confirm" — pass a
   *  verb that names the action ("Revoke", "Remove", "Delete") so the
   *  user reads commitment, not generic agreement. */
  actionLabel?: string;
  /** Cancel-button label. */
  cancelLabel?: string;
  /** Style hint for the confirm button. `"danger"` swaps accent → red
   *  in the default theme; brutal-mono renders both as stamped blocks
   *  so the variant only changes the fill. */
  tone?: "default" | "danger";
}

type Resolver = (ok: boolean) => void;

interface InternalState extends ConfirmRequest {
  resolve: Resolver;
}

const ConfirmContext = createContext<
  ((req: ConfirmRequest) => Promise<boolean>) | null
>(null);

/**
 * Provider for the global confirm dialog. Mounts ONCE near the root
 * of the (app) layout. Children call `useConfirm()` to get an
 * `ask(req)` Promise — pattern mirrors `window.confirm` so existing
 * callers swap with minimal disruption:
 *
 *   const ask = useConfirm();
 *   if (!(await ask({ title, body }))) return;
 *
 * Why a global mount: the dialog needs to survive caller unmounts
 * (e.g. inline-mounted drawers that close their own state on confirm)
 * and must portal to <body> to escape backdrop-blur containing blocks
 * — see SwitchConfirmDialog for the same workaround.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InternalState | null>(null);

  const ask = useCallback(
    (req: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setState({ ...req, resolve });
      }),
    [],
  );

  function close(ok: boolean) {
    if (!state) return;
    state.resolve(ok);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {state && (
        <SwitchConfirmDialog
          title={state.title}
          glyph={state.glyph ?? (state.tone === "danger" ? "!" : "?")}
          body={state.body}
          warning={state.warning}
          tone={state.tone}
          actionLabel={state.actionLabel ?? "OK"}
          cancelLabel={state.cancelLabel ?? "Cancel"}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}
