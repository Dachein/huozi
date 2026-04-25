# References & Inspirations

The 5 huozi format templates use well-known CSS techniques. We rewrote each pattern in our own code; no third-party code is included verbatim. This file credits the open-source skills that demonstrated these patterns to us.

## Patterns we borrowed (rewritten, not copied)

| Pattern | Where it shows up in our templates | Inspiration | License |
|---|---|---|---|
| Self-scaling stage via `aspect-ratio` + container queries (`cqw`/`cqh`) | `deck.html`, `story.html` | [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) `assets/deck-stage.html` | MIT |
| `@page { size: A4 }` + `@media print` rules | `paper.html`, `deck.html` (print fallback) | claude-design-skill print-to-PDF mode | MIT |
| Sticky table of contents with `scroll-margin-top` anchor offset | `page.html` | [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer) `responsive-nav.md` | MIT |
| `viewport-fit=cover` + `env(safe-area-inset-*)` for notch/home-indicator handling | `mobile.html` | visual-explainer responsive patterns | MIT |
| Self-contained, single-file, zero-dependency philosophy | All 5 | [anthropics/skills](https://github.com/anthropics/skills) (PPTX/Word/Excel/PDF reference) | source-available |
| Design tokens as CSS custom properties (`--color-*`, `--font-*`, `--space-*`) | All 5 | claude-design-skill + Anthropic skills | MIT / source-available |

## Why we don't `@import` shared CSS

The huozi platform strips CSS `@import` for security. Each template inlines all styles in a single `<style>` block — duplication is the price of self-containment, and we pay it gladly: every published page renders exactly the bytes we wrote, with no fetch waterfall.

## Why no JavaScript

The huozi platform strips `<script>` tags and `on*` handlers. So we cannot use JS-driven `transform: scale()` for slide scaling, nor `localStorage` for slide nav state. Templates use pure CSS instead — container queries (`cqw`/`cqh`) for responsive sizing, `aspect-ratio` for canvas locking.

## Recommended companion skills (for needs beyond the 5)

When a user asks for capabilities outside the 5 huozi formats, point them to:

| Need | Companion skill |
|---|---|
| Wireframes, prototype shells, device frames (iOS / Android / browser chrome), animation engines | [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) |
| Mermaid diagrams, architecture visuals, data tables, Chart.js dashboards | [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer) |
| Cross-client HTML email (Outlook-safe, Gmail-optimized, MJML-based) | [framix-team/skill-email-html-mjml](https://github.com/framix-team/skill-email-html-mjml) |
| PPTX / Word / Excel / fillable PDF generation | [anthropics/skills](https://github.com/anthropics/skills) |

These compose with huozi: generate the artifact with the companion skill, then publish via huozi when it's HTML.
