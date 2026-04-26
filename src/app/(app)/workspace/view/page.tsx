import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { FileRenderer } from "@/components/workspace/file-renderer";
import { CloudLiveEvents } from "@/components/workspace/cloud-live-events";
import { LiveUpdateBanner } from "@/components/workspace/live-update-banner";
import { FileActionsMenu } from "@/components/workspace/file-actions-menu";
import { FullscreenProvider } from "@/components/workspace/fullscreen-context";
import { FullscreenToggleButton } from "@/components/workspace/fullscreen-toggle-button";
import {
  FullscreenContent,
  type FullscreenMode,
} from "@/components/workspace/fullscreen-content";
import { PageOutlineMenu } from "@/components/workspace/page-outline-menu";
import { extractPages } from "@/lib/html/extract-pages";
import { getLocale } from "@/lib/i18n/server";
import {
  cloudGlob,
  cloudRead,
  cloudRecent,
  HUOZI_CLOUD_KEY_COOKIE,
  stripCatN,
  type McpResult,
  type ReadTextData,
} from "@/lib/drive/mcp-client";

export const metadata: Metadata = {
  title: "View — huozi Cloud",
};

/** When the server refuses a full read on size, we fall back to this. */
const DEFAULT_PAGE_LINES = 1000;

type SearchParams = {
  searchParams?: Promise<{
    path?: string;
    view?: string;
    offset?: string;
    limit?: string;
  }>;
};

export default async function CloudFileView({ searchParams }: SearchParams) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const path = params.path;
  const wantRaw = params.view === "raw";
  const paramOffset = params.offset ? parseInt(params.offset, 10) : undefined;
  const paramLimit = params.limit ? parseInt(params.limit, 10) : undefined;

  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    const self =
      "/workspace/view" + (path ? `?path=${encodeURIComponent(path)}` : "");
    redirect(`/api/app/session/refresh?next=${encodeURIComponent(self)}`);
  }
  if (!path) redirect("/workspace");

  // Tree always needs the file list.
  const [globRes, readResInitial, recentRes] = await Promise.all([
    cloudGlob(key, "**/*"),
    cloudRead(key, path, { offset: paramOffset, limit: paramLimit }),
    cloudRecent(key, 20),
  ]);
  const recent = recentRes.ok ? recentRes.entries : [];

  // Auto-fallback: if the server said FILE_TOO_LARGE on a default (unpaginated)
  // read, re-request with a sensible page size. This keeps the Web UI usable
  // for large files without requiring the user to know about pagination.
  let readRes = readResInitial;
  let didAutoPaginate = false;
  if (
    !readRes.ok &&
    readRes.errorCode === 10 && // FILE_TOO_LARGE
    paramOffset === undefined &&
    paramLimit === undefined
  ) {
    readRes = await cloudRead(key, path, {
      offset: 1,
      limit: DEFAULT_PAGE_LINES,
    });
    didAutoPaginate = true;
  }

  const paths = globRes.ok ? globRes.data.filenames : [];
  const numFiles = globRes.ok ? globRes.data.numFiles : 0;
  const truncated = globRes.ok ? globRes.data.truncated : false;

  // Resolved offset/limit (what the actual request used)
  const effectiveOffset = paramOffset ?? (didAutoPaginate ? 1 : undefined);
  const effectiveLimit = paramLimit ?? (didAutoPaginate ? DEFAULT_PAGE_LINES : undefined);
  const paginated = effectiveOffset !== undefined || effectiveLimit !== undefined;

  return (
    <div className="flex flex-col min-h-screen">
      <WorkspaceShell
        paths={paths}
        numFiles={numFiles}
        truncated={truncated}
        currentPath={path}
        recent={recent}
      >
        <FileView
          path={path}
          readRes={readRes}
          wantRaw={wantRaw}
          paginated={paginated}
          didAutoPaginate={didAutoPaginate}
          offset={effectiveOffset}
          limit={effectiveLimit}
        />
      </WorkspaceShell>
      <CloudLiveEvents mode="file" watchPath={path} />
    </div>
  );
}

