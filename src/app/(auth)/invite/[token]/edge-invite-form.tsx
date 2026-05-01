/**
 * Edge edition invite acceptance form.
 *
 * The form posts directly to `/auth/edge-invite-redeem` (Worker, served
 * via wrangler routes pattern `/auth/*`). On success the worker creates
 * the user + credentials + membership atomically, marks the invite
 * accepted, sets a session cookie, and 303s to /workspace. On failure
 * it 303s back to /invite/<token>?error=<code> so this same page
 * re-renders with an inline message.
 *
 * Why email is editable: Edge treats email as username — the invite
 * URL is the trust anchor (high-entropy, single-use), not the email
 * being verified. Inviter may have typed the address slightly off; the
 * invitee can correct it before claiming the slot.
 */

interface Props {
  token: string;
  suggestedEmail: string;
  workspaceName: string;
  workspaceSlug: string;
  inviterEmail: string;
  errorCode: string | null;
}

export function EdgeInviteAcceptForm({
  token,
  suggestedEmail,
  workspaceName,
  workspaceSlug,
  inviterEmail,
  errorCode,
}: Props) {
  const message = errorMessage(errorCode);
  return (
    <div className="w-full max-w-md">
      <h1 className="font-serif text-2xl font-bold tracking-[0.08em] mb-2">
        Join the workspace
      </h1>
      <p className="text-sm text-muted-foreground mb-1">
        <span className="font-mono">{inviterEmail}</span> invited you to
      </p>
      <p className="font-medium mb-6">
        <span className="block text-base">{workspaceName}</span>
        <span className="block text-xs text-muted-foreground font-mono">
          {workspaceSlug}
        </span>
      </p>

      {message && (
        <div className="mb-5 rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <form
        method="POST"
        action="/auth/edge-invite-redeem"
        className="space-y-4"
      >
        <input type="hidden" name="token" value={token} />

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={suggestedEmail}
            autoComplete="username"
            className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm focus:outline-none focus:border-foreground/40"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            You can change this if the inviter typed it incorrectly.
          </p>
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium mb-2"
          >
            Set a password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm focus:outline-none focus:border-foreground/40"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Minimum 8 characters. Stored hashed.
          </p>
        </div>

        <button
          type="submit"
          className="w-full rounded-full bg-foreground text-background px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Create account and join
        </button>
      </form>
    </div>
  );
}

function errorMessage(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case "invalid_email":
      return "Please enter a valid email address.";
    case "weak_password":
      return "Password must be at least 8 characters.";
    case "email_taken":
      return "An account with this email already exists. Sign in instead, or pick a different email.";
    case "expired":
      return "This invite has expired. Ask the inviter to send a new one.";
    case "revoked":
      return "This invite has been revoked.";
    case "already_accepted":
      return "This invite was already used. Sign in instead.";
    case "invalid_invite":
      return "This invite link is no longer valid.";
    default:
      if (code.startsWith("db_error:")) {
        return "Couldn't create the account. Please try again.";
      }
      return "Couldn't accept the invite. Please try again.";
  }
}
