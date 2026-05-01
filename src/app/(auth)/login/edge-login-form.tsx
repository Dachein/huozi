/**
 * Edge edition login surface — email + password.
 *
 * No client-side handlers. The form posts directly to `/auth/edge-login`,
 * which is served by the huozi-cloud Worker (see wrangler routes pattern
 * `/auth/*`). The Worker validates credentials, sets a session cookie,
 * and 303s to /workspace; on failure it 303s back to /login?error=invalid.
 *
 * Cloud sees this nowhere — `LoginPage` switches at the edition gate.
 */

interface Props {
  errorCode: string | null;
  emailHint: string;
}

export function EdgeLoginForm({ errorCode, emailHint }: Props) {
  const message = errorMessage(errorCode);
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-serif text-3xl font-bold tracking-wide mb-2">
        <span className="text-accent">登</span> Sign in
      </h1>
      <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
        Enter the email and password you set during admin setup or invite.
      </p>

      {message && (
        <div className="mb-5 rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <form method="POST" action="/auth/edge-login" className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={emailHint}
            autoComplete="username"
            className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm focus:outline-none focus:border-foreground/40"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm focus:outline-none focus:border-foreground/40"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}

function errorMessage(code: string | null): string | null {
  switch (code) {
    case "invalid":
      return "Invalid email or password.";
    case null:
      return null;
    default:
      // Unknown code — show generic so we never leak server-side detail.
      return "Couldn't sign in. Please try again.";
  }
}