async function FileView({
  path,
  readRes,
  wantRaw,
  paginated,
  didAutoPaginate,
  offset,
  limit,
}: {
  path: string;
  readRes: McpResult<ReadTextData>;
  wantRaw: boolean;
  paginated: boolean;
  didAutoPaginate: boolean;
  offset: number | undefined;
  limit: number | undefined;
}) {
  const fileName = path.split("/").pop() ?? path;
  const parentPath = path.includes("/")
    ? path.slice(0, path.lastIndexOf("/"))
    : "";
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const canRender = ["md", "mdx", "html", "htm", "json", "csv", "tsv"].includes(ext);
  const fullscreenMode: FullscreenMode = wantRaw
    ? null
    : ext === "md" || ext === "mdx"
      ? "reader"
      : ext === "html" || ext === "htm"
        ? "raw"
        : ext === "csv" || ext === "tsv"
          ? "grid"
          : null;

  const fileInfo = readRes.ok ? readRes.data.file : null;

  // For paginated HTML files, extract the page outline so the header can
  // render a "{N} pages ▾" dropdown. Empty array for everything else.
  const pages =
    !wantRaw &&
    (ext === "html" || ext === "htm") &&
    readRes.ok &&
    readRes.data.type === "text" &&
    readRes.data.file.content
      ? extractPages(readRes.data.file.content)
      : [];
  const pageUnit: "slide" | "page" =
    /huozi-(deck|story)/.test(
      readRes.ok && readRes.data.type === "text"
        ? (readRes.data.file.content ?? "")
        : "",
    )
      ? "slide"
      : "page";

  return (
    <FullscreenProvider>
      <div className="space-y-6">
        <LiveUpdateBanner watchPath={path} />
        {/* Path + actions */}
        <div>
          <Breadcrumb parentPath={parentPath} />
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-base sm:text-lg break-all min-w-0 flex-1">
              {fileName}
            </h1>
            <PageOutlineMenu pages={pages} unit={pageUnit} />
            <FullscreenToggleButton enabled={fullscreenMode !== null} />
            <FileActionsMenu
              path={path}
              wantRaw={wantRaw}
              offset={offset}
              limit={limit}
              canRender={canRender}
              totalLines={fileInfo?.totalLines ?? null}
              size={fileInfo?.size ?? null}
              mimeType={fileInfo?.mimeType ?? null}
              blobSha={fileInfo?.blob_sha ?? null}
            />
          </div>
        </div>

        {/* Auto-pagination banner */}
        {didAutoPaginate && (
          <div className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Large file — showing a page.</strong>{" "}
            This file exceeds the default inline-read size (256 KB). The viewer
            auto-requested the first {limit} lines. Use the page controls below
            to navigate.
          </div>
        )}

        {/* Error */}
        {!readRes.ok && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
            <strong>Error {readRes.errorCode}:</strong>{" "}
            <span className="text-muted-foreground">{readRes.message}</span>
          </div>
        )}

        {/* Content */}
        {readRes.ok && (
          <>
            <FullscreenContent mode={fullscreenMode}>
              <FileBody
                data={readRes.data}
                path={path}
                wantRaw={wantRaw}
                paginated={paginated}
              />
            </FullscreenContent>
            {readRes.ok && paginated && readRes.data.type === "text" && (
              <Pagination
                path={path}
                wantRaw={wantRaw}
                offset={offset ?? 1}
                limit={limit ?? DEFAULT_PAGE_LINES}
                totalLines={readRes.data.file.totalLines ?? 0}
                numLines={readRes.data.file.numLines ?? 0}
              />
            )}
          </>
        )}

        {/* Read-only-by-design hint */}
        <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
          <strong className="text-foreground">Need to modify this file?</strong>{" "}
          Ask your connected Agent (Claude Code, Cursor, Claude Desktop, or any
          MCP client). huozi Cloud&rsquo;s Web UI is read-only by design — all
          writes flow through a single audited commit path via MCP.
        </div>
      </div>
    </FullscreenProvider>
  );
}

function Breadcrumb({ parentPath }: { parentPath: string }) {
  const segs = parentPath ? parentPath.split("/") : [];
  return (
    <div className="text-xs text-muted-foreground font-mono flex items-center flex-wrap gap-x-1.5 gap-y-1">
      <Link
        href="/workspace"
        className="hover:text-foreground transition-colors"
      >
        workspace
      </Link>
      {segs.map((seg, i) => (
        <span key={i} className="flex items-center gap-x-1.5">
          <span className="text-border">/</span>
          <span>{seg}</span>
        </span>
      ))}
    </div>
  );
}

