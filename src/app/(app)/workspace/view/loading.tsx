/**
 * Suspense fallback for `/workspace/view`. Shown immediately when the
 * user clicks a different file in the tree, while the new
 * `cloudRead()` is in flight. The shell + tree are rendered by
 * `layout.tsx` and stay put — only this skeleton swaps in for the
 * file-content column.
 */
export default function ViewLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb + title row */}
      <div>
        <div className="h-3 w-40 rounded bg-muted/60 mb-3" />
        <div className="flex items-center gap-2">
          <div className="h-6 w-2/3 rounded bg-muted/70" />
          <div className="ml-auto h-6 w-20 rounded bg-muted/50" />
          <div className="h-6 w-20 rounded bg-muted/50" />
        </div>
      </div>

      {/* Body lines */}
      <div className="space-y-3 pt-2">
        <div className="h-4 w-11/12 rounded bg-muted/50" />
        <div className="h-4 w-10/12 rounded bg-muted/50" />
        <div className="h-4 w-9/12 rounded bg-muted/40" />
        <div className="h-4 w-11/12 rounded bg-muted/50" />
        <div className="h-4 w-8/12 rounded bg-muted/40" />
        <div className="h-4 w-10/12 rounded bg-muted/50" />
        <div className="h-4 w-7/12 rounded bg-muted/40" />
      </div>
    </div>
  );
}
