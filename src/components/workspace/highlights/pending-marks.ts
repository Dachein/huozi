/**
 * Pending highlight marks — the optimistic counterpart to
 * `highlight-layer.tsx`.
 *
 * `highlight-layer.tsx` owns the `huozi-hl` CSS Custom Highlight
 * registry and renders clippings *after* the server confirms them.
 * For the moment between "user clicked Clip" and "server wrote
 * clippings.jsonl" we paint the selection in a separate registry —
 * `huozi-hl-pending` — so:
 *
 *   - the user sees the dotted underline instantly (perceived latency
 *     stays under a frame), and
 *   - if the server eventually rejects, removing this registry's
 *     range undoes the visual without touching the confirmed layer.
 *
 * Why a separate registry rather than appending to `huozi-hl`: the
 * layer fully overwrites `huozi-hl` on every reload (`.set(...)` not
 * `.add(...)`), so an entry we sneak in there would be wiped the next
 * time the layer GETs the file. A dedicated registry is independently
 * mutable and the layer never touches it.
 *
 * The styling for `::highlight(huozi-hl-pending)` lives in globals.css
 * — same dotted accent underline as confirmed marks, but at reduced
 * opacity to signal "not yet saved".
 */

import type { RevertFn } from "@/lib/optimistic/run-optimistic";

const REGISTRY = "huozi-hl-pending";

type HighlightsApi = Map<string, Highlight>;

function getHighlightsApi(): HighlightsApi | null {
  if (typeof window === "undefined") return null;
  if (typeof Highlight === "undefined") return null;
  const api = (CSS as unknown as { highlights?: HighlightsApi }).highlights;
  return api ?? null;
}

/**
 * Add the given ranges to the pending registry. Returns a revert that
 * removes exactly those ranges (matched by reference) on call. Safe to
 * call from environments without the Highlight API — the returned
 * revert is a no-op in that case.
 */
export function addPendingMark(ranges: Range[]): RevertFn {
  if (ranges.length === 0) return () => {};
  const api = getHighlightsApi();
  if (!api) return () => {};

  const existing = api.get(REGISTRY);
  const prev: Range[] = existing ? Array.from(existing as unknown as Iterable<Range>) : [];
  const next = [...prev, ...ranges];
  api.set(REGISTRY, new Highlight(...next));

  let reverted = false;
  return () => {
    if (reverted) return;
    reverted = true;
    const cur = api.get(REGISTRY);
    if (!cur) return;
    const remaining = Array.from(cur as unknown as Iterable<Range>).filter(
      (r) => !ranges.includes(r),
    );
    if (remaining.length === 0) {
      api.delete(REGISTRY);
    } else {
      api.set(REGISTRY, new Highlight(...remaining));
    }
  };
}
