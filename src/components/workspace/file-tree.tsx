"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { FileIcon } from "@/components/workspace/file-icon";
import { FolderAclModal } from "@/components/workspace/folder-acl-modal";
import { useWorkspaceNav } from "@/components/workspace/nav-pending";
import { useT } from "@/lib/i18n/context";
import { FOUR_TYPES, type FileType, getFileType } from "@/lib/file-types";

export interface MemberLite {
  user_id: string;
  email: string;
  display_name: string | null;
}

export interface FileTreeProps {
  /** Workspace-relative paths, e.g. "funds/fund-A/report.md" */
  paths: string[];
  /** Path currently being viewed (highlighted + ancestors auto-expanded). */
  currentPath?: string | null;
  /** Called after the user clicks a leaf — used by mobile shell to close the drawer. */
  onNavigate?: () => void;
  // ── Folder ACL surface ──────────────────────────────────────────────
  /** Set of path_prefixes (with trailing /) that have a private ACL.
   *  When null/undefined, the lock indicator + settings button are hidden. */
  privatePrefixes?: Set<string>;
  /** Workspace members; passed to the per-folder ACL modal as picker options. */
  members?: MemberLite[];
  /** Current viewer's user_id; the ACL modal uses this for "(you)" + self-include guard. */
  currentUserId?: string;
}

interface Node {
  name: string;
  path: string;
  isDir: boolean;
  children: Node[];
}

/** Build nested tree nodes from flat path list. */
function buildTree(
  paths: string[],
  includeAssetsRoot: boolean = true,
  topLevelProjects: ReadonlySet<string> = new Set(),
): Node {
  const root: Node = { name: "", path: "", isDir: true, children: [] };

  for (const p of paths) {
    const segs = p.split("/").filter(Boolean);
    let cur = root;
    let accum = "";
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      accum = accum ? `${accum}/${seg}` : seg;
      const isLast = i === segs.length - 1;
      let child = cur.children.find((c) => c.name === seg);
      if (!child) {
        child = {
          name: seg,
          path: accum,
          isDir: !isLast,
          children: [],
        };
        cur.children.push(child);
      }
      cur = child;
    }
  }

  // System folders — always surfaced at root (even when empty) so they're
  // one click away. Order: `__mail__/` then `__assets__/`, pinned above all
  // user dirs. Suppressed when a type filter is active.
  if (includeAssetsRoot) {
    for (const sysDir of SYSTEM_DIRS) {
      if (!root.children.find((c) => c.name === sysDir)) {
        root.children.push({
          name: sysDir,
          path: sysDir,
          isDir: true,
          children: [],
        });
      }
    }
  }

  // Sort:
  //   - At root: SYSTEM_DIRS (pinned, in declared order) → upgraded
  //     Projects (alpha) → other dirs (alpha) → files (alpha). The
  //     Project tier is the only one that needs an external set; we
  //     keep the helper local here.
  //   - Deeper levels: dirs first, then files, alpha within each.
  const sys = SYSTEM_DIRS as readonly string[];
  const sortNode = (n: Node, isRoot: boolean): void => {
    n.children.sort((a, b) => {
      if (isRoot) {
        const ai = sys.indexOf(a.name);
        const bi = sys.indexOf(b.name);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        if (a.isDir && b.isDir) {
          const ap = topLevelProjects.has(a.name) ? 0 : 1;
          const bp = topLevelProjects.has(b.name) ? 0 : 1;
          if (ap !== bp) return ap - bp;
        }
        return a.name.localeCompare(b.name);
      }
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) sortNode(c, false);
  };
  sortNode(root, true);

  return root;
}

const MAIL_DIR = "__mail__";
const CLIPPINGS_DIR = "__clippings__";
const ASSETS_DIR = "__assets__";

/** System-dir entries pinned at the top of the file tree. Each one
 *  intercepts the standard folder rendering and links to a dedicated
 *  route. Order here is render order in the sidebar. */
const SYSTEM_DIRS = [MAIL_DIR, CLIPPINGS_DIR, ASSETS_DIR] as const;

