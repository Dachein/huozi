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
 * them to /login (the canonical Edge auth entry as of Phase A).
 * `/signup` is also Cloud-only — Cloud folds signup into /login (any
 * unrecognized email triggers OTP signup). Edge has no public signup
 * (closed deployment, invite-only).
 *
 * Note: `/auth/*` paths on Edge are owned by the backend Worker (route
 * patterns in wrangler.edge.toml grab `/auth/*` before this middleware
 * sees the request). The prefix is kept here as a defensive belt for
 * configuration drift.
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

/**
 * Hostnames at which the product UI must NOT be served. Cloud edition
 * canonically lives at cloud.huozi.app — `huozi.app` is reserved for
 * marketing only, but a legacy zone-route binding still falls through
 * to this Worker for non-marketing paths. We 404 those explicitly so
 * the dual presence doesn't shadow real bugs (cookie-domain mismatch,
 * stale links, etc.). To keep this off in Edge / preview deployments,
 * the list is empty there.
 */
const REJECTED_HOSTS = new Set(["huozi.app", "www.huozi.app"]);

export async function middleware(request: NextRequest) {
  // ─── Block legacy huozi.app fallback (Cloud edition only) ─────────
  if (!isEdge()) {
    const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
    if (host && REJECTED_HOSTS.has(host)) {
      return new NextResponse(
        `<!doctype html><meta charset="utf-8"><title>Moved</title>` +
          `<p>The product UI lives at <a href="https://cloud.huozi.app${request.nextUrl.pathname}${request.nextUrl.search}">cloud.huozi.app${request.nextUrl.pathname}</a>.</p>`,
        {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }
  }

  // ─── Edge edition ─────────────────────────────────────────────────
  if (isEdge()) {
    const path = request.nextUrl.pathname;
    if (CLOUD_ONLY_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
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

  // Public share pages (/p/<slug>) get an aggressive CDN cache header so
  // Cloudflare's edge cache services repeat opens without touching the
  // Worker at all. Locked shares are PASSWORD-gated on the CLIENT (they
  // POST /api/p/[slug]/unlock); the SSR'd password prompt itself is the
  // same for every visitor and safe to cache.
  // The /api/p/* unlock endpoint stays uncached (it's a route handler
  // that always reaches the Worker), so this cache only fronts the
  // initial page paint.
  const path = request.nextUrl.pathname;
  if (path.startsWith("/p/") && !path.startsWith("/p/api/")) {
    // s-maxage = shared cache (CDN) TTL; max-age=0 keeps browsers honest
    // so an edit shows up on next refresh without a full purge.
    // stale-while-revalidate lets the edge serve stale while it refreshes.
    response.headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    // Vary is required so Cloudflare doesn't serve a br response to a
    // gzip-only client (or vice versa).
    response.headers.set("Vary", "Accept-Encoding");
  }

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
