import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, detectLocale } from "@/lib/i18n";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // --- Locale detection ---
  const localeCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!localeCookie) {
    const detected = detectLocale(request.headers.get("accept-language"));
    supabaseResponse.cookies.set(COOKIE_NAME, detected, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          // Re-apply locale cookie if we just set it
          if (!localeCookie) {
            const detected = detectLocale(request.headers.get("accept-language"));
            supabaseResponse.cookies.set(COOKIE_NAME, detected, {
              path: "/",
              maxAge: 60 * 60 * 24 * 365,
              sameSite: "lax",
            });
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup") &&
    user
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/v1/).*)",
  ],
};
