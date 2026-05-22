/**
 * Width-locked wrapper for the `paper` format.
 *
 * Paper-style documents (long-form reading column, e.g. a memo / report /
 * essay) want a fixed *width* so line-length stays comfortable and
 * typography stays stable — but variable *height* so the reader can
 * scroll through arbitrarily long content. This is the Notion / Google
 * Docs / Substack convention; paper here is NOT a PDF-style "scale to
 * fit each page" model.
 *
 * No transform, no scale — just `width: <Npx>` on the inner column,
 * centered horizontally, with vertical scroll on the wrapper. Pure CSS,
 * server component.
 *
 * Container query angle:
 *   Like ScaledStage, this wrapper exposes a container (`container-type:
 *   inline-size`) so the inner column's CSS can reference `100cqw` and
 *   get the locked width. Nested containers inside (e.g. `.huozi-paper`
 *   declaring its own container-type) shadow ours as expected — author
 *   `cqw` resolves to the paper's own width.
 */

import type { ReactNode } from "react";

export interface FixedWidthStageProps {
  /** Locked column width in CSS pixels (e.g. 816 for A4 @ 96dpi). */
  width: number;
  /** Inner content (typically the `<HtmlInlineFrame>` with the
   *  prerendered HTML). */
  children: ReactNode;
  /** Optional class merged onto the inner column element. */
  columnClassName?: string;
}

export function FixedWidthStage({
  width,
  children,
  columnClassName,
}: FixedWidthStageProps) {
  return (
    <div className="huozi-paper-frame w-full h-full flex justify-center overflow-y-auto overflow-x-hidden [container-type:inline-size]">
      <div
        className={`huozi-paper-column shrink-0 max-w-full${columnClassName ? " " + columnClassName : ""}`}
        style={{ width: `${width}px` }}
      >
        {children}
      </div>
    </div>
  );
}
