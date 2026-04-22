import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Docs — huozi Cloud",
  description:
    "huozi Cloud API reference — an Agent-native cloud drive that speaks MCP + Claude Code's file-tool dialect.",
};

function Code({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-[#1c1914] text-[#e8e0d0] p-4 pr-12 text-sm overflow-x-auto leading-relaxed">
        <code className={lang ? `language-${lang}` : undefined}>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold mt-16 mb-4 scroll-mt-20">
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </h2>
  );
}

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold mt-10 mb-3 scroll-mt-20">
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
      {children}
    </p>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border border-border rounded-lg">
        {children}
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-medium border-b border-border bg-muted">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-2.5 border-b border-border/60 align-top">
      {children}
    </td>
  );
}

export default async function DocsPage() {
  const locale = await getLocale();

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-4xl font-bold tracking-tight">Docs</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            huozi Cloud is an Agent-native cloud drive. It speaks MCP over
            HTTP and returns file-tool results bit-exact with Claude Code —
            any MCP client (Claude Code, Cursor, Claude Desktop, scripts)
            can use it as a shared workspace.
          </p>

          <H2 id="concepts">Concepts</H2>
          <Table>
            <thead>
              <tr>
                <Th>Term</Th>
                <Th>Meaning</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Workspace</Td>
                <Td>
                  A versioned, R2-backed file tree. Addressed as{" "}
                  <code className="font-mono text-xs bg-muted px-1">
                    ws_&lt;slug&gt;
                  </code>
                  .
                </Td>
              </tr>
              <tr>
                <Td>Connection</Td>
                <Td>
                  One API key issued to one Agent (Claude Code on your
                  laptop, a CI runner, etc). Revocable independently.
                </Td>
              </tr>
              <tr>
                <Td>Commit</Td>
                <Td>
                  Every write / edit / delete produces a commit. Queryable
                  per-file via the <code>huozi_history</code> tool.
                </Td>
              </tr>
              <tr>
                <Td>Scope</Td>
                <Td>
                  Optional path prefix glued to a key — the Agent sees the
                  workspace rooted at that prefix.
                </Td>
              </tr>
            </tbody>
          </Table>

          <H2 id="connecting">Connecting an Agent</H2>
          <P>
            Sign in at huozi.app, visit{" "}
            <Link
              href="/workspace/connect"
              className="underline hover:text-foreground"
            >
              /workspace/connect
            </Link>{" "}
            and pick your Agent — we generate a key and hand you a
            paste-ready config snippet.
          </P>
          <H3 id="claude-code">Claude Code</H3>
          <Code
            code={`claude mcp add --transport http huozi https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_your_key"`}
          />
          <H3 id="cursor">Cursor · ~/.cursor/mcp.json</H3>
          <Code
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
          <H3 id="desktop">Claude Desktop</H3>
          <P>
            Add to <code>claude_desktop_config.json</code>, then restart the
            app.
          </P>
          <Code
            code={JSON.stringify(
              {
                mcpServers: {
                  huozi: {
                    command: "npx",
                    args: [
                      "-y",
                      "mcp-remote",
                      "https://cloud.huozi.app/mcp",
                      "--header",
                      "Authorization: Bearer hz_your_key",
                    ],
                  },
                },
              },
              null,
              2,
            )}
          />

          <H2 id="tools">MCP tools</H2>
          <P>
            All tools return the exact shape Claude Code expects — drop
            huozi in and your Agent uses it like a local filesystem.
          </P>
          <Table>
            <thead>
              <tr>
                <Th>Tool</Th>
                <Th>Purpose</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>
                  <code className="font-mono">huozi_read</code>
                </Td>
                <Td>
                  Read a file with line-offset pagination. Returns
                  cat-n-style text, or <code>file_unchanged</code> when the
                  session already has it.
                </Td>
              </tr>
              <tr>
                <Td>
                  <code className="font-mono">huozi_write</code>
                </Td>
                <Td>Create or overwrite a file in one commit.</Td>
              </tr>
              <tr>
                <Td>
                  <code className="font-mono">huozi_edit</code>
                </Td>
                <Td>
                  Surgical string-based edit: <code>old_string</code> →{" "}
                  <code>new_string</code>. Required{" "}
                  <code>old_string</code> must be unique in the file or use{" "}
                  <code>replace_all</code>. Returns a unified patch.
                </Td>
              </tr>
              <tr>
                <Td>
                  <code className="font-mono">huozi_batch_edit</code>
                </Td>
                <Td>
                  N edits across one or many files, applied atomically as
                  one commit.
                </Td>
              </tr>
              <tr>
                <Td>
                  <code className="font-mono">huozi_glob</code>
                </Td>
                <Td>Fast path listing. Backed by D1 index.</Td>
              </tr>
              <tr>
                <Td>
                  <code className="font-mono">huozi_grep</code>
                </Td>
                <Td>
                  Regex search with FTS5 trigram pre-filter — 50× faster
                  than walking the tree.
                </Td>
              </tr>
              <tr>
                <Td>
                  <code className="font-mono">huozi_history</code>
                </Td>
                <Td>
                  Commit log for a file: sha, author, operation, +/-
                  lines, message.
                </Td>
              </tr>
            </tbody>
          </Table>

          <H2 id="raw-rpc">Raw JSON-RPC</H2>
          <P>
            For scripts that can&rsquo;t use an MCP client library, the
            endpoint is JSON-RPC 2.0 over POST.
          </P>
          <Code
            code={`curl -X POST https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": {
      "name": "huozi_write",
      "arguments": {
        "file_path": "notes/today.md",
        "content": "# Today\\n\\nWrote via curl."
      }
    }
  }'`}
          />

          <H2 id="events">Real-time events</H2>
          <P>
            Every commit broadcasts to WebSocket subscribers for the
            affected workspace. Used by the Web UI to keep the file tree
            and banner in sync.
          </P>
          <Code
            code={`# 1. Mint a 60-second ticket (auth via Bearer)
curl -X POST https://cloud.huozi.app/events/mint-ticket \\
  -H "Authorization: Bearer hz_your_key"
# → {"ok":true,"ticket":"tk_...","expires_in":60}

# 2. Open a WS with that ticket
wss://cloud.huozi.app/events/ws?ticket=tk_...

# 3. Messages: {"type":"hello",...} once, then {"type":"commit",...} per write.`}
          />

          <H2 id="links">See also</H2>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1.5">
            <li>
              <Link
                href="/cloud"
                className="underline hover:text-foreground"
              >
                huozi Cloud overview
              </Link>
            </li>
            <li>
              <Link
                href="/start"
                className="underline hover:text-foreground"
              >
                Get started
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/Dachein/huozi-edge"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                huozi Edge (open-source self-host)
              </a>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
