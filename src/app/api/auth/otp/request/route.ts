/**
 * POST /api/auth/otp/request
 *
 * Browser → Next.js (here) → Worker /auth/otp/request → Resend.
 * The Worker stores the OTP in D1 and emails the user. We just forward
 * the request and surface the result.
 */

import { NextResponse, type NextRequest } from "next/server";
import { workerOtpRequest } from "@/lib/auth/worker-client";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const result = await workerOtpRequest(email);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
