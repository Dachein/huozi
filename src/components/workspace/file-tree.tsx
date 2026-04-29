"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect, useCallback } from "react";
import { FileIcon } from "@/components/workspace/file-icon";
import { FolderAclModal } from "@/components/workspace/folder-acl-modal";

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
function buildTree(paths: string[]): Node {
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

  // Sort: dirs first, then alpha
  const sortNode = (n: Node): void => {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) sortNode(c);
  };
  sortNode(root);

  return root;
}

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
  // When the caller doesn't pass currentPath (the new view/layout.tsx
  // can't read searchParams from a Server Layout), derive it from the
  // URL on the client so the highlight updates as soon as the user
  // clicks a Link — before the new page.tsx finishes loading.
  const pathname = usePathname();
  const search = useSearchParams();
  const derivedPath =
    pathname === "/workspace/view" ? (search.get("path") ?? null) : null;
  const currentPath = currentPathProp ?? derivedPath;

  const root = useMemo(() => buildTree(paths), [paths]);

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
            onEditAcl={aclEnabled ? (p) => setAclEditingPath(p) : undefined}
          />
        )}
      </nav>
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
  onEditAcl,
}: TreeNodeListProps) {
  // When filtering, hide nodes whose subtree has no matches
  const visibleNodes = matching
    ? nodes.filter((n) => subtreeHasMatch(n, matching))
    : nodes;

  if (visibleNodes.length === 0) return null;

  return (
    <ul>
      {visibleNodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={depth}
          currentPath={currentPath}
          onToggle={onToggle}
          isOpen={isOpen}
          matching={matching}
          onNavigate={onNavigate}
          privatePrefixes={privatePrefixes}
          onEditAcl={onEditAcl}
        />
      ))}
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
  onEditAcl,
}: TreeNodeProps) {
  const open = isOpen(node.path);
  const selected = !node.isDir && currentPath === node.path;
  const paddingLeft = 8 + depth * 14;

  if (node.isDir) {
    const isPrivate = privatePrefixes?.has(`${node.path}/`) ?? false;
    return (
      <li className="group/folder">
        <div
          className="w-full flex items-center gap-1.5 py-1.5 rounded hover:bg-muted/60 transition-colors"
          style={{ paddingLeft, paddingRight: 8 }}
        >
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
          >
            <FileIcon name={node.name} isDir open={open} />
            <span className="text-sm text-muted-foreground truncate">
              {node.name}
            </span>
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
          {onEditAcl && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditAcl(node.path);
              }}
              className="opacity-0 group-hover/folder:opacity-100 hover:bg-muted text-xs text-muted-foreground hover:text-foreground rounded px-1 transition-opacity shrink-0"
              aria-label="Folder access settings"
              title="Access"
            >
              ⋯
            </button>
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
            onEditAcl={onEditAcl}
          />
        )}
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/workspace/view?path=${encodeURIComponent(node.path)}`}
        onClick={onNavigate}
        className={`flex items-center gap-1.5 py-1.5 rounded transition-colors ${selected ? "bg-accent/10 text-accent" : "hover:bg-muted/60"}`}
        style={{ paddingLeft, paddingRight: 8 }}
      >
        <FileIcon name={node.name} isDir={false} />
        <span className="text-sm font-mono truncate">{node.name}</span>
      </Link>
    </li>
  );
}
