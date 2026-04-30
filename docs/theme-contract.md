# Theme Contract

The single source of truth for "what is themable in huozi" and "how does a theme bundle look".

This contract is the boundary between **information architecture** (what the
product is) and **visual identity** (what the product looks like). Everything
on the IA side is hardcoded and shipped; everything on the visual side is
swappable.

> **Out of scope:** the marketing site (`huozi-marketing` repo) and the
> `/p/<slug>` published surface. `/p` is intentionally controlled by the
> author of the file, not the site theme — see `processHtmlDirect` and
> the workspace embed `@scope` strategy.
>
> **What this contract does NOT cover:** in-product AI generation of
> themes. Theme bundles are authored externally (by humans or by Claude
> in a separate session) and dropped in. The product only loads them.

---

## 1. The boundary

| Belongs to IA (hardcoded) | Belongs to Theme (swappable) |
|---|---|
| Component tree & layout flow | Colors |
| Semantic class names (`panel`, `tree-item`, `kbd`) | Fonts (sans / mono / serif / display) |
| ARIA roles, keyboard handling | Border width, radius, shadow style |
| Routes & data flow | Motion duration / easing |
| i18n keys & copy | Decorative elements (paper grain, ink reveals) |
| `<Icon name="folder" />` call sites | The icon glyphs that name maps to |

If you can't decide whether something is IA or visual, ask: *would a
brand reskin reasonably want to change it?* If yes → theme. If a reskin
would break the product's information design → IA.

---

## 2. Token surface

All tokens are CSS custom properties on `:root` (default theme) and
`[data-theme="<name>"]` (alternate themes), then re-exposed via
Tailwind v4 `@theme inline { … }` in `src/app/globals.css`.

### 2.1 Color (12 tokens)

| Token | Meaning |
|---|---|
| `--background` | Primary canvas color (body) |
| `--foreground` | Default text color |
| `--muted` | Secondary surfaces (cards, hover states) |
| `--muted-foreground` | Secondary text |
| `--border` | Default 1px divider color |
| `--primary` | Strong actions / emphasis fills |
| `--primary-foreground` | Text on `--primary` |
| `--accent` | Brand accent (links, highlights) |
| `--accent-foreground` | Text on `--accent` |
| `--destructive` | Danger fills + text |
| `--destructive-foreground` | Text on `--destructive` |
| `--info` | Metadata / runtime tags (e.g. cyan "Claude Code" pills) |
| `--info-foreground` | Text on `--info` |

### 2.2 Typography (4 tokens)

| Token | Default | Notes |
|---|---|---|
| `--font-sans` | Geist | Body, UI labels |
| `--font-mono` | Geist Mono | Paths, code, keys |
| `--font-serif` | Noto Serif SC | Headlines, brand glyphs |
| `--font-display` | (= serif) | Hero / cover usage |

A theme can point all four at the same family if it wants a
single-typeface look (e.g. brutal mono uses one family for everything).

### 2.3 Geometry (4 tokens)

| Token | Default | Notes |
|---|---|---|
| `--radius` | `0.375rem` (6px) | Default corner radius |
| `--radius-sm` | `0.25rem` | Inputs, pills |
| `--border-width` | `1px` | Default border thickness |
| `--border-width-strong` | `2px` | Emphasized borders (selected items, primary buttons) |

### 2.4 Shadow (2 tokens)

| Token | Default | Notes |
|---|---|---|
| `--shadow` | soft drop | Default elevation (menus, dialogs) |
| `--shadow-block` | (= shadow) | Hard offset, for brutal-style themes |

### 2.5 Motion (2 tokens)

| Token | Default | Notes |
|---|---|---|
| `--motion-duration` | `200ms` | Default transition duration |
| `--motion-easing` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default easing |

### 2.6 Decoration toggles (2 tokens)

| Token | Default | Notes |
|---|---|---|
| `--decoration-paper-grain` | `0.03` | Opacity of the body grain overlay. `0` disables. |
| `--decoration-ink-animations` | `1` | `0` skips `animate-float` / `animate-mist` / `animate-ink-reveal`. |

Decorations are themable on/off via numeric/boolean tokens. Components
multiply by these tokens so a theme can disable all motion at once.

---

## 3. Icon registry