/** Per-system-dir UI metadata. Lookup powers the friendly label + icon
 *  shown in the sidebar (replacing the raw `__name__` and the generic
 *  folder glyph). The label key resolves through the i18n dict so each
 *  locale picks its own translation; falls back to the dir name if a
 *  key is missing. */
const SYSTEM_DIR_META: Record<
  string,
  { href: string; labelKey: string; icon: "mail" | "clippings" | "assets" }
> = {
  [MAIL_DIR]: { href: "/workspace/mail", labelKey: "ws.nav.mail", icon: "mail" },
  [CLIPPINGS_DIR]: {
    href: "/workspace/clippings",
    labelKey: "ws.nav.clippings",
    icon: "clippings",
  },
  [ASSETS_DIR]: {
    href: "/workspace/assets",
    labelKey: "ws.nav.assets",
    icon: "assets",
  },
};

/** Ancestors of a path like "a/b/c.ts" → ["a", "a/b"]. */
function ancestorDirs(path: string): string[] {
  const segs = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < segs.length; i++) {
    out.push(segs.slice(0, i).join("/"));
  }
  return out;
}

const LS_KEY = "huozi-cloud:tree-expanded";

function loadExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    // ignore
  }
  return new Set();
}

function saveExpanded(s: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify([...s]));
  } catch {
    // ignore
  }
}

