"use client";

/**
 * Client-side lazy loader for CollectionView. Same rationale as
 * csv-grid-lazy: Next.js 16 blocks ssr:false in server components but
 * the file-renderer (server) still wants the jsonl viewer to be a
 * deferred chunk. Wrapping in a client component sidesteps the rule.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const CollectionView = dynamic(
  () =>
    import("@/components/collection-view").then((m) => m.CollectionView),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] rounded border border-border bg-muted/30 animate-pulse" />
    ),
  },
);

type Props = ComponentProps<typeof CollectionView>;

export function CollectionViewLazy(props: Props) {
  return <CollectionView {...props} />;
}