Icons are referenced by **semantic name** at call sites
(`<Icon name="files" />`) and resolved through
`src/components/icon/registry.tsx`. Source of truth is that file —
this section is the human-readable index.

### 3.1 Names shipped in Phase 1

| Name | Default rendering | Used at |
|---|---|---|
| `brand` | `字` (CJK serif glyph) | UserMenu trigger |
| `files` | `云` (CJK serif glyph) | UserMenu nav |
| `members` | `人` (CJK serif glyph) | UserMenu nav |
| `joined` | `入` (CJK serif glyph) | JoinedToast |
| `external` | `↗` | UserMenu shares / home |
| `arrow-right` | `→` | UserMenu workspace switch / exit |
| `chevron-down` | inline SVG path | UserMenu disclosure |
| `copy` | `lucide-react/Copy` | CopyButton |
| `check` | `lucide-react/Check` | CopyButton |
| `share` | `heroicons/ShareIcon` | ShareFullscreenButton |
| `fullscreen-enter` | `heroicons/ArrowsPointingOutIcon` | FullscreenToggleButton |
| `fullscreen-exit` | `heroicons/ArrowsPointingInIcon` | FullscreenContent |

Phase 1 has migrated only the call sites that use the brand-decoration
glyphs (字 / 云 / 人 / 入) and the user-menu's nav arrows / chevron.
Utility-icon entries (`copy`, `check`, `share`, `fullscreen-*`) are
present in the registry so themes can override them, but the original
component imports have not been swapped — they will be on demand.

### 3.2 Authoring rules

- **All icons must respect `currentColor`.** Pass color via
  `className` (e.g. `text-accent`); never hardcode `fill` / `stroke`
  attribute colors in the registry.
- **No new icons land outside the registry.** If a component reaches
  for a glyph or SVG that isn't in `ICON_NAMES`, add it to the
  registry first, then consume via `<Icon>`. Inline glyphs are an IA
  drift signal.
- **Theme overrides** (Phase 2): a theme bundle's `icons/` directory
  maps SVG files onto names. Loader merges per-theme registry over
  `DEFAULT_ICONS`; unmapped names fall through to the default.

### 3.3 Reserved names (not yet in registry)

These will be added when components that need them are themed:

`folder`, `file`, `file-image`, `file-audio`, `file-video`, `file-pdf`,
`file-archive`, `search`, `close`.

---

## 4. Theme-scoped component overrides

Tokens cover the bulk of theming, but a handful of high-leverage
components carry visual identity that no single token can capture
(e.g. Slock's signature stamped pill is a specific composition of
background + foreground + border + shadow + slight rotation). For
these, we use a narrow escape hatch:

1. The component exposes a **stable, semantic class name** on its
   root element (e.g. `huozi-app-trigger` on the user-menu button).
2. The default theme leaves that class unstyled — Tailwind classes
   on the same element handle default appearance.
