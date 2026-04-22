import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "huozi Cloud — An Agent-Native Hard Drive",
  description:
    "A cloud workspace for Agents. Speaks Claude Code's file-tool dialect. Bring your own Agent — Claude Code, Cursor, Codex, or your own — and mount it anywhere.",
  openGraph: {
    title: "huozi Cloud — An Agent-Native Hard Drive",
    description:
      "A cloud workspace for Agents. Speaks Claude Code's file-tool dialect.",
    siteName: "活字 Huozi",
  },
  twitter: {
    card: "summary_large_image",
  },
};

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-muted p-4 pr-12 text-sm overflow-x-auto">
        <code className={lang ? `language-${lang}` : undefined}>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function Status({ kind }: { kind: "shipping" | "coming" | "preview" }) {
  const map = {
    shipping: { text: "Shipping", cls: "bg-accent/15 text-accent" },
    coming: { text: "Coming soon", cls: "bg-muted-foreground/15 text-muted-foreground" },
    preview: { text: "Preview", cls: "bg-muted-foreground/15 text-muted-foreground" },
  };
  const { text, cls } = map[kind];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${cls}`}>
      {text}
    </span>
  );
}

export default async function CloudPage() {
  const locale = await getLocale();
  const isCJK = locale === "zh" || locale === "ja";

  return (
    <div className="flex flex-col min-h-screen">

      <main className="flex-1">
        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/3 left-0 right-0 h-64 animate-mist"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 50% 50%, var(--border), transparent)",
              }}
            />
          </div>

          <div className="relative z-10 text-center max-w-3xl">
            <div className="mb-6 flex items-center justify-center gap-3">
              <Status kind="preview" />
              <span className="text-xs text-muted-foreground">
                cloud.huozi.app
              </span>
            </div>

            <h1
              className={`font-serif font-bold leading-tight animate-ink-reveal ${
                isCJK
                  ? "text-4xl sm:text-5xl md:text-6xl tracking-[0.15em]"
                  : "text-3xl sm:text-4xl md:text-5xl tracking-[0.06em]"
              }`}
            >
              <span className="text-accent">云</span> huozi Cloud
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed animate-ink-reveal delay-200">
              An Agent-native hard drive.
              <br />
              <span className="text-sm sm:text-base">
                Speaks Claude Code&rsquo;s file-tool dialect. Bring your own
                Agent. Agents write, humans read.
              </span>
            </p>

            <div className="mt-10 mb-4 flex items-center justify-center gap-4 animate-ink-reveal-slow delay-400">
              <span className="block w-16 h-px bg-border" />
              <span className="text-accent text-lg font-serif">载</span>
              <span className="block w-16 h-px bg-border" />
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/workspace"
                className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Open my workspace
              </Link>
              <a
                href="#try-it"
                className="rounded-full border border-border px-5 py-2 text-sm font-medium hover:border-foreground/30 transition-colors"
              >
                Connect an Agent
              </a>
              <Link
                href="/docs"
                className="rounded-full border border-border px-5 py-2 text-sm font-medium hover:border-foreground/30 transition-colors"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </section>

        {/* The metaphor */}
        <section className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-4">
            The external hard drive, for Agents
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            A USB drive works anywhere because it speaks one standard interface.
            You plug it in, and any computer reads it. Any OS, any era.
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            We wanted the same for Agents. <strong className="text-foreground">huozi
            Cloud</strong> is a mountable cloud workspace that speaks the exact file-tool
            dialect Claude Code uses today — which means every Agent already
            trained on that dialect (Claude Code itself, Cursor, Codex, custom
            ones) can work in it with <em>zero modifications</em>.
          </p>

          <div className="mt-8 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">
                    Physical hard drive
                  </th>
                  <th className="px-4 py-3 text-left font-medium">huozi Cloud</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <Row a="USB / SATA protocol" b="MCP + Claude Code tool dialect" />
                <Row a="Drive letter / mount" b="Workspace URI" />
                <Row a="Directory permissions" b="Scope (per-API-key prefix)" />
                <Row a="Filesystem journal" b="Git-backed commit log" />
                <Row a="Mounted on any machine" b="Accessed by any Agent" />
              </tbody>
            </table>
          </div>
        </section>

        {/* What's shipped today */}
        <section className="mx-auto max-w-3xl px-6 py-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide">
              What&rsquo;s alive today
            </h2>
            <Status kind="shipping" />
          </div>

          <p className="text-muted-foreground leading-relaxed mb-8">
            Seven MCP tools, exposed at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
              https://cloud.huozi.app/mcp
            </code>
            . Five are bit-exact mirrors of Claude Code; two are cloud-native
            extensions.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <ToolCard
              name="huozi_read"
              desc="Line-paged read, cat -n output, file_unchanged cache, base64 or signed-URL binary return."
              ccMirror
            />
            <ToolCard
              name="huozi_edit"
              desc="Exact string replacement. Read-before-Edit enforced. blob_sha staleness. structuredPatch output."
              ccMirror
            />
            <ToolCard
              name="huozi_write"
              desc="Create or overwrite. LF-forced. create/update distinction on result."
              ccMirror
            />
            <ToolCard
              name="huozi_glob"
              desc="Glob pattern matching. mtime-desc ordering. 100-file truncation."
              ccMirror
            />
            <ToolCard
              name="huozi_grep"
              desc="Regex search. content / files_with_matches / count modes. -A/-B/-C context. type filter."
              ccMirror
            />
            <ToolCard
              name="huozi_batch_edit"
              desc="Atomic N-file edit. all_or_nothing + single commit_sha. Per-file results."
              extension
            />
            <ToolCard
              name="huozi_history"
              desc="Query a file's commit trail. operation classification (create / edit / write / batch). Pagination."
              extension
            />
          </div>

          <div className="mt-10">
            <h3 className="text-lg font-semibold mb-4">Under the hood</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Cloudflare Workers</strong>{" "}
                as the serverless MCP endpoint (JSON-RPC 2.0 over HTTP).
              </li>
              <li>
                <strong className="text-foreground">R2</strong> stores blobs
                addressed by Git-compatible SHA-1 (same algorithm as real
                Git&rsquo;s <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">blob &lt;size&gt;\0&lt;content&gt;</code>).
              </li>
              <li>
                <strong className="text-foreground">D1</strong> holds{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  files_current
                </code>{" "}
                index, commit chain, per-path audit rows, and API keys.
              </li>
              <li>
                <strong className="text-foreground">Durable Objects</strong>{" "}
                serialize the write-side critical section (one DO per
                workspace) and persist per-session{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  ReadFileState
                </code>{" "}
                across requests (one DO per &#123;workspace, principal&#125;).
              </li>
              <li>
                <strong className="text-foreground">Bearer auth</strong>: a
                token hashes to an api_keys row; that row binds the call to a
                workspace, principal, and optional scope prefix.
              </li>
            </ul>
          </div>
        </section>

        {/* Design principles */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-6">
            Design principles
          </h2>

          <ol className="space-y-6">
            <Principle
              n={1}
              title="CC-dialect bit-exact"
              body="Every Agent trained on Claude Code's tool surface should work here with zero code changes. Field names, defaults, error codes, even load-bearing error strings are preserved. Wherever we deviate from CC — we do it with a reason on the record."
            />
            <Principle
              n={2}
              title="Git is the truth; everything else is cache"
              body="The commit log is the source of ground truth. D1 indices, Durable Object state, in-Worker caches — all are reconstructible from the Git history. This simplifies recovery, debugging, and backup."
            />
            <Principle
              n={3}
              title="Workspace = mount point"
              body="No shared global namespace. A workspace is a closed box with its own ACL, its own history, its own backup boundary. Users create workspaces; Agents live within one."
            />
            <Principle
              n={4}
              title="Revert-only, forever"
              body="No force-push. No history rewrite. No admin override. Every 'undo' creates a new commit that cancels the old one. The audit trail is immutable. This is non-negotiable for compliance-grade use cases."
            />
            <Principle
              n={5}
              title="All-or-nothing batches"
              body="Writing 10 files as one logical change should produce one commit, not ten. huozi_batch_edit validates staleness across the whole batch before writing anything — partial failures abort the entire commit."
            />
            <Principle
              n={6}
              title="Strict matching, no whitespace fallback"
              body="Claude Code's Edit tool fails hard when old_string doesn't match exactly. The official MCP filesystem server, by contrast, silently falls back to whitespace-tolerant matching — and quietly edits the wrong location under concurrent writes. We side with CC. Strict fail, explicit re-read."
            />
          </ol>
        </section>

        {/* Coming soon */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide">
              On the roadmap
            </h2>
            <Status kind="coming" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Roadmap
              label="Scope enforcement"
              desc="API-key-bound subdirectory sandboxing. An Agent scoped to funds/fund-A/ physically cannot read funds/fund-B/."
            />
            <Roadmap
              label="Secret scanner"
              desc="Inline scan at write time. ~20 built-in rules (AWS / OpenAI / GitHub / JWT / private keys) + placeholder allowlist."
            />
            <Roadmap
              label="Production-grade Grep"
              desc="D1 FTS5 trigram index for fast regex; stream-scan fallback for multiline / complex patterns; 5 MB / 50 MB / 10 s safety caps."
            />
            <Roadmap
              label="Real Git commit hashes"
              desc="isomorphic-git on Cloudflare Worker. Commit SHA equals what local Git would produce."
            />
            <Roadmap
              label="Notebook editing"
              desc="huozi_notebook_edit tool for .ipynb cells. Until then, notebooks are read-only."
            />
            <Roadmap
              label="Revert tool"
              desc="huozi_revert by commit_sha or message_uuid. New commit cancels old; history preserved."
            />
            <Roadmap
              label="Multi-workspace search"
              desc="Organization concept layered above workspaces. Lets a fund manager search across all their funds at once."
            />
            <Roadmap
              label="Live subscribers"
              desc="WebSocket push from WorkspaceDO. When Agent A commits, Agent B gets a changed-files notification in real time."
            />
          </div>
        </section>

        {/* Try it */}
        <section
          id="try-it"
          className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50"
        >
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-6">
            Try it
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Private beta. Get in touch for a Bearer token bound to your
            workspace. Once you have one, pick your Agent:
          </p>

          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 mt-8">
            Claude Code
          </h3>
          <CodeBlock
            code={`claude mcp add huozi-cloud -- \\
  npx -y mcp-remote https://cloud.huozi.app/mcp \\
  --header "Authorization: Bearer hz_YOUR_TOKEN"`}
          />

          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 mt-8">
            Claude Desktop
          </h3>
          <CodeBlock
            code={`// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "huozi-cloud": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://cloud.huozi.app/mcp",
        "--header", "Authorization: Bearer hz_YOUR_TOKEN"
      ]
    }
  }
}`}
          />

          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 mt-8">
            Raw HTTP
          </h3>
          <CodeBlock
            code={`curl -X POST https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_YOUR_TOKEN" \\
  -H "content-type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
          />
        </section>

        {/* Who it's for */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-6">
            Who it&rsquo;s for
          </h2>

          <div className="space-y-6">
            <Persona
              title="Agents doing real work"
              body="Anything you&rsquo;d trust with Read/Edit/Write on your laptop — research agents, code agents, report writers — can now do it across machines, across sessions, with every change audited."
            />
            <Persona
              title="Teams running many Agents"
              body="One workspace, multiple Agents, multiple humans. The staleness model keeps concurrent writers honest. The commit log shows who did what."
            />
            <Persona
              title="Compliance-sensitive workflows"
              body="Financial research, legal memos, regulated documentation. Immutable history, per-file audit, optional subdirectory scoping for analyst-level access."
            />
            <Persona
              title="Multi-device work"
              body="Start on your laptop. Continue on your iPad. Review on your phone. Your Agent&rsquo;s state — what it read, what it edited — follows you."
            />
          </div>
        </section>

        {/* Footer signature */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-serif text-sm">
                <span className="text-accent">字</span> huozi ·{" "}
                <span className="text-accent">云</span> Cloud
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                A workspace for Agents. Built on Cloudflare.
              </p>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <Link href="/" className="hover:text-foreground transition-colors">
                huozi.app
              </Link>
              <Link
                href="/start"
                className="hover:text-foreground transition-colors"
              >
                Publish (MD/HTML)
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-muted-foreground">
          © huozi · built on Cloudflare Workers · MCP-native
        </div>
      </footer>
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────

function Row({ a, b }: { a: string; b: string }) {
  return (
    <tr>
      <td className="px-4 py-3 text-muted-foreground">{a}</td>
      <td className="px-4 py-3">{b}</td>
    </tr>
  );
}

function ToolCard({
  name,
  desc,
  ccMirror,
  extension,
}: {
  name: string;
  desc: string;
  ccMirror?: boolean;
  extension?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-5 hover:border-foreground/20 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <code className="font-mono text-sm font-semibold">{name}</code>
        {ccMirror && (
          <span className="text-[10px] uppercase tracking-wider text-accent">
            CC-mirror
          </span>
        )}
        {extension && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            huozi-ext
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function Principle({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-5">
      <span className="flex-shrink-0 font-serif text-2xl font-bold text-accent leading-none pt-1">
        {n}
      </span>
      <div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </li>
  );
}

function Roadmap({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{label}</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function Persona({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
