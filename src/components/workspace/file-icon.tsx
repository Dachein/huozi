"use client";

/**
 * File-tree icons.
 *
 * The four first-class data types (table / document / collection / page)
 * carry per-theme glyph variants — paper renders soft hand-drawn shapes
 * with washed fills, block renders chunky right-angled blocks with
 * thick outlines, office renders clean line-art with a single accent
 * stroke. The remaining types (pdf / image / audio / video / archive /
 * folder) share one neutral variant across themes — they're not
 * load-bearing for visual identity and a single set keeps maintenance
 * tractable.
 *
 *   - Markdown        → page-with-text-lines              (3 variants)
 *   - CSV / TSV       → small data grid                    (3 variants)
 *   - HTML            → 3-bar chart / stacked window      (3 variants)
 *   - JSONL           → stacked-rows collection            (3 variants)
 *   - PDF             → page with corner stamp             (single)
 *   - Image           → frame with mountain + sun          (single)
 *   - Audio           → 5-bar level meter                  (single)
 *   - Video           → frame with center play triangle    (single)
 *   - Archive (zip)   → box with zipper detail             (single)
 *   - Folder          → closed / open                      (single)
 *   - .huozi-keep     → reuses the closed folder shape (it *is* a folder)
 *
 * Other extensions fall back to a single-letter monospace badge.
 *
 * Tree directories swap between FolderClosedIcon and FolderOpenIcon
 * on expand/collapse — no chevron needed; the icon itself carries
 * the state.
 */

import { useTheme } from "@/lib/theme/context";
import type { Theme } from "@/lib/theme";

const SIZE = 14;

/* Default (paper) palette — warm muted hues tuned for cream backdrop. */
const COLOR = {
  md: "#4a6b8c",
  csv: "#6b8459",
  html: "#b88454",
  jsonl: "#8a6b9a",
  pdf: "#b85450",
  image: "#5a8b8b",
  audio: "#8a6b9a",
  video: "#c2785f",
  archive: "#8b7355",
  folder: "#7a6a4f",
} as const;

/* Office palette — generic productivity-software conventions
 * (green=table, blue=document, orange=page, purple=collection).
 * Hex values intentionally chosen distinct from any specific
 * vendor's brand palette. */
const OFFICE_COLOR = {
  md: "#1e6cd6",
  csv: "#1e9148",
  html: "#d97757",
  jsonl: "#7c3aed",
} as const;

/* Block (brutal-mono) palette — black outlines on white, with the
 * theme's signature cadmium yellow as the single accent. Stroke
 * widths bump to 1.6 to match the brutal "everything stronger" rule. */
const BLOCK = {
  ink: "#000000",
  paper: "#ffffff",
  accent: "#ffd60a",
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
  const theme = useTheme();

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
  else if (ext === "md" || ext === "mdx") icon = <MarkdownIcon theme={theme} />;
  else if (ext === "csv" || ext === "tsv") icon = <CsvIcon theme={theme} />;
  else if (ext === "html" || ext === "htm") icon = <HtmlIcon theme={theme} />;
  else if (ext === "jsonl") icon = <JsonlIcon theme={theme} />;
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

/* ─────────────────────────────────────────────────────────────────────
 * Per-theme dispatch wrappers — keep the 4 first-class types together
 * and route to the variant matching the active theme.
 * ───────────────────────────────────────────────────────────────────── */

interface ThemedProps {
  theme: Theme;
}

function MarkdownIcon({ theme }: ThemedProps) {
  if (theme === "brutal-mono") return <MarkdownIconBlock />;
  if (theme === "office") return <MarkdownIconOffice />;
  return <MarkdownIconPaper />;
}

function CsvIcon({ theme }: ThemedProps) {
  if (theme === "brutal-mono") return <CsvIconBlock />;
  if (theme === "office") return <CsvIconOffice />;
  return <CsvIconPaper />;
}

function HtmlIcon({ theme }: ThemedProps) {
  if (theme === "brutal-mono") return <HtmlIconBlock />;
  if (theme === "office") return <HtmlIconOffice />;
  return <HtmlIconPaper />;
}

function JsonlIcon({ theme }: ThemedProps) {
  if (theme === "brutal-mono") return <JsonlIconBlock />;
  if (theme === "office") return <JsonlIconOffice />;
  return <JsonlIconPaper />;
}

/* ─────────────────────────────────────────────────────────────────────
 * Paper (default) — soft hand-drawn outlines, washed fills, slate /
 * sage / ochre / muted-purple muted palette tuned for cream backdrop.
 * ───────────────────────────────────────────────────────────────────── */

function MarkdownIconPaper() {
  const c = COLOR.md;
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
      <line x1="5.5" y1="8.75" x2="11" y2="8.75" stroke={c} strokeWidth="1" strokeLinecap="round" />
      <line x1="5.5" y1="10.75" x2="11" y2="10.75" stroke={c} strokeWidth="1" strokeLinecap="round" />
      <line x1="5.5" y1="12.75" x2="9" y2="12.75" stroke={c} strokeWidth="1" strokeLinecap="round" />
    </IconBox>
  );
}

