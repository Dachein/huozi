/**
 * File-tree icons.
 *
 * Hand-drawn SVGs in a unified muted palette, tuned for the warm-paper page
 * background. All share stroke-width 1.2 for outlines and a faint same-hue
 * fill (~8% opacity).
 *
 *   - Markdown        → page-with-text-lines,            slate blue
 *   - CSV / TSV       → small grid (header + 3),          olive sage
 *   - HTML            → 3-bar chart,                      warm ochre
 *   - PDF             → page with a corner stamp,         warm red
 *   - Image           → frame with mountain + sun,        muted teal
 *   - Audio           → 5-bar waveform meter,             muted purple
 *   - Video           → frame with center play triangle,  warm peach
 *   - Archive (zip)   → box with diagonal zipper line,    warm gray-brown
 *   - Folder          → closed / open variants,           warm neutral
 *   - .huozi-keep     → reuses the closed folder shape (it *is* a folder)
 *
 * Other extensions fall back to a single-letter monospace badge.
 *
 * Tree directories swap between FolderClosedIcon and FolderOpenIcon
 * on expand/collapse — no chevron needed; the icon itself carries
 * the state.
 */

const SIZE = 14;

const COLOR = {
  md: "#4a6b8c",
  csv: "#6b8459",
  html: "#b88454",
  pdf: "#b85450",
  image: "#5a8b8b",
  audio: "#8a6b9a",
  video: "#c2785f",
  archive: "#8b7355",
  folder: "#7a6a4f",
} as const;

const FOLDER_MARKER = ".huozi-keep";

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
  return { char: "·", cls: "text-muted-foreground" };
}

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff", "avif",
]);
const AUDIO_EXTS = new Set([
  "mp3", "wav", "m4a", "ogg", "flac", "aac", "opus",
]);
const VIDEO_EXTS = new Set([
  "mp4", "mov", "webm", "mkv", "avi", "m4v",
]);
const ARCHIVE_EXTS = new Set([
  "zip", "gz", "tar", "tgz", "7z", "rar", "bz2",
]);

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
        className="inline-flex items-center justify-center w-4"
        aria-hidden="true"
      >
        {open ? <FolderOpenIcon /> : <FolderClosedIcon />}
      </span>
    );
  }

  const base = name.split("/").pop() ?? name;
  const ext = (base.split(".").pop() ?? "").toLowerCase();
  let icon: React.ReactNode = null;
  if (base === FOLDER_MARKER) icon = <FolderClosedIcon />;
  else if (ext === "md" || ext === "mdx") icon = <MarkdownIcon />;
  else if (ext === "csv" || ext === "tsv") icon = <CsvIcon />;
  else if (ext === "html" || ext === "htm") icon = <HtmlIcon />;
  else if (ext === "pdf") icon = <PdfIcon />;
  else if (IMAGE_EXTS.has(ext)) icon = <ImageIcon />;
  else if (AUDIO_EXTS.has(ext)) icon = <AudioIcon />;
  else if (VIDEO_EXTS.has(ext)) icon = <VideoIcon />;
  else if (ARCHIVE_EXTS.has(ext)) icon = <ArchiveIcon />;

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

/** Closed folder — tabbed silhouette. Default for collapsed dirs +
 *  .huozi-keep marker files. */
function FolderClosedIcon() {
  const c = COLOR.folder;
  const wash = `${c}14`;
  return (
    <IconBox>
      <path
        d="M2 5 a1 1 0 0 1 1 -1 H6.5 L8 5.5 H13 a1 1 0 0 1 1 1 V12.5 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 Z"
        fill={wash}
        stroke={c}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </IconBox>
  );
}

/** Open folder — back panel + slanted front flap, the standard
 *  manila-folder-being-opened pose. */
