/**
 * File-tree icons.
 *
 * Three flagship file types get representational SVGs in a unified
 * muted palette tuned for the warm-paper page background:
 *   - Markdown  → page-with-text-lines, slate blue
 *   - CSV / TSV → small grid (header row + 3 columns), olive sage
 *   - HTML      → 3-bar chart, warm ochre
 *
 * All three share stroke-width 1.2 for outlines and a faint same-hue
 * fill (~8% opacity) to give weight without going tile-bright. Other
 * extensions fall back to a single-letter monospace badge.
 *
 * Folders render the existing chevron, rotated by the parent when open.
 */

const SIZE = 14;

const COLOR = {
  md: "#4a6b8c",
  csv: "#6b8459",
  html: "#b88454",
} as const;

interface FallbackSpec {
  char: string;
  cls: string;
}

function fallback(ext: string): FallbackSpec {
  if (ext === "json") return { char: "J", cls: "text-yellow-600" };
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext))
    return { char: "⟨⟩", cls: "text-purple-500" };
  if (["py", "rb", "go", "rs", "java", "swift", "kt", "c", "cpp", "h"].includes(ext))
    return { char: "⟨⟩", cls: "text-purple-500" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext))
    return { char: "I", cls: "text-pink-500" };
  if (ext === "pdf") return { char: "P", cls: "text-red-500" };
  return { char: "·", cls: "text-muted-foreground" };
}

export interface FileIconProps {
  /** Filename (basename or full path — only the extension matters). */
  name: string;
  /** True for folders. */
  isDir: boolean;
  /** Folder-only: rotates the chevron 90° when expanded. */
  open?: boolean;
}

export function FileIcon({ name, isDir, open }: FileIconProps) {
  if (isDir) {
    return (
      <span
        className={`inline-flex items-center justify-center w-4 text-xs text-muted-foreground transition-transform ${
          open ? "rotate-90" : ""
        }`}
        aria-hidden="true"
      >
        ▸
      </span>
    );
  }

  const ext = (name.split(".").pop() ?? "").toLowerCase();
  let icon: React.ReactNode = null;
  if (ext === "md" || ext === "mdx") icon = <MarkdownIcon />;
  else if (ext === "csv" || ext === "tsv") icon = <CsvIcon />;
  else if (ext === "html" || ext === "htm") icon = <HtmlIcon />;

  if (icon) {
    return (
      <span
        className="inline-flex items-center justify-center w-4"
        aria-hidden="true"
      >
        {icon}
      </span>
    );
  }

  const fb = fallback(ext);
  return (
    <span
      className={`inline-flex items-center justify-center w-4 text-[10px] font-mono font-bold ${fb.cls}`}
      aria-hidden="true"
    >
      {fb.char}
    </span>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={SIZE}
      height={SIZE}
      fill="none"
      role="img"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Markdown — page silhouette with folded corner + 3 text lines. */
function MarkdownIcon() {
  const c = COLOR.md;
  const wash = `${c}14`; // ~8% opacity
  return (
    <IconBox>
      <path
        d="M3.5 2 H9.5 L13 5.5 V13 a1 1 0 0 1 -1 1 H4.5 a1 1 0 0 1 -1 -1 V3 a1 1 0 0 1 1 -1 Z"
        fill={wash}
        stroke={c}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 2 V5.5 H13"
        stroke={c}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <line x1="5.5" y1="8.75" x2="11" y2="8.75" stroke={c} strokeWidth="1" strokeLinecap="round" />
      <line x1="5.5" y1="10.75" x2="11" y2="10.75" stroke={c} strokeWidth="1" strokeLinecap="round" />
      <line x1="5.5" y1="12.75" x2="9" y2="12.75" stroke={c} strokeWidth="1" strokeLinecap="round" />
    </IconBox>
  );
}

/** CSV — small data grid with header row + 3 columns. */
function CsvIcon() {
  const c = COLOR.csv;
  const wash = `${c}14`;
  return (
    <IconBox>
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        fill={wash}
        stroke={c}
        strokeWidth="1.2"
      />
      {/* header row separator */}
      <line x1="2" y1="6.25" x2="14" y2="6.25" stroke={c} strokeWidth="1.2" />
      {/* column dividers */}
      <line x1="6" y1="3" x2="6" y2="13" stroke={c} strokeWidth="1" />
      <line x1="10" y1="3" x2="10" y2="13" stroke={c} strokeWidth="1" />
      {/* mid-row divider */}
      <line x1="2" y1="9.75" x2="14" y2="9.75" stroke={c} strokeWidth="1" />
    </IconBox>
  );
}

/** HTML — 3-bar chart on a baseline. */
function HtmlIcon() {
  const c = COLOR.html;
  const wash = `${c}14`;
  return (
    <IconBox>
      <rect x="3" y="9.5" width="2.5" height="4.5" rx="0.5" fill={wash} stroke={c} strokeWidth="1.2" />
      <rect x="6.75" y="5.5" width="2.5" height="8.5" rx="0.5" fill={wash} stroke={c} strokeWidth="1.2" />
      <rect x="10.5" y="7.5" width="2.5" height="6.5" rx="0.5" fill={wash} stroke={c} strokeWidth="1.2" />
      <line x1="2" y1="14.25" x2="14" y2="14.25" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
    </IconBox>
  );
}
