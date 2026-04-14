import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod/v4";

const VerifySchema = z.object({
  email: z.email(),
  code: z.string().min(6).max(8),
});

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email and verification code required." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "email",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data.session) {
    return NextResponse.json(
      { error: "Verification failed." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: "Email verified successfully.",
    access_token: data.session.access_token,
    user_id: data.user?.id,
  });
}
