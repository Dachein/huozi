/**
 * Edge-aware middleware.
 *
 * Runs on every non-static request. Handles two concerns:
 *   1. Locale cookie (both editions)
 *   2. Cloud-only-route gating in Edge mode
 *
 * Auth gating itself happens at the layout / page level via
 * `getIdentity().getPrincipal()`. The middleware only injects an
 * `x-pathname` header so layouts can build accurate `?redirect=` URLs.
 */

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, detectLocale } from "@/lib/i18n";
import { isEdge } from "@/lib/edition";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/jwt";

/**
 * Paths that only exist in the Cloud edition. In Edge mode we redirect
 * them to the paste-key connect page so the deployer never sees a broken
 * Supabase-backed surface.
 *
 * Note: signup is now folded into /login (one input, OTP creates the user
 * if needed), but we keep the path covered for any old links.
 */
const CLOUD_ONLY_PREFIXES = ["/signup", "/auth"];

function applyLocale(req: NextRequest, res: NextResponse): void {
  const localeCookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!localeCookie) {
    const detected = detectLocale(req.headers.get("accept-language"));
    res.cookies.set(COOKIE_NAME, detected, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
}

export async function middleware(request: NextRequest) {
  // ─── Edge edition ─────────────────────────────────────────────────
  if (isEdge()) {
    const path = request.nextUrl.pathname;
    if (CLOUD_ONLY_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
      const url = request.nextUrl.clone();
      url.pathname = "/connect";
      url.search = "";
      const res = NextResponse.redirect(url);
      applyLocale(request, res);
      return res;
    }
    const res = NextResponse.next({ request });
    applyLocale(request, res);
    return res;
  }

  // ─── Cloud edition ────────────────────────────────────────────────
  // Inject the current request path so RSC layouts can build accurate
  // `?redirect=` URLs when bouncing unauthenticated users to /login.
  const buildHeaders = () => {
    const h = new Headers(request.headers);
    h.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
    return h;
  };
  const response = NextResponse.next({ request: { headers: buildHeaders() } });
  applyLocale(request, response);

  // If the user is already signed in (valid huozi_session cookie) and lands
  // on /login or /signup, send them to /workspace. Verifying the JWT here
  // avoids a Worker roundtrip on every page load.
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/signup") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const claims = await verifySession(token);
      if (claims) {
        const url = request.nextUrl.clone();
        url.pathname = "/workspace";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