export function FileTree({
  paths,
  currentPath: currentPathProp,
  onNavigate,
  privatePrefixes,
  members,
  currentUserId,
}: FileTreeProps) {
  // When the caller doesn't pass currentPath (the shared workspace shell
  // layout can't read searchParams from a Server Layout), derive it from
  // the URL on the client so the highlight updates as soon as the user
  // clicks a Link — before the new page.tsx finishes loading.
  const pathname = usePathname();
  const search = useSearchParams();
  const derivedPath =
    pathname === "/workspace/view" || pathname === "/workspace/history"
      ? (search.get("path") ?? null)
      : null;
  const currentPath = currentPathProp ?? derivedPath;

  const t = useT();

  // Type-filter state — chips above the search narrow the tree to one of
  // the four data-type categories (see app/docs/four-types.md).
  const [typeFilter, setTypeFilter] = useState<FileType | "all">("all");

  const counts = useMemo(() => {
    const c: Record<FileType, number> = {
      table: 0,
      document: 0,
      collection: 0,
      page: 0,
      other: 0,
    };
    for (const p of paths) c[getFileType(p)]++;
    return c;
  }, [paths]);

  // v3.3 §8 visibility rules: paths whose any segment starts with "."
  // (e.g. `.huozi/memory.jsonl`, `.archive/old-project/...`,
  // `.huozi-keep`) are hidden by default. Users can flip the toggle
  // below the tree to see them — UI state only, not persisted.
  const [showHidden, setShowHidden] = useState(false);

  const filteredPaths = useMemo(() => {
    const byType =
      typeFilter === "all"
        ? paths
        : paths.filter((p) => getFileType(p) === typeFilter);
    // Always strip sidecar-style generated files. Pre-clippings.jsonl
    // versions wrote `<source>.highlights.json` next to every annotated
    // file; surfacing those in the tree is noise even though the toggle
    // could theoretically un-hide them. Drop unconditionally.
    const withoutSidecars = byType.filter((p) => !p.endsWith(".highlights.json"));
    if (showHidden) return withoutSidecars;
    return withoutSidecars.filter(
      (p) => !p.split("/").some((seg) => seg.startsWith(".")),
    );
  }, [paths, typeFilter, showHidden]);

  // v-final — top-level folders whose sentinel `.huozi/memory.md`
  // exists in the path list are upgraded Projects. We always look at
  // the full `paths` (not `filteredPaths`) so the hide-dot toggle
  // doesn't strip the sentinel and lose the Project status.
  const topLevelProjects = useMemo(() => {
    const out = new Set<string>();
    for (const p of paths) {
      const segs = p.split("/");
      if (
        segs.length >= 3 &&
        segs[1] === ".huozi" &&
        segs[2] === "memory.md"
      ) {
        if (segs[0]) out.add(segs[0]);
      }
    }
    return out;
  }, [paths]);

  const root = useMemo(
    () => buildTree(filteredPaths, typeFilter === "all", topLevelProjects),
    [filteredPaths, typeFilter, topLevelProjects],
  );

  // Expanded folders live in state + localStorage.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [aclEditingPath, setAclEditingPath] = useState<string | null>(null);
  const aclEnabled = !!members && !!currentUserId;

  // Load on mount + expand ancestors of current path
  useEffect(() => {
    const base = loadExpanded();
    if (currentPath) {
      for (const anc of ancestorDirs(currentPath)) base.add(anc);
    }
    setExpanded(base);
    setHydrated(true);
  }, [currentPath]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveExpanded(next);
      return next;
    });
  }, []);

  const [query, setQuery] = useState("");
  const matching = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return new Set(paths.filter((p) => p.toLowerCase().includes(q)));
  }, [paths, query]);

  // When searching, auto-expand ancestors of matches so user sees them in context
  const searchExpanded = useMemo(() => {
    if (!matching) return null;
    const out = new Set<string>();
    for (const m of matching) {
      for (const anc of ancestorDirs(m)) out.add(anc);
    }
    return out;
  }, [matching]);

  const isOpen = (path: string): boolean => {
    if (searchExpanded) return searchExpanded.has(path);
    return expanded.has(path);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Type filter — the four data-type categories (see
          app/docs/four-types.md). Custom popover (matches the
          KeyTtlSelect / LocaleSwitcher family) instead of a native
          <select> so the OS-controlled chrome doesn't break the
          sidebar's visual rhythm. */}
      <div className="px-3 pt-3 pb-2 border-b border-border/40">
        <TypeFilter
          value={typeFilter}
          onChange={setTypeFilter}
          paths={paths}
          counts={counts}
          t={t}
        />
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border/50">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files…"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:border-foreground/40"
        />
      </div>

      {/* Tree */}
      <nav className="flex-1 overflow-y-auto p-2">
        {!hydrated ? (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        ) : root.children.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            No files yet.
          </div>
        ) : (
          <TreeNodeList
            nodes={root.children}
            depth={0}
            currentPath={currentPath ?? null}
            onToggle={toggle}
            isOpen={isOpen}
            matching={matching}
            onNavigate={onNavigate}
            privatePrefixes={privatePrefixes}
            topLevelProjects={topLevelProjects}
            onEditAcl={aclEnabled ? (p) => setAclEditingPath(p) : undefined}
          />
        )}
      </nav>

      {/* Footer controls — Projects overview link + Show-hidden toggle.
          Dot-prefixed paths (`.huozi`, `.archive`, `.huozi-keep`) are
          hidden by default per spec §8. UI state only, not persisted. */}
      <div className="px-3 py-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center gap-3">
        <Link
          href="/workspace/projects"
          className="hover:text-foreground transition-colors"
        >
          Projects
        </Link>
        <span className="text-muted-foreground/40">·</span>
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="hover:text-foreground transition-colors"
        >
          {showHidden ? "Hide dot files" : "Show hidden"}
        </button>
      </div>
      {aclEnabled && aclEditingPath !== null && (
        <FolderAclModal
          open={true}
          folderPath={aclEditingPath}
          members={members!}
          currentUserId={currentUserId!}
          onClose={() => setAclEditingPath(null)}
        />
      )}
    </div>
  );
}

interface TreeNodeListProps {
  nodes: Node[];
  depth: number;
  currentPath: string | null;
  onToggle: (path: string) => void;
  isOpen: (path: string) => boolean;
  matching: Set<string> | null;
  onNavigate?: () => void;
  privatePrefixes?: Set<string>;
  topLevelProjects?: Set<string>;
  onEditAcl?: (folderPath: string) => void;
}