3. Alternate themes write `[data-theme="<name>"] .huozi-<class> { … }`
   rules in `globals.css` (or, in Phase 2, in their bundle's CSS).

### 4.1 Class naming convention

All theme-overridable component classes use the `huozi-` prefix:

| Class | Component | Purpose |
|---|---|---|
| `huozi-app-trigger` | `UserMenu` button | Workspace identity pill |
| `huozi-icon` (planned) | `Icon` wrapper | Per-icon override hook |
| `huozi-icon-<name>` (planned) | `Icon` wrapper | Override single icon |

Authors add a class here only when the component has a recognizable
"role" that a theme might want to restyle as a unit. Don't add classes
preemptively — wait until a theme actually needs the hook.

### 4.2 What overrides may NOT touch

- **Component children's structure.** Override styling, not layout.
  If you find yourself wishing you could rearrange children from CSS,
  the component is missing a prop or composition slot — fix that
  upstream instead.
- **Display-essential properties** (display, position, z-index) on
  elements other than the targeted root. Cascading these down breaks
  the host page in surprising ways.
- **Text content.** `::before { content: "X" }` to inject characters
  is a leak from theme into IA. Use the icon registry instead.

### 4.3 Currently shipped overrides

| Theme | Class | Effect |
|---|---|---|
| `brutal-mono` | `huozi-app-trigger` | Black-bg yellow-text pill, hard offset shadow, –1.5° stamp rotation; hover lifts via `--shadow-block` |

---

## 5. Theme bundle layout

A theme bundle is a directory with this shape:

```
my-theme/
├── theme.json          # required: tokens + meta
├── icons/              # optional: per-icon SVG overrides, named by registry key
│   ├── files.svg
│   ├── members.svg
│   ├── brand.svg
│   └── …
├── fonts/              # optional: woff2 files referenced from theme.json
└── decorations/        # optional: background patterns, page chrome SVGs
```

### 5.1 `theme.json`

```jsonc
{
  "name": "brutal-mono",
  "version": 1,
  "extends": "default",            // inherit unspecified tokens/icons
  "tokens": {
    "background": "#fefae0",
    "foreground": "#000",
    "muted": "#fff7c2",
    "border": "#000",
    "primary": "#000",
    "primary-foreground": "#fefae0",
    "accent": "#ff4d8d",
    "font-sans": "JetBrains Mono, ui-monospace, monospace",
    "font-serif": "JetBrains Mono, ui-monospace, monospace",
    "radius": "0",
    "border-width": "2px",
    "border-width-strong": "3px",
    "shadow": "4px 4px 0 #000",
    "shadow-block": "6px 6px 0 #000",
    "motion-duration": "80ms",
    "decoration-paper-grain": "0",
    "decoration-ink-animations": "0"
  },
  "fonts": [
    {
      "family": "JetBrains Mono",
      "src": "fonts/jetbrains-mono.woff2",
      "weight": "400 700"
    }
  ]
}
```

### 5.2 Versioning & fallback

- `version: 1` is the current schema. Loader rejects unknown major versions.
- `extends: "default"` is the recommended baseline. Any token a theme
  doesn't specify falls back to the default.
- New tokens added to the contract are always backward-compatible:
  existing themes simply use the default for the new token.

---

## 6. Loading & precedence

Two delivery channels, same bundle format:

### 6.1 Edge edition (self-host) — **build-time**

The deployer drops a bundle at `theme/` in the repo root before
building. The build inlines tokens into `globals.css` and bundles the
sprite map. **One theme per Edge deployment.** This is the white-label
channel.

- env var: `HUOZI_THEME=brutal-mono` (selects which built-in to compile in)
- or filesystem: `theme/` directory (overrides built-ins)

### 6.2 Cloud edition — **runtime, per-workspace**

- Cookie `huozi-theme` (default value: `default`).
- Server-side `getTheme()` reads the cookie in the root layout, writes
  `<html data-theme="…">`. Tokens for that theme are already in
  `globals.css` (via `[data-theme="…"]` selectors), so the swap is
  zero-RTT after first paint.
- Future: per-workspace persisted theme — `huozi-styles/<name>/theme.json`
  in the workspace, loaded by the worker, injected as inline `<style>`
  in the layout. This deferred until the contract proves out with
  built-in themes.

### 6.3 Precedence (when implemented)

```
workspace-stored theme (Cloud only)
  > user cookie selection
  >     deploy-time built-in (HUOZI_THEME)
  >       compile default
```

---

## 7. What is intentionally NOT themable

These are IA, hardcoded, will not move under a theme:

- Component layout (where the user-menu sits, where the file tree sits)
- Keyboard shortcuts and ARIA labels
- The semantic class names on elements (themes target `data-theme` +
  Tailwind tokens, not bespoke selectors per component)
- The grammar of the file tree (folder/file separation, indentation)
- The huozi mark on `/login` and `/connect` (deliberate brand anchor —
  the product's identity must remain recognizable across themes)

---

## 8. Authoring workflow (humans + AI)

Either a human designer or Claude (in an external session) can produce
a bundle. The minimal recipe:

1. Copy `theme/default/theme.json` as a starting point.
2. Decide which tokens to override. Prefer `extends: "default"` and
   override only what's needed.
3. If overriding icons, drop SVGs into `icons/` named after registry
   keys. Each SVG should be a single path/group with `currentColor`
   for fills/strokes (so token color flows through).
4. Validate: the bundle must satisfy the schema in §5.1, version 1.
5. For Edge: place at `theme/<name>/`, set `HUOZI_THEME=<name>`,
   redeploy. For Cloud (future): drop at
   `huozi-styles/<name>/` in your workspace.

A Claude prompt template lives at `theme/CLAUDE-PROMPT.md` (TODO,
Phase 1).
