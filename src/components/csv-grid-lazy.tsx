"use client";

/**
 * Client-side lazy loader for CsvGrid. Exists because Next.js 16
 * forbids `dynamic({ ssr: false })` inside server components, but
 * file-renderer (server) wants to skip glide-data-grid (~300KB) for
 * non-CSV file opens. This thin wrapper carries the "use client"
 * directive so the dynamic split is legal.
 */

import dynamic from "next/dynamic";
import type { CsvGridProps } from "@/components/csv-grid";

const CsvGrid = dynamic(
  () => import("@/components/csv-grid").then((m) => m.CsvGrid),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] rounded border border-border bg-muted/30 animate-pulse" />
    ),
  },
);

export function CsvGridLazy(props: CsvGridProps) {
  return <CsvGrid {...props} />;
}