function CsvIconPaper() {
  const c = COLOR.csv;
  const wash = `${c}14`;
  return (
    <IconBox>
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill={wash} stroke={c} strokeWidth="1.2" />
      <line x1="2" y1="6.25" x2="14" y2="6.25" stroke={c} strokeWidth="1.2" />
      <line x1="6" y1="3" x2="6" y2="13" stroke={c} strokeWidth="1" />
      <line x1="10" y1="3" x2="10" y2="13" stroke={c} strokeWidth="1" />
      <line x1="2" y1="9.75" x2="14" y2="9.75" stroke={c} strokeWidth="1" />
    </IconBox>
  );
}

function HtmlIconPaper() {
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

/** JSONL — stacked rounded rows representing time-ordered records.
 * Muted purple matches the existing audio-meter hue (collections feel
 * "ledger-like" — same family as a level meter). */
function JsonlIconPaper() {
  const c = COLOR.jsonl;
  const wash = `${c}14`;
  return (
    <IconBox>
      <rect x="2" y="3" width="12" height="2.6" rx="0.6" fill={wash} stroke={c} strokeWidth="1.1" />
      <rect x="2" y="6.7" width="12" height="2.6" rx="0.6" fill={wash} stroke={c} strokeWidth="1.1" />
      <rect x="2" y="10.4" width="12" height="2.6" rx="0.6" fill={wash} stroke={c} strokeWidth="1.1" />
      {/* small id-marker dot at the leading edge of each row */}
      <circle cx="3.5" cy="4.3" r="0.55" fill={c} />
      <circle cx="3.5" cy="8" r="0.55" fill={c} />
      <circle cx="3.5" cy="11.7" r="0.55" fill={c} />
    </IconBox>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Block (brutal-mono) — chunky right-angled blocks, thick outlines,
 * white fill on cadmium-yellow accent strips. No rx, no curves —
 * lines are straight. Stroke width 1.6 matches the theme's --border-
 * width-strong of 3px scaled to the 16-unit viewbox.
 * ───────────────────────────────────────────────────────────────────── */

function MarkdownIconBlock() {
  return (
    <IconBox>
      <rect x="3" y="2" width="10" height="12" fill={BLOCK.paper} stroke={BLOCK.ink} strokeWidth="1.6" />
      <rect x="5" y="4" width="6" height="1.4" fill={BLOCK.ink} />
      <rect x="5" y="6.6" width="6" height="1.4" fill={BLOCK.ink} />
      <rect x="5" y="9.2" width="4" height="1.4" fill={BLOCK.ink} />
      {/* yellow accent strip at the bottom — the theme's brand stamp */}
      <rect x="3" y="12" width="10" height="2" fill={BLOCK.accent} stroke={BLOCK.ink} strokeWidth="1.6" />
    </IconBox>
  );
}

function CsvIconBlock() {
  return (
    <IconBox>
      <rect x="2" y="3" width="12" height="10" fill={BLOCK.paper} stroke={BLOCK.ink} strokeWidth="1.6" />
      {/* header row filled yellow */}
      <rect x="2" y="3" width="12" height="3.2" fill={BLOCK.accent} stroke={BLOCK.ink} strokeWidth="1.6" />
      {/* column dividers */}
      <line x1="6" y1="3" x2="6" y2="13" stroke={BLOCK.ink} strokeWidth="1.4" />
      <line x1="10" y1="3" x2="10" y2="13" stroke={BLOCK.ink} strokeWidth="1.4" />
      {/* mid-row divider */}
      <line x1="2" y1="9.6" x2="14" y2="9.6" stroke={BLOCK.ink} strokeWidth="1.4" />
    </IconBox>
  );
}

function HtmlIconBlock() {
  return (
    <IconBox>
      {/* chunky window with a yellow title bar */}
      <rect x="2" y="3" width="12" height="10" fill={BLOCK.paper} stroke={BLOCK.ink} strokeWidth="1.6" />
      <rect x="2" y="3" width="12" height="2.8" fill={BLOCK.accent} stroke={BLOCK.ink} strokeWidth="1.6" />
      {/* three traffic-light dots, square (no curves in brutal) */}
      <rect x="3.4" y="3.9" width="1" height="1" fill={BLOCK.ink} />
      <rect x="5.2" y="3.9" width="1" height="1" fill={BLOCK.ink} />
      <rect x="7" y="3.9" width="1" height="1" fill={BLOCK.ink} />
      {/* content: 2 short bars below */}
      <rect x="3.5" y="7.5" width="9" height="1.2" fill={BLOCK.ink} />
      <rect x="3.5" y="10" width="6" height="1.2" fill={BLOCK.ink} />
    </IconBox>
  );
}

function JsonlIconBlock() {
  return (
    <IconBox>
      {/* three stacked square cards */}
      <rect x="2" y="3" width="12" height="2.8" fill={BLOCK.paper} stroke={BLOCK.ink} strokeWidth="1.6" />
      <rect x="2" y="6.6" width="12" height="2.8" fill={BLOCK.accent} stroke={BLOCK.ink} strokeWidth="1.6" />
      <rect x="2" y="10.2" width="12" height="2.8" fill={BLOCK.paper} stroke={BLOCK.ink} strokeWidth="1.6" />
    </IconBox>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Office — filled colored tiles with white type-symbols on top
 * (app-launcher style). Tile = rounded square in the type's accent
 * color; symbol is a generic geometric hint at the file type, not a
 * letter. The four colors (green=table, blue=document, orange=page,
 * purple=collection) are common productivity-app conventions; hex
 * codes are chosen distinct from any specific vendor's brand palette.
 *
 * Why tile-style:
 *   The outline-on-white variant didn't read distinctly enough at
 *   14px in a file tree. A filled tile gives each type a strong
 *   color block the eye can scan, matching how mainstream
 *   file-launcher UIs (productivity suites, cloud drives, mobile
 *   home screens) signal type. Symbols stay generic — abstract
 *   geometric marks, never branded letters.
 *
 * Tile geometry:
 *   12×12 rounded square (rx=2) inside the 16-unit viewbox, so the
 *   tile takes up most of the icon with a 2-unit safe margin.
 *   Symbols are pure white at 100% on the tile, with an optional
 *   secondary detail at ~70% opacity for hierarchy.
 * ───────────────────────────────────────────────────────────────────── */

/** Tile-style document mark: page with text lines in white. */
function MarkdownIconOffice() {
  const c = OFFICE_COLOR.md;
  return (
    <IconBox>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={c} />
      <rect x="4.5" y="4.5" width="7" height="1.1" rx="0.3" fill="#ffffff" />
      <rect x="4.5" y="6.6" width="7" height="1.1" rx="0.3" fill="#ffffff" />
      <rect x="4.5" y="8.7" width="7" height="1.1" rx="0.3" fill="#ffffff" />
      <rect x="4.5" y="10.8" width="4" height="1.1" rx="0.3" fill="#ffffff" opacity="0.75" />
    </IconBox>
  );
}

/** Tile-style table mark: 2×3 grid of white cells suggesting rows
 *  and columns (a generic spreadsheet hint, no specific app icon). */
function CsvIconOffice() {
  const c = OFFICE_COLOR.csv;
  return (
    <IconBox>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={c} />
      {/* 2 cols × 3 rows of small cells */}
      <rect x="4" y="4.2" width="3.4" height="2.2" rx="0.3" fill="#ffffff" />
      <rect x="8.6" y="4.2" width="3.4" height="2.2" rx="0.3" fill="#ffffff" />
      <rect x="4" y="6.9" width="3.4" height="2.2" rx="0.3" fill="#ffffff" opacity="0.85" />
      <rect x="8.6" y="6.9" width="3.4" height="2.2" rx="0.3" fill="#ffffff" opacity="0.85" />
      <rect x="4" y="9.6" width="3.4" height="2.2" rx="0.3" fill="#ffffff" opacity="0.7" />
      <rect x="8.6" y="9.6" width="3.4" height="2.2" rx="0.3" fill="#ffffff" opacity="0.7" />
    </IconBox>
  );
}

/** Tile-style page mark: window with a title strip + content bars. */
function HtmlIconOffice() {
  const c = OFFICE_COLOR.html;
  return (
    <IconBox>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={c} />
      {/* title bar */}
      <rect x="4" y="4.2" width="8" height="1.6" rx="0.3" fill="#ffffff" />
      {/* content bars below */}
      <rect x="4" y="7" width="8" height="1.1" rx="0.3" fill="#ffffff" opacity="0.85" />
      <rect x="4" y="9" width="8" height="1.1" rx="0.3" fill="#ffffff" opacity="0.7" />
      <rect x="4" y="11" width="5" height="1.1" rx="0.3" fill="#ffffff" opacity="0.55" />
    </IconBox>
  );
}

/** Tile-style collection mark: stacked record rows, each with a small
 *  leading id-bullet indicating "list of records". */
function JsonlIconOffice() {
  const c = OFFICE_COLOR.jsonl;
  return (
    <IconBox>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={c} />
      {/* three stacked record rows */}
      <rect x="4" y="4.2" width="8" height="2" rx="0.3" fill="#ffffff" />
      <rect x="4" y="7" width="8" height="2" rx="0.3" fill="#ffffff" opacity="0.85" />
      <rect x="4" y="9.8" width="8" height="2" rx="0.3" fill="#ffffff" opacity="0.7" />
      {/* small id-bullets at the leading edge of each row */}
      <circle cx="5" cy="5.2" r="0.45" fill={c} />
      <circle cx="5" cy="8" r="0.45" fill={c} opacity="0.85" />
      <circle cx="5" cy="10.8" r="0.45" fill={c} opacity="0.7" />
    </IconBox>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Single-variant icons — folder + secondary file types share one
 * neutral rendering across themes. Color flows through the COLOR
 * palette; if a future theme demands distinct folder shapes, lift
 * these into the per-theme dispatch above.
 * ───────────────────────────────────────────────────────────────────── */

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
      <path
        d="M2 5 a1 1 0 0 1 1 -1 H6.5 L8 5.5 H13 a1 1 0 0 1 1 1 V8.5 H2 Z"
        fill={wash}
        stroke={c}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
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
      <circle cx="5.5" cy="6" r="1.1" fill={c} opacity="0.7" />
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
      <line x1="8" y1="3" x2="8" y2="13" stroke={c} strokeWidth="1.2" />
      <line x1="6.75" y1="5" x2="9.25" y2="5" stroke={c} strokeWidth="0.9" />
      <line x1="6.75" y1="7" x2="9.25" y2="7" stroke={c} strokeWidth="0.9" />
      <line x1="6.75" y1="9" x2="9.25" y2="9" stroke={c} strokeWidth="0.9" />
      <line x1="6.75" y1="11" x2="9.25" y2="11" stroke={c} strokeWidth="0.9" />
    </IconBox>
  );
}
