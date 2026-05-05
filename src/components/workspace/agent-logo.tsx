/**
 * Stylized logo for each known Agent client type.
 *
 * Monochrome, `currentColor`-aware, same optical weight as the 字-style
 * glyphs elsewhere in the product. We deliberately do NOT try to be
 * pixel-accurate reproductions of vendor trademarks — just recognizable
 * silhouettes that read at 20×20. If a vendor provides their own mark
 * later, swap here.
 */

import type { AgentKind } from "@/lib/identity";

export interface AgentLogoProps {
  kind: AgentKind | string;
  /** Pixel size; SVG scales freely. Default 20. */
  size?: number;
  /** Optional accent color; defaults to the surrounding `color`. */
  className?: string;
}

export function AgentLogo({ kind, size = 20, className }: AgentLogoProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    className,
    "aria-hidden": true as const,
  };

  switch (kind) {
    /* ── Anthropic family · Claude Code + Claude Desktop ──
       8-pointed star — echoes Anthropic's asterisk mark. */
    case "claude-code":
    case "desktop":
      return (
        <svg {...common}>
          <path
            d="M10 1.5 L11 8 L16 5.5 L12.5 10 L18.5 11 L12.5 12 L16 14.5 L11 12 L10 18.5 L9 12 L4 14.5 L7.5 10 L1.5 11 L7.5 9 L4 5.5 L9 8 Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      );

    /* ── Cursor · arrow pointer triangle ── */
    case "cursor":
      return (
        <svg {...common}>
          <path
            d="M4 2.5 L4 15.5 L7.5 12.5 L10 17 L12 16 L9.5 11.5 L14 11.5 Z"
            fill="currentColor"
          />
        </svg>
      );

    /* ── OpenClaw · 爪 — three pads + base ──
       Chinese-built MCP agent framework; stylized as a paw print. */
    case "openclaw":
      return (
        <svg {...common}>
          <g fill="currentColor">
            <ellipse cx="5.5" cy="6.5" rx="1.8" ry="2.2" />
            <ellipse cx="10" cy="4.5" rx="1.8" ry="2.2" />
            <ellipse cx="14.5" cy="6.5" rx="1.8" ry="2.2" />
            <path d="M4.5 12 Q10 9 15.5 12 Q15 17 10 17 Q5 17 4.5 12 Z" />
          </g>
        </svg>
      );

    /* ── OpenAI Codex CLI · 6-petal blossom ──
       Echoes OpenAI's blossom/asterisk mark. Six rounded petals around
       a small core, drawn at the same optical weight as the Anthropic
       8-pointed star above so the two read as siblings, not twins. */
    case "codex":
      return (
        <svg {...common}>
          <g fill="currentColor">
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const cx = 10 + 4.6 * Math.cos(rad);
              const cy = 10 + 4.6 * Math.sin(rad);
              return (
                <ellipse
                  key={deg}
                  cx={cx}
                  cy={cy}
                  rx="2.4"
                  ry="1.4"
                  transform={`rotate(${deg} ${cx} ${cy})`}
                />
              );
            })}
            <circle cx="10" cy="10" r="1.4" />
          </g>
        </svg>
      );

    /* ── Hermes Agent (Nous Research) · headbanded bob silhouette ──
       The Hermes Agent installer + brand assets all carry an anime-style
       portrait of a girl with a short black bob and a thin headband
       across the crown. Two stacked black masses with a horizontal gap
       between them — the gap reads as the headband against any
       background. The rest (face, eyes, fringe) doesn't survive 20×20
       so we skip it; the headband cut alone is enough silhouette to
       say "this character", not "a generic bust". */
    case "hermes":
    case "hermes-agent":
      return (
        <svg {...common}>
          <g fill="currentColor">
            {/* Top crown of hair, above the headband */}
            <path d="M4.5 6 Q4 2 10 2 Q16 2 15.5 6 Z" />
            {/* Bob below the headband (the gap is the band) */}
            <path d="M4.5 7.5 Q4 12 5 15 Q6.5 17.5 10 17.8 Q13.5 17.5 15 15 Q16 12 15.5 7.5 Z" />
          </g>
        </svg>
      );

    /* ── Claude Cowork (Anthropic, chat-mode in Claude Desktop) ──
       Co-work = collaboration; we use a "C" arc trailing into three
       chat-bubble dots. Distinct from Claude Code's 8-point star so
       sibling Anthropic products read apart at a glance. */
    case "cowork":
      return (
        <svg {...common}>
          <path
            d="M14 6 A4.2 4.2 0 0 0 6 6 A4.2 4.2 0 0 0 14 14"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="6" cy="14.5" r="1" fill="currentColor" />
          <circle cx="9" cy="16.3" r="1" fill="currentColor" />
          <circle cx="12" cy="17.5" r="1" fill="currentColor" />
        </svg>
      );

    /* ── Generic Agent · concentric "any-host" mark ──
       A central dot inside a ring with four small radial ticks —
       reads as "a node connected to anything". Differentiates from
       the raw-curl `>_` glyph (which is for terminal scripts) and
       from the default fallback square (which signals "unknown"). */
    case "generic":
      return (
        <svg {...common}>
          <circle
            cx="10"
            cy="10"
            r="6.2"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
          />
          <circle cx="10" cy="10" r="1.5" fill="currentColor" />
          <path
            d="M10 1.5 L10 3.5 M10 16.5 L10 18.5 M1.5 10 L3.5 10 M16.5 10 L18.5 10"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );

    /* ── Raw HTTP / scripts · terminal prompt `>_` ── */
    case "raw-curl":
      return (
        <svg {...common}>
          <path
            d="M3.5 5 L8 10 L3.5 15"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 15 L16 15"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      );

    /* ── Fallback · single filled square — neutral marker ── */
    default:
      return (
        <svg {...common}>
          <rect x="6" y="6" width="8" height="8" rx="1.5" fill="currentColor" />
        </svg>
      );
  }
}

/**
 * Human-readable name of an Agent kind. Shared between the StatusSummary
 * and the Keys page so display stays consistent.
 */
export function agentKindName(kind: AgentKind | string): string {
  switch (kind) {
    case "claude-code":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "desktop":
      return "Claude Desktop";
    case "openclaw":
      return "OpenClaw";
    case "codex":
      return "Codex";
    case "hermes":
    case "hermes-agent":
      return "Hermes Agent";
    case "cowork":
      return "Claude Cowork";
    case "generic":
      return "Generic Agent";
    case "raw-curl":
      return "Terminal";
    case "other":
    case undefined:
    case null:
      return "Agent";
    default:
      return kind as string;
  }
}