function TreeNodeList({
  nodes,
  depth,
  currentPath,
  onToggle,
  isOpen,
  matching,
  onNavigate,
  privatePrefixes,
  topLevelProjects,
  onEditAcl,
}: TreeNodeListProps) {
  // When filtering, hide nodes whose subtree has no matches
  const visibleNodes = matching
    ? nodes.filter((n) => subtreeHasMatch(n, matching))
    : nodes;

  if (visibleNodes.length === 0) return null;

  return (
    <ul>
      {visibleNodes.map((node, i) => {
        const next = visibleNodes[i + 1];
        const isSystemHere =
          depth === 0 && (SYSTEM_DIRS as readonly string[]).includes(node.name);
        const nextIsSystem =
          depth === 0 && !!next && (SYSTEM_DIRS as readonly string[]).includes(next.name);
        const drawDivider = isSystemHere && !nextIsSystem && !!next;
        return (
          <Fragment key={node.path}>
            <TreeNode
              node={node}
              depth={depth}
              currentPath={currentPath}
              onToggle={onToggle}
              isOpen={isOpen}
              matching={matching}
              onNavigate={onNavigate}
              privatePrefixes={privatePrefixes}
              topLevelProjects={topLevelProjects}
              onEditAcl={onEditAcl}
            />
            {drawDivider && (
              <li
                aria-hidden="true"
                className="my-1 mx-2 border-t border-border/40"
              />
            )}
          </Fragment>
        );
      })}
    </ul>
  );
}

function subtreeHasMatch(node: Node, matching: Set<string>): boolean {
  if (!node.isDir) return matching.has(node.path);
  for (const c of node.children) if (subtreeHasMatch(c, matching)) return true;
  return false;
}

interface TreeNodeProps {
  node: Node;
  depth: number;
  currentPath: string | null;
  onToggle: (path: string) => void;
  isOpen: (path: string) => boolean;
  matching: Set<string> | null;
  onNavigate?: () => void;
  privatePrefixes?: Set<string>;
  topLevelProjects?: Set<string>;
  onEditAcl?: (folderPath: string) => void;
}

function TreeNode({
  node,
  depth,
  currentPath,
  onToggle,
  isOpen,
  matching,
  onNavigate,
  privatePrefixes,
  topLevelProjects,
  onEditAcl,
}: TreeNodeProps) {
  const open = isOpen(node.path);
  const selected = !node.isDir && currentPath === node.path;
  const paddingLeft = 8 + depth * 14;

  // Top-level system folders render as leaf links to their dedicated views,
  // not as expandable tree nodes. They're system-owned spaces where the
  // raw file list isn't meaningful to a human; each gets a themed icon
  // + localized label instead of the raw `__name__` shown by FileLeafLink.
  if (node.isDir && depth === 0 && node.name in SYSTEM_DIR_META) {
    const meta = SYSTEM_DIR_META[node.name]!;
    const active = currentPath?.startsWith(`${node.name}/`) ?? false;
    return (
      <li>
        <SystemDirLink
          href={meta.href}
          labelKey={meta.labelKey}
          icon={meta.icon}
          selected={active}
          paddingLeft={paddingLeft}
          onNavigate={onNavigate}
        />
      </li>
    );
  }

  if (node.isDir) {
    const isPrivate = privatePrefixes?.has(`${node.path}/`) ?? false;
    const isProject =
      depth === 0 && (topLevelProjects?.has(node.name) ?? false);
    // v3.3 §8: any folder whose name matches `__X__` is a system dir.
    // The two known cases (__mail__, __assets__) get their own dedicated
    // routes via SYSTEM_DIRS; anything else just gets a quiet "system"
    // pill so users know the folder is platform-managed.
    const isSystemNamed =
      depth === 0 &&
      node.name.startsWith("__") &&
      node.name.endsWith("__") &&
      node.name.length > 4;
    return (
      <li className="group/folder">
        <div
          className="huozi-row w-full flex items-center gap-1.5 py-1.5 rounded hover:bg-muted/60 transition-colors"
          style={{ paddingLeft, paddingRight: 8 }}
        >
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
          >
            <FileIcon
              name={node.name}
              isDir
              open={open}
              isProject={isProject}
            />
            <span
              className="text-sm text-muted-foreground truncate"
              title={
                isProject
                  ? "Upgraded Project — has tasks.jsonl + .huozi/memory.md"
                  : undefined
              }
            >
              {node.name}
            </span>
            {isSystemNamed && (
              <span
                className="inline-flex items-center rounded border border-border bg-muted px-1 text-[9px] font-medium text-muted-foreground shrink-0"
                title="System folder — platform-managed"
              >
                sys
              </span>
            )}
            {isPrivate && (
              <span
                className="text-[10px] text-accent shrink-0"
                aria-label="private"
                title="Private folder"
              >
                ●
              </span>
            )}
          </button>
          {/* Single hover affordance on top-level folder rows: the
              "⋯" jumps to the per-folder Settings page (Project state,
              tasks/memory counts, archive actions). System dirs handle
              their own routing; nested folders don't carry Project
              state. Folder ACL editing previously lived behind this
              icon — re-introduce it as a section of the Settings page
              when needed (the `onEditAcl` prop is intentionally
              unreferenced now). */}
          {depth === 0 &&
            !(SYSTEM_DIRS as readonly string[]).includes(node.name) && (
              <Link
                href={`/workspace/folder/${encodeURIComponent(node.path)}`}
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover/folder:opacity-100 hover:bg-muted text-xs text-muted-foreground hover:text-foreground rounded px-1 transition-opacity shrink-0"
                aria-label="Folder settings"
                title="Settings"
              >
                ⋯
              </Link>
            )}
        </div>
        {open && (
          <TreeNodeList
            nodes={node.children}
            depth={depth + 1}
            currentPath={currentPath}
            onToggle={onToggle}
            isOpen={isOpen}
            matching={matching}
            onNavigate={onNavigate}
            privatePrefixes={privatePrefixes}
            topLevelProjects={topLevelProjects}
            onEditAcl={onEditAcl}
          />
        )}
      </li>
    );
  }

  const href = `/workspace/view?path=${encodeURIComponent(node.path)}`;
  return (
    <li>
      <FileLeafLink
        href={href}
        onNavigate={onNavigate}
        selected={selected}
        paddingLeft={paddingLeft}
        name={node.name}
      />
    </li>
  );
}

