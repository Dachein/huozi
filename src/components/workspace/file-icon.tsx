/**
 * File-tree icons.
 *
 * Three flagship file types get proper Office-style colored tiles —
 * blue for Markdown (Word), green for CSV/TSV (Excel), warm orange for
 * HTML (PowerPoint). Everything else falls back to a single-letter
 * monospace badge in a typed accent color so unfamiliar extensions
 * still scan quickly.
 *
 * Folders render the existing chevron, rotated by the parent when open.
 */

const SIZE = 14;

interface TileSpec {
  bg: string;
  letter: string;
  /** Optional second-row letter (e.g. "MD"); kept short so it stays legible at 14px. */
  sub?: string;
}

const TILE: Record<string, TileSpec> = {
  md: { bg: "#2c6bcb", letter: "M", sub: "MD" },
  mdx: { bg: "#2c6bcb", letter: "M", sub: "MDX" },
  csv: { bg: "#107c41", letter: "T", sub: "CSV" },
  tsv: { bg: "#107c41", letter: "T", sub: "TSV" },
  html: { bg: "#d24726", letter: "H", sub: "HTML" },
  htm: { bg: "#d24726", letter: "H", sub: "HTM" },
};

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
  const tile = TILE[ext];
  if (tile) {
    return (
      <span
        className="inline-flex items-center justify-center w-4"
        aria-hidden="true"
      >
        <OfficeTile bg={tile.bg} letter={tile.letter} />
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

function OfficeTile({ bg, letter }: { bg: string; letter: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={SIZE}
      height={SIZE}
      role="img"
      aria-hidden="true"
    >
      <rect x="0.5" y="0.5" width="15" height="15" rx="3" fill={bg} />
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      >
        {letter}
      </text>
    </svg>
  );
}
