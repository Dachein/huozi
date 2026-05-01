import { isEdge } from "@/lib/edition";
import { LoginForm } from "./login-form";
import { EdgeLoginForm } from "./edge-login-form";

/**
 * /login renders different surfaces per edition:
 *   - Cloud → email-OTP flow (LoginForm, talks to Worker /auth/otp/*)
 *   - Edge  → email + password (EdgeLoginForm, posts to /auth/edge-login)
 *
 * Edge also uses /admin/setup (Worker-served) for first-run admin
 * provisioning and /invite/<token> for accepting invitations; both set
 * a session cookie directly so the user lands here only on subsequent
 * sign-ins.
 */

type SearchParams = {
  searchParams?: Promise<{ error?: string; email?: string }>;
};

export default async function LoginPage({ searchParams }: SearchParams) {
  if (isEdge()) {
    const params = (await searchParams) ?? {};
    return (
      <EdgeLoginForm
        errorCode={params.error ?? null}
        emailHint={params.email ?? ""}
      />
    );
  }
  return <LoginForm />;
}
