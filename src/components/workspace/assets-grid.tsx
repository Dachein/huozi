"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useConfirm } from "@/components/confirm-provider";

export interface Asset {
  path: string;
  fileName: string;
  url: string | null;
  mimeType: string | null;
  size: number | null;
}

export function AssetsGrid({ assets }: { assets: Asset[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Optimistic-removal list — server rerender via router.refresh() is
  // the real source of truth, but we drop deleted items immediately so
  // the lightbox can advance without flashing the just-deleted image.
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(new Set());

  // The hide-set may accumulate stale paths after router.refresh()
  // takes them out of `assets`, but the filter is a no-op for entries
  // not in the live list, and the set resets on navigation. Cheaper
  // than a sync-up effect.
  const visibleAssets = useMemo(
    () => assets.filter((a) => !hiddenPaths.has(a.path)),
    [assets, hiddenPaths],
  );

  const open = useCallback((idx: number) => setOpenIndex(idx), []);
  const close = useCallback(() => setOpenIndex(null), []);

  const handleDeleted = useCallback(
    (path: string) => {
      setHiddenPaths((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
      // After hiding, advance / clamp the open index against the new
      // visibleAssets. We compute it from the *next* visible list.
      const newVisible = visibleAssets.filter((a) => a.path !== path);
      if (newVisible.length === 0) {
        setOpenIndex(null);
      } else {
        setOpenIndex((cur) => {
          if (cur === null) return null;
          // Stay on the same slot; if we deleted the last item, step back.
          return Math.min(cur, newVisible.length - 1);
        });
      }
    },
    [visibleAssets],
  );

  return (
    <>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {visibleAssets.map((a, i) => (
          <li key={a.path} className="relative group">
            <button
              type="button"
              onClick={() => open(i)}
              className="block w-full aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden hover:border-accent/60 transition-colors"
              aria-label={`Open ${a.fileName}`}
            >
              {a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.url}
                  alt={a.fileName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  (preview unavailable)
                </div>
              )}
            </button>
            <div className="mt-1.5 px-0.5">
              <span className="font-mono text-xs text-muted-foreground truncate block">
                {a.fileName}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {openIndex !== null && visibleAssets[openIndex] && (
        <Lightbox
          asset={visibleAssets[openIndex]!}
          hasPrev={openIndex > 0}
          hasNext={openIndex < visibleAssets.length - 1}
          onPrev={() => setOpenIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() =>
            setOpenIndex((i) =>
              i !== null && i < visibleAssets.length - 1 ? i + 1 : i,
            )
          }
          onClose={close}
          onDeleted={handleDeleted}
          position={`${openIndex + 1} / ${visibleAssets.length}`}
        />
      )}
    </>
  );
}

interface LightboxProps {
  asset: Asset;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDeleted: (path: string) => void;
  position: string;
}

function Lightbox({
  asset,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onDeleted,
  position,
}: LightboxProps) {
  const router = useRouter();
  const ask = useConfirm();
  const [copied, setCopied] = useState(false);
  const [deleting, startDelete] = useTransition();

  // Markdown link convention — see SPEC §4.8.
  const markdownLink = `![${asset.fileName}](/${asset.path})`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdownLink);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = markdownLink;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [markdownLink]);

  const onDeleteClick = useCallback(async () => {
    const ok = await ask({
      title: "Delete asset?",
      body: `This removes ${asset.fileName} from your workspace. The file is still recoverable from history (R2 blobs aren't purged), but inline references in markdown will break.`,
      glyph: "!",
      actionLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    startDelete(async () => {
      const res = await fetch("/api/app/assets/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: asset.path }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Delete failed: ${body.error ?? res.statusText}`);
        return;
      }
      onDeleted(asset.path);
      // Server rerender → fresh asset list (new commit_sha, etc.)
      router.refresh();
    });
  }, [ask, asset.fileName, asset.path, onDeleted, router]);

  // Keyboard shortcuts: ESC closes, ←/→ navigate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (deleting) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleting, hasPrev, hasNext, onPrev, onNext, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={asset.fileName}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top chrome — filename + close. */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-sm truncate">{asset.fileName}</span>
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {position}
          </span>
          {asset.size !== null && (
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {asset.size.toLocaleString()} B
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Image area — center the picture, leave room for chrome. */}
      <div
        className="relative flex-1 flex items-center justify-center p-4 sm:p-8 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev */}
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 rounded-full p-2 bg-background/80 border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous"
        >
          <ChevronLeft size={20} />
        </button>

        {asset.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={asset.fileName}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-sm text-muted-foreground">
            (preview unavailable)
          </div>
        )}

        {/* Next */}
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 rounded-full p-2 bg-background/80 border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Bottom chrome — actions. */}
      <div
        className="flex items-center justify-center gap-2 px-4 py-3 border-t border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/60"
          title="Copy markdown link"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? "已复制" : "Copy markdown"}</span>
        </button>
        <button
          type="button"
          onClick={onDeleteClick}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 text-red-600 dark:text-red-400 px-3 py-1.5 text-xs hover:bg-red-500/10 disabled:opacity-50"
          title="Delete this asset"
        >
          <Trash2 size={14} />
          <span>{deleting ? "Deleting…" : "Delete"}</span>
        </button>
      </div>
    </div>
  );
}
