"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";

export interface FileTreeProps {
  /** Workspace-relative paths, e.g. "funds/fund-A/report.md" */
  paths: string[];
  /** Path currently being viewed (highlighted + ancestors auto-expanded). */
  currentPath?: string | null;
  /** Called after the user clicks a leaf — used by mobile shell to close the drawer. */
  onNavigate?: () => void;
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

/** Icon character by extension. Intentionally monospace-safe (no emoji for consistent width). */
function fileIcon(name: string, isDir: boolean): { char: string; cls: string } {
  if (isDir) return { char: "▸", cls: "text-muted-foreground" };
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (["md", "mdx"].includes(ext))
    return { char: "M", cls: "text-blue-500" };
  if (["html", "htm"].includes(ext))
    return { char: "H", cls: "text-orange-500" };
  if (["csv", "tsv"].includes(ext))
    return { char: "T", cls: "text-green-500" };
  if (ext === "json") return { char: "J", cls: "text-yellow-500" };
  if (
    ["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)
  )
    return { char: "⟨⟩", cls: "text-purple-500" };
  if (["py", "rb", "go", "rs", "java", "swift", "kt", "c", "cpp", "h"].includes(ext))
    return { char: "⟨⟩", cls: "text-purple-500" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext))
    return { char: "I", cls: "text-pink-500" };
  if (["pdf"].includes(ext))
    return { char: "P", cls: "text-red-500" };
  return { char: "·", cls: "text-muted-foreground" };
}

export function FileTree({ paths, currentPath, onNavigate }: FileTreeProps) {
  const root = useMemo(() => buildTree(paths), [paths]);

  // Expanded folders live in state + localStorage.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

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
          />
        )}
      </nav>
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
}

function TreeNodeList({
  nodes,
  depth,
  currentPath,
  onToggle,
  isOpen,
  matching,
  onNavigate,
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
}

function TreeNode({
  node,
  depth,
  currentPath,
  onToggle,
  isOpen,
  matching,
  onNavigate,
}: TreeNodeProps) {
  const open = isOpen(node.path);
  const icon = fileIcon(node.name, node.isDir);
  const selected = !node.isDir && currentPath === node.path;
  const paddingLeft = 8 + depth * 14;

  if (node.isDir) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="w-full flex items-center gap-1.5 text-left py-1.5 rounded hover:bg-muted/60 transition-colors"
          style={{ paddingLeft, paddingRight: 8 }}
        >
          <span className={`text-xs w-4 text-center ${icon.cls} transition-transform ${open ? "rotate-90" : ""}`}>
            {icon.char}
          </span>
          <span className="text-sm text-muted-foreground truncate">
            {node.name}
          </span>
        </button>
        {open && (
          <TreeNodeList
            nodes={node.children}
            depth={depth + 1}
            currentPath={currentPath}
            onToggle={onToggle}
            isOpen={isOpen}
            matching={matching}
            onNavigate={onNavigate}
          />
        )}
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/cloud/workspace/view?path=${encodeURIComponent(node.path)}`}
        onClick={onNavigate}
        className={`flex items-center gap-1.5 py-1.5 rounded transition-colors ${selected ? "bg-accent/10 text-accent" : "hover:bg-muted/60"}`}
        style={{ paddingLeft, paddingRight: 8 }}
      >
        <span className={`text-[10px] w-4 text-center font-mono font-bold ${icon.cls}`}>
          {icon.char}
        </span>
        <span className="text-sm font-mono truncate">{node.name}</span>
      </Link>
    </li>
  );
}
