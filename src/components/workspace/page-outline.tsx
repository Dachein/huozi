"use client";

/**
 * Right-side floating outline shown next to a paginated HTML preview.
 * Lists every <section data-page> in the document, tracks the currently
 * visible one via IntersectionObserver (scoped to the rendered HTML host),
 * and lets the reader jump to any page.
 *
 * One component, four placements:
 *   - workspace inline preview  (parent: file-renderer)
 *   - workspace fullscreen       (overlay floats above)
 *   - published /p/<slug>        (parent: share-viewer)
 *   - all share the same data shape from extractPages()
 *
 * Hidden when there are fewer than 2 pages (no need for an outline).
 * Hidden on narrow viewports (the host is already scrollable).
 */

import { useEffect, useRef, useState } from "react";
import type { PageEntry } from "@/lib/html/extract-pages";

export interface PageOutlineProps {
  pages: PageEntry[];
  /**
   * Visual style:
   *   "dots" — minimal dot column (deck / story)
   *   "list" — numbered text list   (paper, default)
   */
  variant?: "dots" | "list";
}

export function PageOutline({ pages, variant = "list" }: PageOutlineProps) {
  const [activeId, setActiveId] = useState<string | null>(
    pages[0]?.id ?? null,
  );
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (pages.length < 2) return;
    // Track which page section is most visible. We look up the section
    // elements in the *document*, not inside our nav, then attach a single
    // observer.
    const targets: Element[] = [];
    for (const p of pages) {
      const el = document.getElementById(p.id);
      if (el) targets.push(el);
    }
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the largest intersection ratio that's
        // currently intersecting.
        let best: IntersectionObserverEntry | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (best) setActiveId(best.target.id);
      },
      {
        // Trigger when ~50% of a page is visible. Tuned so deck/story
        // (snap-aligned) hit cleanly, and paper (long pages) feels right.
        threshold: [0.5, 0.75, 1],
      },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [pages]);

  if (pages.length < 2) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Page outline"
      className={`hidden lg:flex flex-col fixed z-40 right-3 top-1/2 -translate-y-1/2
                  max-h-[70vh] overflow-y-auto
                  ${variant === "dots" ? "gap-2.5 p-2 bg-foreground/40 backdrop-blur rounded-full border border-foreground/10" : "gap-0 p-2 px-3 bg-background/90 backdrop-blur rounded-md border border-border shadow-lg text-xs max-w-[200px]"}`}
    >
      {variant === "list" && (
        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1.5 px-1">
          Pages
        </p>
      )}
      {pages.map((p) => {
        const active = p.id === activeId;
        if (variant === "dots") {
          return (
            <a
              key={p.id}
              href={`#${p.id}`}
              aria-label={`${p.index}. ${p.title}`}
              title={`${p.index}. ${p.title}`}
              className={`block w-2 h-2 rounded-full transition-all
                          ${active ? "bg-background scale-[1.4]" : "bg-background/40 hover:bg-background/80"}`}
            />
          );
        }
        return (
          <a
            key={p.id}
            href={`#${p.id}`}
            className={`flex gap-2 px-2 py-1 rounded transition-colors
                        ${active ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          >
            <span
              className={`tabular-nums w-4 text-right shrink-0 ${active ? "text-accent" : "text-border"}`}
            >
              {p.index}
            </span>
            <span className="truncate">{p.title}</span>
          </a>
        );
      })}
    </nav>
  );
}
