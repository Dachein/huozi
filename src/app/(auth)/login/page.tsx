import { redirect } from "next/navigation";
import { isEdge } from "@/lib/edition";
import { LoginForm } from "./login-form";

/**
 * /login is Cloud-only — it talks to Supabase's email-OTP API.
 *
 * Edge deployments don't have a user table at all (single admin via
 * pasted API key), so on Edge we redirect straight to /cloud/connect
 * where the bootstrap key is pasted in.
 */
export default function LoginPage() {
  if (isEdge()) {
    redirect("/cloud/connect");
  }
  return <LoginForm />;
}
