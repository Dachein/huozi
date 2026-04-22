import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

export const metadata: Metadata = {
  title: "Connect — huozi Cloud",
  description: "Connect your huozi Cloud workspace with an API key.",
};

type SearchParams = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function CloudConnectPage({ searchParams }: SearchParams) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const existing = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;

  // Already connected? Go straight to the workspace.
  if (existing && !params.error) {
    redirect("/workspace");
  }

  return (
    <div className="flex flex-col min-h-screen">

      <main className="flex-1">
        <div className="mx-auto max-w-xl px-6 py-20">
          <h1 className="font-serif text-3xl font-bold tracking-wide mb-3">
            <span className="text-accent">云</span> Connect to huozi Cloud
          </h1>
          <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
            Paste your workspace API key. It&rsquo;s stored as an HttpOnly
            cookie, used only server-side to fetch your files.
          </p>

          {params.error && (
            <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
              <strong>Couldn&rsquo;t connect:</strong>{" "}
              <span className="text-muted-foreground">{params.error}</span>
            </div>
          )}

          <form
            method="POST"
            action="/api/app/connect"
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="api_key"
                className="block text-sm font-medium mb-2"
              >
                API key
              </label>
              <input
                id="api_key"
                name="api_key"
                type="password"
                autoComplete="off"
                required
                placeholder="hz_..."
                className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm font-mono focus:outline-none focus:border-foreground/40"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Starts with <code className="rounded bg-muted px-1">hz_</code>.
                Generated when your workspace was provisioned. In private beta
                we issue these manually — ping Dachein if you need one.
              </p>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Connect
            </button>
          </form>

          <div className="mt-10 border-t border-border/50 pt-8">
            <h2 className="text-sm font-semibold mb-3">
              How the key is used
            </h2>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                · Stored as an HttpOnly cookie — the browser JS can&rsquo;t read it.
              </li>
              <li>
                · Sent only to cloud.huozi.app/mcp from the huozi.app server
                (never exposed to third parties).
              </li>
              <li>
                · All page renders are server-side; the browser sees HTML only.
              </li>
              <li>
                · You can revoke the session any time via{" "}
                <Link
                  href="/workspace"
                  className="underline hover:text-foreground"
                >
                  the workspace page
                </Link>
                .
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
