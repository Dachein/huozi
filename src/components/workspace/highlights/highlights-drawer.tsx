"use client";

/**
 * Right-side clippings drawer.
 *
 * Pairs with the HighlightLayer: the layer resolves every stored
 * highlight to a live DOM Range and publishes the result to the shared
 * store; the drawer subscribes, lists each entry, and on click scrolls
 * the user to the source location with a brief flash.
 *
 * Renders three pieces:
 *   - a floating tab handle on the right edge (always visible when at
 *     least one clipping exists for the current file)
 *   - the slide-in panel
 *   - a transient "huozi-hl-flash" highlight that pulses for ~1s when
 *     an entry is clicked, on top of the persistent underline
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useT } from "@/lib/i18n/context";
import { notifyError } from "@/components/workspace/inline-edit/notify";
import {
  type ResolvedHighlight,
  getHighlights,
  subscribeHighlights,
} from "./store";

interface HighlightsDrawerProps {
  sourcePath: string;
}

const RELOAD_EVENT = "huozi:highlights-changed";
const FLASH_REGISTRY = "huozi-hl-flash";
const FLASH_DURATION_MS = 1100;

export function HighlightsDrawer({ sourcePath }: HighlightsDrawerProps) {
  const t = useT();
  // Subscribe to the store via useSyncExternalStore so the drawer
  // reflects whatever the HighlightLayer most recently published —
  // including entries that landed before this component mounted (the
  // common case: the layer resolves on first paint, the drawer is lazy).
  const { subscribe, getSnapshot } = useMemo(() => {
    return {
      subscribe: (cb: () => void) => subscribeHighlights(sourcePath, cb),
      getSnapshot: () => getHighlights(sourcePath),
    };
  }, [sourcePath]);
  const entries = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [open, setOpen] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current);
        const api = (CSS as unknown as {
          highlights?: Map<string, Highlight>;
        }).highlights;
        api?.delete(FLASH_REGISTRY);
      }
    },
    [],
  );

  const onJump = useCallback(
    (entry: ResolvedHighlight) => {
      if (!entry.range) return;
      const startEl =
        entry.range.startContainer.nodeType === Node.TEXT_NODE
          ? entry.range.startContainer.parentElement
          : (entry.range.startContainer as HTMLElement);
      startEl?.scrollIntoView({ behavior: "smooth", block: "center" });

      const api = (CSS as unknown as {
        highlights?: Map<string, Highlight>;
      }).highlights;
      if (api && typeof Highlight !== "undefined") {
        api.set(FLASH_REGISTRY, new Highlight(entry.range));
        if (flashTimer.current !== null) {
          window.clearTimeout(flashTimer.current);
        }
        flashTimer.current = window.setTimeout(() => {
          api.delete(FLASH_REGISTRY);
          flashTimer.current = null;
        }, FLASH_DURATION_MS);
      }
    },
    [],
  );

  const onDelete = useCallback(
    async (entry: ResolvedHighlight) => {
      try {
        const res = await fetch(
          `/api/app/drive/highlights?path=${encodeURIComponent(sourcePath)}&id=${encodeURIComponent(entry.highlight.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          notifyError(data.message ?? "delete failed");
          return;
        }
        window.dispatchEvent(
          new CustomEvent(RELOAD_EVENT, { detail: { sourcePath } }),
        );
      } catch (e) {
        notifyError((e as Error).message);
      }
    },
    [sourcePath],
  );

  const total = entries.length;
  const liveCount = entries.filter((e) => e.range !== null).length;
  const orphanCount = total - liveCount;

  // Hide the entire drawer when there are no clippings AND the panel is
  // closed — keeps the workspace chrome clean for files that haven't
  // been annotated. The tab reappears the moment the user clips
  // something (the layer publishes into the store and we re-render).
  if (total === 0 && !open) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("highlights.drawer.toggle")}
        aria-expanded={open}
        className="fixed top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1 px-2 py-3 rounded-l-md border border-r-0 border-border bg-card text-card-foreground shadow-md hover:bg-accent hover:text-accent-foreground transition-colors"
        style={{ right: open ? 320 : 0 }}
      >
        <span aria-hidden className="text-xs font-mono">
          {open ? "›" : "‹"}
        </span>
        {total > 0 && (
          <span className="text-[10px] font-mono tabular-nums">{total}</span>
        )}
      </button>

      <aside
        aria-hidden={!open}
        className="fixed top-0 right-0 h-screen w-80 z-30 border-l border-border bg-background shadow-lg flex flex-col transition-transform"
        style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
      >
        <header className="shrink-0 px-4 py-3 border-b border-border flex items-baseline justify-between">
          <h2 className="text-sm font-medium">{t("highlights.drawer.title")}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {liveCount}
            {orphanCount > 0 ? ` · ${orphanCount}!` : ""}
          </span>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto huozi-scrollarea">
          {entries.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              {t("highlights.drawer.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <ClippingRow
                  key={entry.highlight.id}
                  entry={entry}
                  onJump={onJump}
                  onDelete={onDelete}
                  deleteLabel={t("highlights.drawer.delete")}
                  orphanLabel={t("highlights.replay.orphan")}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

interface ClippingRowProps {
  entry: ResolvedHighlight;
  onJump: (entry: ResolvedHighlight) => void;
  onDelete: (entry: ResolvedHighlight) => void;
  deleteLabel: string;
  orphanLabel: string;
}

function ClippingRow({
  entry,
  onJump,
  onDelete,
  deleteLabel,
  orphanLabel,
}: ClippingRowProps) {
  const orphan = entry.range === null;
  return (
    <li className="group px-4 py-3 hover:bg-muted/40">
      <button
        type="button"
        onClick={() => onJump(entry)}
        disabled={orphan}
        title={orphan ? orphanLabel : undefined}
        className={`w-full text-left text-sm leading-snug ${
          orphan
            ? "text-muted-foreground/70 cursor-not-allowed"
            : "text-foreground"
        }`}
      >
        <span className="line-clamp-3 whitespace-pre-wrap break-words">
          {entry.highlight.text}
        </span>
      </button>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <time dateTime={entry.highlight.createdAt}>
          {formatRelative(entry.highlight.createdAt)}
        </time>
        <button
          type="button"
          onClick={() => onDelete(entry)}
          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
        >
          {deleteLabel}
        </button>
      </div>
    </li>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso.slice(0, 10);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return iso.slice(0, 10);
}
