/**
 * Channel derivation — maps the raw `source` field on an inbox event
 * (plus the `from` address when it's email) to a small enum that drives
 * the colored chip + avatar tint in the list view.
 *
 * Why this lives here and not in the schema: `source` on inbox events is
 * already a normalized enum (`email | webhook | manual | slack`), but
 * within `source=email` we want to distinguish Gmail vs Outlook vs iCloud
 * vs everything else. That split is a function of the `from` domain and
 * is purely a display concern.
 */

export type Channel =
  | "gmail"
  | "outlook"
  | "icloud"
  | "email"
  | "webhook"
  | "manual"
  | "slack"
  | "unknown";

interface ChannelMeta {
  label: string;
  // Tailwind utility strings. We pre-pick a calm pastel per channel so the
  // mail list scans like Outlook's color-coded inbox without screaming.
  chipClass: string;
  dotClass: string;
  avatarClass: string;
}

export const CHANNEL_META: Record<Channel, ChannelMeta> = {
  gmail: {
    label: "Gmail",
    chipClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
    avatarClass: "bg-red-100 text-red-700",
  },
  outlook: {
    label: "Outlook",
    chipClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    avatarClass: "bg-blue-100 text-blue-700",
  },
  icloud: {
    label: "iCloud",
    chipClass: "bg-slate-50 text-slate-700 border-slate-200",
    dotClass: "bg-slate-400",
    avatarClass: "bg-slate-100 text-slate-700",
  },
  email: {
    label: "Email",
    chipClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotClass: "bg-indigo-500",
    avatarClass: "bg-indigo-100 text-indigo-700",
  },
  webhook: {
    label: "Webhook",
    chipClass: "bg-violet-50 text-violet-700 border-violet-200",
    dotClass: "bg-violet-500",
    avatarClass: "bg-violet-100 text-violet-700",
  },
  manual: {
    label: "Manual",
    chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    avatarClass: "bg-emerald-100 text-emerald-700",
  },
  slack: {
    label: "Slack",
    chipClass: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    dotClass: "bg-fuchsia-500",
    avatarClass: "bg-fuchsia-100 text-fuchsia-700",
  },
  unknown: {
    label: "Other",
    chipClass: "bg-muted text-muted-foreground border-border",
    dotClass: "bg-muted-foreground",
    avatarClass: "bg-muted text-muted-foreground",
  },
};

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const OUTLOOK_DOMAINS = new Set([
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "outlook.jp",
]);
const ICLOUD_DOMAINS = new Set(["icloud.com", "me.com", "mac.com"]);

export function deriveChannel(source: string, from: string): Channel {
  const s = source.toLowerCase();
  if (s === "webhook") return "webhook";
  if (s === "manual" || s === "self") return "manual";
  if (s === "slack") return "slack";
  if (s !== "email") return "unknown";

  const domain = extractDomain(from);
  if (!domain) return "email";
  if (GMAIL_DOMAINS.has(domain)) return "gmail";
  if (OUTLOOK_DOMAINS.has(domain)) return "outlook";
  if (ICLOUD_DOMAINS.has(domain)) return "icloud";
  return "email";
}

function extractDomain(from: string): string | null {
  // `from` may be "Name <user@host>" or "user@host" or bare.
  const m = from.match(/[^<\s@]+@([^>\s]+)/);
  return m ? m[1].toLowerCase() : null;
}

export function senderDisplay(from: string): string {
  // "Alice <alice@host>" → "Alice". Falls back to local-part, then to from.
  const named = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (named && named[1].trim()) return named[1].trim();
  const local = from.match(/^([^@<\s]+)@/);
  if (local) return local[1];
  return from || "(unknown)";
}

export function senderEmail(from: string): string {
  // "Alice <alice@host>" → "alice@host"; bare email or fallback → as-is.
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return from.trim();
}

export function senderInitials(display: string): string {
  const parts = display
    .split(/[\s._-]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]!.toUpperCase()).join("");
}
