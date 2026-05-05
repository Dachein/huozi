import { redirect } from "next/navigation";

/**
 * Root path of the product app.
 *
 * The marketing site (landing / blog / cloud-edge product pages) lives in
 * a separate repo (huozi-marketing) deployed under the same domain via CF
 * route splitting. The product surface here just bounces visitors at `/`
 * into the workspace flow:
 *
 *   - Cloud + signed-in     → /workspace
 *   - Cloud + signed-out    → /workspace → (app) layout → /login
 *   - Edge  + signed-in     → /workspace
 *   - Edge  + signed-out    → /workspace → (app) layout → /login
 *
 * The (app)/layout.tsx already knows how to dispatch by edition + auth
 * state; we just need to start the chain here. (Edge used to bounce
 * unauthenticated requests to /connect; that page was retired mid-2026
 * once Edge moved to email + password auth at /login like Cloud does.)
 */
export default function Root() {
  redirect("/workspace");
}
