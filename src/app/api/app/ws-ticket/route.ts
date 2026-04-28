/**
 * GET /api/app/ws-ticket
 *
 * Proxy for huozi-cloud's POST /events/mint-ticket. The browser can't call
 * cloud.huozi.app with the HttpOnly cookie (different origin); it calls this
 * same-origin route instead, which reads the cookie and forwards the API key
 * as a Bearer token to cloud. The ticket is single-use, 60s TTL, so returning
 * it to the browser is safe.
 *
 * Response shape:
 *   { ok: true, ws_url, expires_in } — ws_url includes the ticket; the
 *   browser opens it directly.
 *   { ok: false, error } on failure (401 if no cookie).
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { cloudFetch } from "@/lib/cloud-fetch";

// Public URL is still needed to derive the wss:// endpoint we hand to the
// browser — browsers can't reach service bindings, so the websocket has
// to dial the real public origin.
const CLOUD_PUBLIC_URL =
  process.env.HUOZI_CLOUD_URL ?? "https://cloud.huozi.app";

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "no_session", message: "Not connected to a workspace." },
      { status: 401 },
    );
  }

  let res: Response;
  try {
    res = await cloudFetch("/events/mint-ticket", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream_unreachable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    return NextResponse.json(
      { ok: false, error: "mint_failed", status: res.status, body },
      { status: res.status === 401 ? 401 : 502 },
    );
  }

  const body = (await res.json()) as {
    ok?: boolean;
    ticket?: string;
    expires_in?: number;
  };
  if (!body.ok || !body.ticket) {
    return NextResponse.json(
      { ok: false, error: "bad_response" },
      { status: 502 },
    );
  }

  // Derive wss:// URL from the public cloud URL (works for both localhost
  // http and prod https). Browsers can't use service bindings, so we hand
  // them the real origin.
  const wsUrl = CLOUD_PUBLIC_URL.replace(/^http/, "ws") + "/events/ws?ticket=" + encodeURIComponent(body.ticket);

  return NextResponse.json({
    ok: true,
    ws_url: wsUrl,
    expires_in: body.expires_in ?? 60,
  });
}