/**
 * Type-filter dropdown — same trigger / popover pattern as
 * `key-ttl-select.tsx`: full-width rounded button to pair with the
 * search input below, KeyTtlSelect-style menu (shadow, ✓ on active,
 * outside-click + ESC to close).
 */
function TypeFilter({
  value,
  onChange,
  paths,
  counts,
  t,
}: {
  value: FileType | "all";
  onChange: (v: FileType | "all") => void;
  paths: readonly string[];
  counts: Record<FileType, number>;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      // `globalThis.Node` is qualified because this file declares a
      // local `Node` interface for tree nodes.
      const target = e.target as globalThis.Node | null;
      if (target && !rootRef.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = useMemo(() => {
    const arr: { value: FileType | "all"; label: string; count: number }[] = [
      { value: "all", label: t("ws.types.all"), count: paths.length },
      ...FOUR_TYPES.map((tp) => ({
        value: tp,
        label: t(`ws.types.${tp}`),
        count: counts[tp],
      })),
    ];
    if (counts.other > 0) {
      arr.push({
        value: "other",
        label: t("ws.types.other"),
        count: counts.other,
      });
    }
    return arr;
  }, [t, paths.length, counts]);

  const current = items.find((i) => i.value === value) ?? items[0]!;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-full inline-flex items-center justify-between gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          open
            ? "border-foreground/40 bg-muted"
            : "border-border hover:border-foreground/40 hover:bg-muted/60"
        }`}
      >
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-foreground font-medium truncate">
            {current.label}
          </span>
          <span className="text-muted-foreground font-mono shrink-0">
            · {current.count}
          </span>
        </span>
        <svg
          viewBox="0 0 12 12"
          width="9"
          height="9"
          className={`opacity-60 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <path
            d="M2 4 L6 8 L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full mt-1.5 z-40
                     rounded-md border border-border bg-background shadow-lg
                     py-1 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {items.map((it) => {
            const active = it.value === value;
            const empty = it.count === 0 && it.value !== "all";
            return (
              <button
                key={it.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                disabled={empty}
                onClick={() => {
                  onChange(it.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs transition-colors text-left ${
                  active
                    ? "bg-muted/60 text-foreground"
                    : empty
                      ? "text-muted-foreground/40 cursor-default"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <span className="flex items-baseline gap-1.5">
                  <span>{it.label}</span>
                  <span className="font-mono opacity-70">· {it.count}</span>
                </span>
                {active && (
                  <span className="text-accent text-[10px]" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FileLeafLink({
  href,
  onNavigate,
  selected,
  paddingLeft,
  name,
  isDir = false,
}: {
  href: string;
  onNavigate?: () => void;
  selected: boolean;
  paddingLeft: number;
  name: string;
  isDir?: boolean;
}) {
  const { navigate } = useWorkspaceNav();
  return (
    <Link
      href={href}
      onClick={(e) => {
        // Let modifier-clicks (cmd/ctrl/middle/shift) keep their default
        // open-in-new-tab behavior. Plain clicks go through our
        // transition-aware navigate so the main column flips to the
        // skeleton immediately.
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button === 1
        ) {
          return;
        }
        e.preventDefault();
        onNavigate?.();
        navigate(href);
      }}
      aria-current={selected ? "page" : undefined}
      className={`huozi-row flex items-center gap-1.5 py-1.5 rounded transition-colors ${selected ? "bg-accent/10 text-accent" : "hover:bg-muted/60"}`}
      style={{ paddingLeft, paddingRight: 8 }}
    >
      <FileIcon name={name} isDir={isDir} />
      <span className="text-sm font-mono truncate">{name}</span>
    </Link>
  );
}

/**
 * Sidebar entry for the pinned system dirs (Mail / Clippings / Assets).
 *
 * Visually distinct from FileLeafLink:
 *   - Themed mini-icon (envelope · bookmark · photo stack) instead of
 *     the generic folder glyph — readers should be able to spot the
 *     three feature shortcuts at a glance.
 *   - Localized label (sans, not mono) instead of the raw `__name__`
 *     dir on disk.
 *   - Bumped vertical padding so the trio reads as a tight nav block
 *     rather than blending into the user-folder rows below.
 */
function SystemDirLink({
  href,
  labelKey,
  icon,
  selected,
  paddingLeft,
  onNavigate,
}: {
  href: string;
  labelKey: string;
  icon: "mail" | "clippings" | "assets";
  selected: boolean;
  paddingLeft: number;
  onNavigate?: () => void;
}) {
  const { navigate } = useWorkspaceNav();
  const t = useT();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) {
          return;
        }
        e.preventDefault();
        onNavigate?.();
        navigate(href);
      }}
      aria-current={selected ? "page" : undefined}
      className={`huozi-row flex items-center gap-2 py-1.5 rounded transition-colors ${
        selected ? "bg-accent/10 text-accent" : "hover:bg-muted/60"
      }`}
      style={{ paddingLeft, paddingRight: 8 }}
    >
      <SystemDirIcon kind={icon} />
      <span className="text-sm truncate">{t(labelKey)}</span>
    </Link>
  );
}

/**
 * Inline SVG icons for the three system entries. Sized to match
 * FileIcon's 16×16 grid (w-4 container). All three use stroke-only
 * rendering with currentColor + 1.2px strokes so they pick up the
 * row's text color (and the accent tint when selected) without per-
 * theme overrides.
 */
function SystemDirIcon({ kind }: { kind: "mail" | "clippings" | "assets" }) {
  return (
    <span
      className="inline-flex items-center justify-center w-4 shrink-0"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "mail" && (
          <>
            <rect x="2" y="3.5" width="12" height="9" rx="1" />
            <path d="M2.5 4.5l5.5 4 5.5-4" />
          </>
        )}
        {kind === "clippings" && (
          // Bookmark-ribbon mark — the "saved passage" silhouette.
          <>
            <path d="M4 2.5h8v11l-4-2.6-4 2.6z" />
            <path d="M6 6.5h4" />
            <path d="M6 9h3" />
          </>
        )}
        {kind === "assets" && (
          // Stacked frames + a small disc for "photo gallery".
          <>
            <rect x="2.5" y="4" width="9.5" height="7.5" rx="0.8" />
            <path d="M4.5 6.8h0.01" strokeWidth="1.6" />
            <path d="M2.5 9.5l2.5-2 3 2 2-1.5 2 1.5" />
            <path d="M5 13h8.5a0.8 0.8 0 0 0 0.8-0.8V6" opacity="0.6" />
          </>
        )}
      </svg>
    </span>
  );
}

