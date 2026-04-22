import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Get Started — huozi Cloud",
  description:
    "Connect Claude Code / Cursor / Claude Desktop to a huozi Cloud workspace in 60 seconds.",
  openGraph: {
    title: "Get Started — 活字 Huozi",
    description:
      "Connect your Agent to a huozi Cloud workspace in 60 seconds.",
    siteName: "活字 Huozi",
  },
  twitter: {
    card: "summary_large_image",
  },
};

function CopyBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-muted p-4 pr-12 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold">
          {n}
        </span>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="ml-11">{children}</div>
    </section>
  );
}

export default async function StartPage() {
  const locale = await getLocale();

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <h1 className="text-4xl font-bold tracking-tight">Get started</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Claim a workspace → connect an Agent → write files in seconds.
          </p>

          <Step n={1} title="Sign in and pick a workspace name">
            <p className="text-sm text-muted-foreground mb-4">
              Email-OTP login, then a single-screen onboarding to pick your
              slug. Your workspace lives at{" "}
              <code className="font-mono text-xs bg-muted px-1 rounded">
                huozi.app/&lt;your-slug&gt;
              </code>
              .
            </p>
            <Link
              href="/onboard"
              className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Open onboarding →
            </Link>
          </Step>

          <Step n={2} title="Generate an API key for your Agent">
            <p className="text-sm text-muted-foreground mb-4">
              Visit{" "}
              <Link
                href="/workspace/connect"
                className="underline hover:text-foreground"
              >
                Connect an Agent
              </Link>
              , pick Claude Code / Cursor / Claude Desktop / Raw HTTP, and
              copy the ready-made config snippet. One key per Agent; revoke
              any time from{" "}
              <Link
                href="/workspace/keys"
                className="underline hover:text-foreground"
              >
                Keys
              </Link>
              .
            </p>
          </Step>

          <Step n={3} title="Write a file">
            <p className="text-sm text-muted-foreground mb-4">
              From the Agent&rsquo;s side — any MCP client that speaks
              Claude Code&rsquo;s file-tool dialect just works:
            </p>
            <CopyBlock
              code={`# In Claude Code, just ask:
> write a README.md explaining the project

# Or call the tool directly:
> huozi_write({ file_path: "README.md", content: "# Hello" })`}
            />
          </Step>

          <Step n={4} title="Watch it land, live">
            <p className="text-sm text-muted-foreground mb-4">
              Open{" "}
              <Link
                href="/workspace"
                className="underline hover:text-foreground"
              >
                your workspace
              </Link>{" "}
              in a browser. The file tree updates in ~100&nbsp;ms of each
              write, every file has a full commit history, and the Recent
              panel shows every Agent&rsquo;s edits in real-time.
            </p>
          </Step>

          <section className="mt-16">
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">
                Raw MCP / HTTP reference
              </summary>
              <div className="mt-4 space-y-4">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  Claude Code
                </h3>
                <CopyBlock
                  code={`claude mcp add --transport http huozi https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_your_key"`}
                />
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  Cursor · ~/.cursor/mcp.json
                </h3>
                <CopyBlock
                  code={JSON.stringify(
                    {
                      mcpServers: {
                        huozi: {
                          url: "https://cloud.huozi.app/mcp",
                          headers: { Authorization: "Bearer hz_your_key" },
                        },
                      },
                    },
                    null,
                    2,
                  )}
                />
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  Raw HTTP (JSON-RPC 2.0)
                </h3>
                <CopyBlock
                  code={`curl -X POST https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": {
      "name": "huozi_write",
      "arguments": { "file_path": "hello.md", "content": "# Hello" }
    }
  }'`}
                />
              </div>
            </details>
          </section>

          <section className="mt-16 mb-12">
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/docs"
                className="flex-1 rounded-lg border border-border p-6 hover:border-foreground/20 transition-colors"
              >
                <h3 className="font-semibold mb-1">MCP reference</h3>
                <p className="text-sm text-muted-foreground">
                  Every tool, schemas, and real-time events.
                </p>
              </Link>
              <Link
                href="/cloud"
                className="flex-1 rounded-lg border border-border p-6 hover:border-foreground/20 transition-colors"
              >
                <h3 className="font-semibold mb-1">About huozi Cloud</h3>
                <p className="text-sm text-muted-foreground">
                  Why Agents need a shared drive with commit history.
                </p>
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
          An external hard drive, for Agents.
        </div>
      </footer>
    </div>
  );
}
