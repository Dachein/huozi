import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CloudLiveEvents } from "@/components/workspace/cloud-live-events";
import {
  cloudHistory,
  HUOZI_CLOUD_KEY_COOKIE,
  type HistoryEntry,
} from "@/lib/drive/mcp-client";

export const metadata: Metadata = {
  title: "History — huozi Cloud",
};

type SearchParams = {
  searchParams?: Promise<{ path?: string; before?: string; limit?: string }>;
};

export default async function CloudHistoryPage({ searchParams }: SearchParams) {
  const params = (await searchParams) ?? {};
  const path = params.path;
  const before = params.before;
  const limit = params.limit ? parseInt(params.limit, 10) : 20;

  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    const self =
      "/workspace/history" + (path ? `?path=${encodeURIComponent(path)}` : "");
    redirect(`/api/app/session/refresh?next=${encodeURIComponent(self)}`);
  }
  if (!path) redirect("/workspace");

  const histRes = await cloudHistory(key, path, { limit, before });

  return (
    <>
      <HistoryBody path={path} histRes={histRes} limit={limit} />
      <CloudLiveEvents mode="history" watchPath={path} />
    </>
  );
}

function Breadcrumb({ path }: { path: string }) {
  return (
    <div className="text-xs text-muted-foreground font-mono flex items-center flex-wrap gap-x-1.5 gap-y-1">
      <Link
        href="/workspace"
        className="hover:text-foreground transition-colors"
      >
        workspace
      </Link>
      <span className="text-border">/</span>
      <Link
        href={`/workspace/view?path=${encodeURIComponent(path)}`}
        className="hover:text-foreground transition-colors break-all"
      >
        {path}
      </Link>
      <span className="text-border">/</span>
      <span className="text-foreground">history</span>
    </div>
  );
}

function HistoryBody({
  path,
  histRes,
  limit,
}: {
  path: string;
  histRes:
    | {
        ok: true;
        data: {
          history: HistoryEntry[];
          has_more: boolean;
          next_before?: string;
        };
      }
    | { ok: false; errorCode: number; message: string };
  limit: number;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Breadcrumb path={path} />
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="font-serif text-2xl font-bold tracking-wide">History</h1>
          <Link
            href={`/workspace/view?path=${encodeURIComponent(path)}`}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            ← Back to file
          </Link>
        </div>
      </div>

      {!histRes.ok && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
          <strong>Error {histRes.errorCode}:</strong>{" "}
          <span className="text-muted-foreground">{histRes.message}</span>
        </div>
      )}

      {histRes.ok && histRes.data.history.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No commits touched this file.
        </div>
      )}

      {histRes.ok && histRes.data.history.length > 0 && (
        <>
          <ol className="space-y-3">
            {histRes.data.history.map((h) => (
              <HistoryRow key={h.commit_sha} entry={h} />
            ))}
          </ol>

          {histRes.data.has_more && histRes.data.next_before && (
            <div className="text-center">
              <Link
                href={`/workspace/history?path=${encodeURIComponent(path)}&before=${encodeURIComponent(histRes.data.next_before)}&limit=${limit}`}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Load older →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const when = new Date(entry.timestamp)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const opColor: Record<HistoryEntry["operation"], string> = {
    create: "text-accent",
    edit: "text-foreground",
    write: "text-foreground",
    delete: "text-red-500",
    batch: "text-accent",
    revert: "text-yellow-500",
  };
  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <code className="font-mono text-xs text-muted-foreground">
            {entry.commit_sha.slice(0, 10)}…
          </code>
          <span
            className={`text-[10px] uppercase tracking-wider font-semibold ${opColor[entry.operation]}`}
          >
            {entry.operation}
          </span>
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {when}
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-sm break-words min-w-0">{entry.message}</div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          <span className="font-mono">
            {entry.author.type}:{entry.author.id}
          </span>
          <span className="mx-2 text-border">·</span>
          <span className="text-accent">+{entry.additions}</span>
          <span className="text-border"> / </span>
          <span className="text-red-500">−{entry.deletions}</span>
        </div>
      </div>
    </li>
  );
}
