/**
 * Strategy registry — single source of truth for "which strategy handles
 * which ObjectKind". `editable-surface.tsx` and `edit-modal.tsx` look up
 * strategies through `getStrategy(kind)` instead of branching on kind.
 *
 * Adding a fifth type is one new file in `strategies/` plus one entry
 * here.
 */

import type { ObjectKind } from "../types";
import type { EditStrategy } from "./types";
import { mdStrategy } from "./md";
import { htmlStrategy } from "./html";
import { csvStrategy } from "./csv";
import { jsonlStrategy } from "./jsonl";

const STRATEGIES: Record<ObjectKind, EditStrategy> = {
  "md-block": mdStrategy,
  "html-element": htmlStrategy,
  "csv-cell": csvStrategy,
  "jsonl-field": jsonlStrategy,
};

export function getStrategy(kind: ObjectKind): EditStrategy {
  return STRATEGIES[kind];
}
