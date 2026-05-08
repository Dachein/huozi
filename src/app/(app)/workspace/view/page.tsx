import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
import { ShareFullscreenButton } from "@/components/workspace/share-fullscreen-button";
import { extractPages } from "@/lib/html/extract-pages";
import { detectHuoziFormat } from "@/lib/html/detect-format";
import { getServerT } from "@/lib/i18n/server";
import {
  cloudRead,
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
  const t = await getServerT();
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

  const readResInitial = await cloudRead(key, path, {
    offset: paramOffset,
    limit: paramLimit,
  });

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

  // Resolved offset/limit (what the actual request used)
  const effectiveOffset = paramOffset ?? (didAutoPaginate ? 1 : undefined);
  const effectiveLimit = paramLimit ?? (didAutoPaginate ? DEFAULT_PAGE_LINES : undefined);
  const paginated = effectiveOffset !== undefined || effectiveLimit !== undefined;

  return (
    <>
      <FileView
        path={path}
        readRes={readRes}
        wantRaw={wantRaw}
        paginated={paginated}
        didAutoPaginate={didAutoPaginate}
        offset={effectiveOffset}
        limit={effectiveLimit}
        t={t}
      />
      <CloudLiveEvents mode="file" watchPath={path} />
    </>
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
  t,
}: {
  path: string;
  readRes: McpResult<ReadTextData>;
  wantRaw: boolean;
  paginated: boolean;
  didAutoPaginate: boolean;
  offset: number | undefined;
  limit: number | undefined;
  t: (key: string) => string;
}) {
  const fileName = path.split("/").pop() ?? path;
  const parentPath = path.includes("/")
    ? path.slice(0, path.lastIndexOf("/"))
    : "";
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const canRender = ["md", "mdx", "html", "htm", "json", "csv", "tsv", "jsonl"].includes(ext);
  const fullscreenMode: FullscreenMode = wantRaw
    ? null
    : ext === "md" || ext === "mdx"
      ? "reader"
      : ext === "html" || ext === "htm"
        ? "raw"
        : ext === "csv" || ext === "tsv" || ext === "jsonl"
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
  const fileContent =
    readRes.ok && readRes.data.type === "text"
      ? (readRes.data.file.content ?? "")
      : "";
  // Authoritative format detection (meta first, class sniff second, default
  // "web"). Drives FullscreenPager visibility + auto-landscape CSS for deck
  // on mobile portrait.
  const htmlFormat = detectHuoziFormat(fileContent);
  const pageUnit: "slide" | "page" =
    htmlFormat === "deck" || htmlFormat === "story" ? "slide" : "page";

  return (
    <FullscreenProvider>
      <div className="flex flex-col gap-6 flex-1 min-h-0">
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
        {!readRes.ok &&
          (readRes.errorCode === 403 && readRes.message === "acl_denied" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-5 py-4 space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-amber-700 dark:text-amber-400 font-mono text-xs tabular-nums">
                  403
                </span>
                <h2 className="text-base font-semibold">
                  {t("view.error.aclDenied.title")}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("view.error.aclDenied.body")}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
              <strong>
                {t("view.error.label")} {readRes.errorCode}:
              </strong>{" "}
              <span className="text-muted-foreground">{readRes.message}</span>
            </div>
          ))}

        {/* Content */}
        {readRes.ok && (
          <>
            <FullscreenContent
              mode={fullscreenMode}
              pages={pages}
              pageUnit={pageUnit}
              htmlFormat={htmlFormat}
              chrome={<ShareFullscreenButton path={path} />}
            >
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

        {/* Read-only-by-design hint — sticks to the bottom of the main
            column when content is short, pushed down by mt-auto;
            otherwise flows naturally below the content.
            Suppressed for Collection (.jsonl) files: the CollectionView
            already provides a footer-style timeline / version scrubber
            in the same screen real estate, and showing both creates
            redundant chrome. The read-only invariant is communicated
            implicitly there (no edit affordances on the timeline). */}
        {!path.endsWith(".jsonl") && (
          <div className="mt-auto rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            <strong className="text-foreground">{t("view.readOnly.title")}</strong>{" "}
            {t("view.readOnly.body")}
          </div>
        )}
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
    const mime = data.file.mimeType ?? "";
    const url = data.file.url;
    const fileName = path.split("/").pop() ?? path;

    if (mime.startsWith("image/") && url) {
      return (
        <div className="space-y-2">
          <img
            src={url}
            alt={fileName}
            className="max-w-full h-auto rounded-lg border border-border bg-muted/30"
          />
          <p className="text-xs text-muted-foreground font-mono">
            {(data.file.size ?? 0).toLocaleString()} bytes · {mime}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm space-y-2">
        <p>
          Binary file · {(data.file.size ?? 0).toLocaleString()} bytes · mime:{" "}
          <code className="font-mono text-xs">{mime || "?"}</code>
        </p>
        {url && (
          <a
            href={url}
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
      <FileRenderer
        path={path}
        content={raw}
        raw={wantRaw}
        inlineEditable={!wantRaw && !paginated}
        parentBlobSha={data.file.blob_sha ?? null}
      />
    </div>
  );
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
