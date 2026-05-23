/**
 * Tiny DOM-injected toast — used by the inline-edit save flow to
 * surface failures after the modal has already closed (optimistic
 * flow: the modal closes the moment the user clicks Save; if the
 * background POST then fails, we revert the optimistic patch and
 * need to tell the user *somewhere*).
 *
 * Deliberately not a React component — it must work even when the
 * triggering component (EditModal) has unmounted. ~30 LOC, no
 * dependencies, no theme integration. The error case is rare; we
 * prioritize "clearly visible" over "perfectly themed".
 *
 * If we ever add a real toast system, replace the body of this file
 * with a thin adapter — the call site is one function: `notifyError`.
 */

const TOAST_DURATION_MS = 6000;
const TOAST_CLASS = "huozi-edit-toast";

/** Brief confirmation toast — green, shorter timeout. Used by clip flow
 *  to confirm the save without stealing focus. */
export function notifyInfo(message: string): void {
  showToast(message, { background: "#16a34a", durationMs: 2200 });
}

export function notifyError(message: string): void {
  showToast(message, { background: "#dc2626", durationMs: TOAST_DURATION_MS });
}

function showToast(
  message: string,
  opts: { background: string; durationMs: number },
): void {
  if (typeof document === "undefined") return;

  // Stack new toasts below existing ones — don't overwrite a still-
  // visible message in case multiple saves fail in quick succession.
  const existing = document.querySelectorAll<HTMLDivElement>(
    `.${TOAST_CLASS}`,
  );
  const offsetTop = 16 + existing.length * 56;

  const el = document.createElement("div");
  el.className = TOAST_CLASS;
  el.setAttribute("role", "alert");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    top: `${offsetTop}px`,
    right: "16px",
    zIndex: "100",
    padding: "10px 14px",
    background: opts.background,
    color: "white",
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "1.4",
    maxWidth: "360px",
    cursor: "pointer",
    pointerEvents: "auto",
    transition: "opacity 200ms ease, transform 200ms ease",
    opacity: "0",
    transform: "translateY(-8px)",
  } as Partial<CSSStyleDeclaration>);
  el.addEventListener("click", () => dismiss(el));
  document.body.appendChild(el);

  // Slide in on next frame so the transition runs.
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  window.setTimeout(() => dismiss(el), opts.durationMs);
}

function dismiss(el: HTMLDivElement): void {
  if (!el.isConnected) return;
  el.style.opacity = "0";
  el.style.transform = "translateY(-8px)";
  window.setTimeout(() => el.remove(), 220);
}