async function FileBody({
  data,
  path,
  wantRaw,
  paginated,
}: {
  data: ReadTextData;
  path: string;
  wantRaw: boolean;
  paginated: boolean;
}) {
  if (data.type === "file_unchanged") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        Session cache already has this file. Reload the page to force a fresh
        fetch.
        {data.file.blob_sha && (
          <>
            {" "}
            blob_sha:{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">
              {data.file.blob_sha.slice(0, 10)}…
            </code>
          </>
        )}
      </div>
    );
  }

  if (data.type === "binary_ref") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm space-y-2">
        <p>
          Binary file · {(data.file.size ?? 0).toLocaleString()} bytes · mime:{" "}
          <code className="font-mono text-xs">{data.file.mimeType ?? "?"}</code>
        </p>
        {data.file.url && (
          <a
            href={data.file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline break-all text-xs"
          >
            Open signed URL →
          </a>
        )}
      </div>
    );
  }

  if (data.type !== "text" || !data.file.content) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        No text preview available for type{" "}
        <code className="font-mono">{data.type}</code>.
      </div>
    );
  }

  const raw = stripCatN(data.file.content);

  return (
    <div className="space-y-3">
      {paginated && (
        <div className="text-xs text-muted-foreground">
          lines {data.file.startLine ?? 1}–
          {(data.file.startLine ?? 1) + (data.file.numLines ?? 0) - 1} of{" "}
          {data.file.totalLines ?? 0}
        </div>
      )}
      {paginated && !wantRaw && isStructured(path) && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          Rendered view on partial content may be incomplete (code blocks, lists
          spanning boundaries). Switch to <strong>Source</strong> if something
          looks off.
        </div>
      )}
      <FileRenderer path={path} content={raw} raw={wantRaw} />
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isStructured(path: string): boolean {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  return ["md", "mdx", "html", "htm"].includes(ext);
}

function Pagination({
  path,
  wantRaw,
  offset,
  limit,
  totalLines,
  numLines,
}: {
  path: string;
  wantRaw: boolean;
  offset: number;
  limit: number;
  totalLines: number;
  numLines: number;
}) {
  const hasPrev = offset > 1;
  const hasNext = offset + numLines <= totalLines;

  const buildUrl = (newOffset: number): string => {
    const qs = new URLSearchParams();
    qs.set("path", path);
    qs.set("offset", String(Math.max(1, newOffset)));
    qs.set("limit", String(limit));
    if (wantRaw) qs.set("view", "raw");
    return `/workspace/view?${qs.toString()}`;
  };

  const prevOffset = Math.max(1, offset - limit);
  const nextOffset = offset + limit;
  const lastPageStart = Math.max(1, totalLines - limit + 1);

  return (
    <nav className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs">
      <div className="flex items-center gap-2">
        <Link
          href={buildUrl(1)}
          className={`underline ${!hasPrev ? "pointer-events-none text-muted-foreground/40" : "hover:text-foreground text-muted-foreground"}`}
        >
          « First
        </Link>
        <span className="text-border">·</span>
        <Link
          href={buildUrl(prevOffset)}
          className={`underline ${!hasPrev ? "pointer-events-none text-muted-foreground/40" : "hover:text-foreground text-muted-foreground"}`}
        >
          ← Prev {limit}
        </Link>
      </div>
      <div className="font-mono text-muted-foreground">
        {offset}–{offset + numLines - 1} / {totalLines}
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={buildUrl(nextOffset)}
          className={`underline ${!hasNext ? "pointer-events-none text-muted-foreground/40" : "hover:text-foreground text-muted-foreground"}`}
        >
          Next {limit} →
        </Link>
        <span className="text-border">·</span>
        <Link
          href={buildUrl(lastPageStart)}
          className={`underline ${!hasNext ? "pointer-events-none text-muted-foreground/40" : "hover:text-foreground text-muted-foreground"}`}
        >
          Last »
        </Link>
      </div>
    </nav>
  );
}