function FolderOpenIcon() {
  const c = COLOR.folder;
  const wash = `${c}14`;
  return (
    <IconBox>
      {/* Back panel: full folder silhouette, slightly receded behind the front. */}
      <path
        d="M2 5 a1 1 0 0 1 1 -1 H6.5 L8 5.5 H13 a1 1 0 0 1 1 1 V8.5 H2 Z"
        fill={wash}
        stroke={c}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Front flap: slanted trapezoid sitting in front, suggesting the folder is open. */}
      <path
        d="M3 8 H14 L12.5 13.5 a0.5 0.5 0 0 1 -0.5 0.5 H3.5 a0.5 0.5 0 0 1 -0.5 -0.5 Z"
        fill={wash}
        stroke={c}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
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

/** PDF — page silhouette with a "PDF" badge in the lower band.
 *  Shares the markdown page outline so the eye groups documents together;
 *  the bottom band differentiates without becoming visually loud. */
function PdfIcon() {
  const c = COLOR.pdf;
  const wash = `${c}14`;
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
      {/* PDF badge band */}
      <rect x="4.5" y="9.5" width="7" height="3.25" rx="0.4" fill={c} opacity="0.85" />
      <text
        x="8"
        y="11.95"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="2.6"
        fontWeight="700"
        fill="#fff"
      >
        PDF
      </text>
    </IconBox>
  );
}

/** Image — a simple frame with a small mountain triangle and a sun.
 *  The classic photo glyph; reads as "image" at 14px without text. */
function ImageIcon() {
  const c = COLOR.image;
  const wash = `${c}14`;
  return (
    <IconBox>
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill={wash} stroke={c} strokeWidth="1.2" />
      {/* sun */}
      <circle cx="5.5" cy="6" r="1.1" fill={c} opacity="0.7" />
      {/* mountains */}
      <path
        d="M2.5 12.5 L6 8 L8.5 10.5 L11 7.5 L13.5 12.5 Z"
        fill={c}
        opacity="0.5"
        stroke={c}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </IconBox>
  );
}

/** Audio — 5-bar level meter, varying heights for the "playing" feel. */
function AudioIcon() {
  const c = COLOR.audio;
  const wash = `${c}14`;
  // Bar specs: x, height (h is from bottom)
  const bars: Array<[number, number]> = [
    [3, 4],
    [5, 7],
    [7, 5],
    [9, 8.5],
    [11, 6],
  ];
  const baseY = 13;
  return (
    <IconBox>
      {bars.map(([x, h], i) => (
        <rect
          key={i}
          x={x}
          y={baseY - h}
          width="1.6"
          height={h}
          rx="0.5"
          fill={wash}
          stroke={c}
          strokeWidth="1.1"
        />
      ))}
      {/* baseline */}
      <line x1="2" y1="13.5" x2="14" y2="13.5" stroke={c} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
    </IconBox>
  );
}

/** Video — frame with a centered play triangle. */
function VideoIcon() {
  const c = COLOR.video;
  const wash = `${c}14`;
  return (
    <IconBox>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" fill={wash} stroke={c} strokeWidth="1.2" />
      <path
        d="M7 6.25 L11 8 L7 9.75 Z"
        fill={c}
        opacity="0.85"
        stroke={c}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </IconBox>
  );
}

/** Archive — folder-shaped to signal "container", with a vertical zipper
 *  line and small horizontal teeth. Distinct from the regular folder
 *  by the zipper detail; archive content is "sealed" until extraction. */
function ArchiveIcon() {
  const c = COLOR.archive;
  const wash = `${c}14`;
  return (
    <IconBox>
      <rect x="2.5" y="3" width="11" height="10" rx="1.2" fill={wash} stroke={c} strokeWidth="1.2" />
      {/* zipper line */}
      <line x1="8" y1="3" x2="8" y2="13" stroke={c} strokeWidth="1.2" />
      {/* teeth (alternating sides) */}
      <line x1="6.75" y1="5" x2="9.25" y2="5" stroke={c} strokeWidth="0.9" />
      <line x1="6.75" y1="7" x2="9.25" y2="7" stroke={c} strokeWidth="0.9" />
      <line x1="6.75" y1="9" x2="9.25" y2="9" stroke={c} strokeWidth="0.9" />
      <line x1="6.75" y1="11" x2="9.25" y2="11" stroke={c} strokeWidth="0.9" />
    </IconBox>
  );
}
