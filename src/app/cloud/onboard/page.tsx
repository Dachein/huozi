import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getLocale } from "@/lib/i18n/server";
import { getIdentity } from "@/lib/identity";
import { OnboardForm } from "@/components/cloud/onboard-form";

export const metadata: Metadata = {
  title: "Create your workspace — huozi Cloud",
  description: "Pick a name for your huozi Cloud workspace.",
};

export default async function CloudOnboardPage() {
  const locale = await getLocale();
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();

  // Not signed in → send to login, then back here.
  if (!principal) {
    redirect("/login?redirect=/cloud/onboard");
  }

  // Already has a workspace → jump to it.
  const existing = await identity.getPrimaryWorkspace();
  if (existing) {
    redirect("/cloud/workspace");
  }

  // Suggest a slug from the user's email prefix (or display label).
  const seed = principal.email?.split("@")[0] ?? principal.displayLabel ?? "my";
  const suggestedSlug = seed
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader locale={locale} />
      <main className="flex-1">
        <div className="mx-auto max-w-lg px-6 py-16">
          <div className="mb-8 text-center">
            <p className="text-xs uppercase tracking-wider text-accent mb-2">
              huozi Cloud · Welcome
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-wide">
              Name your workspace
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              A workspace holds your files and the commit history of every
              change an Agent makes to them. The name becomes part of your
              URL and your API keys.
            </p>
          </div>

          <OnboardForm suggestedSlug={suggestedSlug} />

          <div className="mt-10 pt-6 border-t border-border/50 text-xs text-muted-foreground space-y-1.5">
            <p>
              <strong className="text-foreground">Signed in as</strong>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {principal.email ?? principal.displayLabel}
              </code>
            </p>
            <p>
              You can connect multiple Agents (Claude Code / Cursor / Claude
              Desktop) to this workspace after it&rsquo;s created.
            </p>
            <p>
              <Link
                href="/cloud/connect"
                className="underline hover:text-foreground"
              >
                Already have an API key? Paste it instead →
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
