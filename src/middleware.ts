/**
 * Edge-aware middleware.
 *
 * Runs on every non-static request. Handles two concerns:
 *   1. Locale cookie (both editions)
 *   2. Auth-gate for Cloud-only routes (login redirect for /dashboard, etc.)
 *
 * In Edge mode:
 *   - Skip Supabase entirely (those env vars won't exist).
 *   - Cloud-only routes (/dashboard, /login, /signup) redirect to
 *     /connect — the Edge deployer's paste-key flow.
 */

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, detectLocale } from "@/lib/i18n";
import { isEdge } from "@/lib/edition";

/**
 * Paths that only exist in the Cloud edition. In Edge mode we redirect
 * them to the paste-key connect page so the deployer never sees a broken
 * Supabase-backed surface.
 *
 * `/login`, `/signup`, `/auth/*` rely on Supabase email OTP.
 */
const CLOUD_ONLY_PREFIXES = ["/login", "/signup", "/auth"];

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
    // Cloud-only routes don't exist in Edge. Redirect them to the paste-key
    // connect page instead of 404'ing.
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
  // Lazy-load Supabase SSR so Edge builds don't need its env vars.
  const { createServerClient } = await import("@supabase/ssr");

  // Inject the current request path as a header so RSC layouts can build
  // accurate `?redirect=` URLs when bouncing unauthenticated users to
  // /login. Without this the parent `(app)/layout.tsx` would have to
  // hard-code a fallback and lose whatever subpage the user was after.
  const buildHeaders = () => {
    const h = new Headers(request.headers);
    h.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
    return h;
  };

  let response = NextResponse.next({ request: { headers: buildHeaders() } });
  applyLocale(request, response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request: { headers: buildHeaders() } });
          applyLocale(request, response);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in users bouncing on the auth pages → send to their workspace.
  if (
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup") &&
    user
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
