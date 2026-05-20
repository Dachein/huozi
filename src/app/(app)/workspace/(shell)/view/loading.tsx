/**
 * Suspense fallback for the page segment. Almost never fires in
 * practice (soft `?path=` navigations don't trip it; the
 * useTransition-driven bar in WorkspaceShell handles that case), but
 * Next.js still uses this file's presence to enable partial prefetch
 * for the route. Keep the visual consistent with the soft-nav bar.
 */
export default function ViewLoading() {
  return (
    <div className="relative h-1">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
        <div className="h-full w-1/3 bg-accent animate-loading-bar" />
      </div>
    </div>
  );
}
