# Theme Contract

Authoring reference for huozi product themes. Read this once and you
can produce a working theme bundle.

This contract is the boundary between **information architecture**
(what the product is) and **visual identity** (what the product looks
like). Everything on the IA side is hardcoded and shipped; everything
on the visual side is swappable.

> **Out of scope:** the marketing site (`huozi-marketing` repo) and
> the `/p/<slug>` published surface. `/p` is intentionally controlled
> by the file's author, not the site theme — see `processHtmlDirect`
> and the workspace embed `@scope` strategy.
>
> **What this contract does NOT cover:** in-product AI generation of
> themes. Theme bundles are authored externally (humans, or Claude in
> a separate session) and dropped in. The product loads them.

---

## 0. Quickstart

A minimum theme is **one file**:

```jsonc
// theme/<your-name>/theme.json
{
  "name": "your-name",
  "version": 1,
  "extends": "default",
  "tokens": {
    "background": "#hex",
    "foreground": "#hex",
    "muted": "#hex",
    "accent": "#hex"
  }
}
```

Override only what you want different. Anything you omit inherits
from `default`. The 4-token recipe above changes the dominant
palette; everything else (geometry, motion, typography) stays as the
default theme defined them.

**Want to go further?** Override these next, in order of impact:

1. `font-sans` / `font-mono` / `font-serif` — typeface flip
2. `radius` + sledgehammer rule (see §3.1) — corner shape
3. `border-width` / `shadow` — geometric weight
4. `surface-elevated` / `surface-active` — interaction-state colors
5. Component overrides via `huozi-` classes (see §4) — pull off
   distinctive single-component looks (stamped pills, custom buttons)

The reference theme `brutal-mono` exercises all five. Read its block
in `src/app/globals.css` to see a complete example.

---

## 1. The boundary

| Belongs to IA (hardcoded) | Belongs to Theme (swappable) |
|---|---|
| Component tree & layout flow | Colors |
| Semantic class names (`huozi-row`, `huozi-button`) | Fonts (sans / mono / serif / display) |
| ARIA roles, keyboard handling | Border width, radius, shadow style |
| Routes & data flow | Motion duration / easing |
| i18n keys & copy | Decorative elements (paper grain, ink reveals) |
| `<Icon name="folder" />` call sites | The icon glyphs that name maps to |

If you can't decide whether something is IA or visual, ask: *would a
brand reskin reasonably want to change it?* If yes → theme. If a
reskin would break the product's information design → IA.

---

## 2. Token reference

All tokens are CSS custom properties on `:root` (default theme) and
`[data-theme="<name>"]` (alternate themes), then re-exposed via
Tailwind v4 `@theme inline { … }` in `src/app/globals.css`.

### 2.1 Color (14 tokens)

| Token | Default | brutal-mono | Used for |
|---|---|---|---|
| `--background` | `#faf8f3` | `#fff8e1` | Page canvas (body, main content) |
| `--foreground` | `#2d2519` | `#000000` | Default text color |
| `--muted` | `#f3efe6` | `#ffd60a` | Secondary surfaces — sidebar, dropdown panel, hover fills |
| `--muted-foreground` | `#6b5d4b` | `#000000` | Text inside `--muted` regions |
| `--border` | `#ddd4c2` | `#000000` | Default divider color |
| `--primary` | `#2d2519` | `#000000` | Strong fills, brand-anchor pills |
| `--primary-foreground` | `#faf8f3` | `#fff8e1` | Text on `--primary` |
| `--accent` | `#c4594a` | `#c4594a` | Brand emphasis: links, hover, brand glyph color |
| `--accent-foreground` | `#faf8f3` | `#fff8e1` | Text on `--accent` |
| `--destructive` | `#c4594a` | `#ef4444` | Danger fills (delete, error banner) |
| `--destructive-foreground` | `#faf8f3` | `#ffffff` | Text on `--destructive` |
| `--info` | `#5b7a99` | `#7dd3fc` | Metadata pills (runtime tags, "Claude Code" style) |
| `--info-foreground` | `#faf8f3` | `#000000` | Text on `--info` |
| `--surface-elevated` | `#ffffff` | `#ffffff` | Floating / elevated surfaces — top bar, hover blocks, button rest |
| `--surface-active` | `#c4594a` | `#ff85a2` | Vibrant pop — active-selection block, primary CTA |

**Naming rule.** Pair every fill color with a `-foreground` token.
Theme authors who tune contrast must change both halves of the pair
together — never let `--accent` and `--accent-foreground` drift.

### 2.2 Typography (4 tokens)

| Token | Default | brutal-mono |
|---|---|---|
| `--font-sans-stack` | `var(--font-geist-sans)` | `"JetBrains Mono", ui-monospace, Menlo, monospace` |
| `--font-mono-stack` | `var(--font-geist-mono)` | (same as sans) |
| `--font-serif-stack` | `"Noto Serif SC", serif` | (same as sans) |
| `--font-display-stack` | (= serif) | (same as sans) |

A theme can point all four at one family for a single-typeface look
(brutal-mono does). Re-exposed to Tailwind via `--font-sans` /
`--font-mono` / `--font-serif` / `--font-display`.

If your theme uses a custom font, declare it in `theme.json`:

```jsonc
"fonts": [
  { "family": "JetBrains Mono", "src": "fonts/jetbrains-mono.woff2", "weight": "400 700" }
]
```

### 2.3 Geometry (4 tokens)

| Token | Default | brutal-mono |
|---|---|---|
| `--radius` | `0.375rem` | `0` |
| `--radius-sm` | `0.25rem` | `0` |
| `--border-width` | `1px` | `2px` |
| `--border-width-strong` | `2px` | `3px` |

Tailwind's `rounded-*` utilities don't read `--radius` — they emit
fixed values. To enforce "lines are straight," brutal-mono adds a
sledgehammer rule (see §3.1). Other themes that want non-default
radii must do the same.

### 2.4 Shadow (2 tokens)

| Token | Default | brutal-mono |
|---|---|---|
| `--shadow` | `0 4px 12px -2px rgba(45, 37, 25, 0.08), 0 2px 4px -1px rgba(45, 37, 25, 0.04)` | `4px 4px 0 #000` |
| `--shadow-block` | (= `--shadow`) | `6px 6px 0 #000` |

`--shadow` is the resting elevation; `--shadow-block` is the lifted /
emphasized state. In default theme they collapse to one soft shadow;
in brutal they're two hard offsets at different intensities.

### 2.5 Motion (2 tokens)

| Token | Default | brutal-mono |
|---|---|---|
| `--motion-duration` | `200ms` | `80ms` |
| `--motion-easing` | `cubic-bezier(0.4, 0, 0.2, 1)` | `steps(2, end)` |

### 2.6 Layout variables (internal — override only if you must)

These aren't part of the public token contract; they're structural
constants the shell components reference so that one number doesn't
have to be repeated in two places. A theme *may* override them on
its `[data-theme]` block if it needs (e.g.) a taller header, but
most themes leave them alone.

| Var | Default | Notes |
|---|---|---|
| `--shell-header-height` | `3rem` (48px) | Top app-header height. Consumed by `AppHeader`'s inner row and the workspace-shell `<aside>`'s sticky `top` + `height`. Keep these in sync. |

### 2.7 Decoration toggles (2 tokens)

| Token | Default | brutal-mono | Effect |
|---|---|---|---|
| `--decoration-paper-grain` | `0.03` | `0` | Opacity of the body grain overlay |
| `--decoration-ink-animations` | `1` | `0` | `0` skips `animate-float` / `animate-mist` / `animate-ink-reveal` |

Decoration toggles are numeric, not booleans, so themes can also
*tone down* without disabling (e.g. `0.5` paper-grain for half
opacity).

---

## 3. Block grammar (the visual pattern)

Themes that want strong interaction states should pick a consistent
"block grammar" — what does an interactive surface look like at
rest, hover, and active?

The default theme uses **flat fills**: hover and active are tinted
backgrounds with no border or shadow change. Subtle, paper-like.

The `brutal-mono` reference theme uses **stamped blocks**:

| State | Surface | Border | Shadow |
|---|---|---|---|
| Rest | (transparent) | 1px transparent | none |
| Hover | `--surface-elevated` (white) | 1px `--border` (black) | `2px 2px 0 var(--border)` |
| Active | `--surface-active` (pink) | 1px `--border` (black) | `2px 2px 0 var(--border)` |
| Button rest | `--surface-elevated` | 1px `--border` | `2px 2px 0 var(--border)` |
| Button hover | `--surface-elevated` | 1px `--border` | `--shadow` (4×4) |
| Button pressed | `--surface-active` | 1px `--border` | none + `translate(2px, 2px)` |

Apply this by writing CSS scoped to your theme that targets the
`huozi-row` / `huozi-tile` / `huozi-button` classes (see §4).

### 3.1 Sledgehammer for corners

Tailwind's `rounded-md` etc. don't read `--radius`. brutal-mono uses:

```css
[data-theme="brutal-mono"] *:not([class*="rounded-full"]) {
  border-radius: 0 !important;
}
```

The carve-out for `rounded-full` keeps avatars / status dots
circular (intentional curves that survive the hard-edge rule).

---

## 4. Component classes (theme-scoped overrides)

Tokens cover the bulk of theming, but a handful of high-leverage
components carry visual identity that no single token can capture
(stamped pill, white top bar, block-style button). For these, the
component exposes a **stable class name**, and themes write
`[data-theme="<name>"] .huozi-<class> { … }` rules.

### 4.1 Class registry

All theme-overridable component classes use the `huozi-` prefix.

| Class | Component | Purpose |
|---|---|---|
| `huozi-app-header` | `AppHeader` `<header>` | Top sticky bar |
| `huozi-app-trigger` | `UserMenu` button | Workspace identity pill |
| `huozi-app-menu` | `UserMenu` / `FileActionsMenu` dropdown | Floating panel container |
| `huozi-shell-panel` | `WorkspaceShell` left `<aside>` | Sidebar surface |
| `huozi-row` | NavRow / workspace-switch / home / exit / file-tree row / recent-panel row / workspace-search result / `FileActionsMenu` MenuLink + MenuButton | Any interactive list row. Active row sets `aria-current="page"` |
| `huozi-tile` | `LocaleGrid` / `ThemeGrid` button | Picker tile. Active tile sets `aria-pressed="true"` |
| `huozi-button` | `FileActionsMenu` trigger / `FullscreenToggleButton` | Block-style action button |
| `huozi-icon` (planned) | `Icon` wrapper | Per-icon override hook |
| `huozi-icon-<name>` (planned) | `Icon` wrapper | Override single icon |

Authors add a class only when the component has a recognizable
"role" that a theme might want to restyle as a unit. Don't add
classes preemptively — wait until a theme actually needs the hook.

### 4.2 What overrides may NOT touch

- **Component children's structure.** Override styling, not layout.
  If you find yourself wishing you could rearrange children from
  CSS, the component is missing a prop or composition slot — fix
  upstream instead.
- **Display-essential properties** (display, position, z-index) on
  elements other than the targeted root. Cascading these breaks
  layout in surprising ways.
- **Text content.** `::before { content: "X" }` to inject characters
  is a leak from theme into IA. Use the icon registry instead.

### 4.3 Currently shipped overrides (brutal-mono)

| Class | Effect |
|---|---|
| `huozi-app-header` | White surface (`--surface-elevated`) with thick black bottom border |
| `huozi-app-trigger` | Black-bg yellow-text pill, hard offset shadow, –1.5° stamp rotation; hover lifts via `--shadow-block` |
| `huozi-app-menu` | Yellow panel (`--muted`), black foreground, full-strength dividers, hard offset shadow |
| `huozi-app-menu > [class*="border-b"]` | Section dividers bumped to `--border-width` (2px) for the brutal "everything stronger" look |
| `huozi-shell-panel` | Yellow sidebar surface (`--muted`); right border bumped to `--border-width-strong` full-opacity black to delineate against the cream main content |
| `huozi-row[aria-current="page"]` / `huozi-tile[aria-pressed="true"]` | `--surface-active` block: 1px black border + 2×2 offset shadow + 6px margin |
| `huozi-row:not([aria-current="page"]):hover` / `huozi-tile:not([aria-pressed="true"]):hover` | `--surface-elevated` block: same border + shadow + margin |
| `huozi-button` | Block-style: white fill, black border, 2×2 shadow at rest; 4×4 shadow on hover; pressed state sinks via `translate(2px, 2px)` and switches to `--surface-active` |
| `.prose pre` / `.prose-huozi pre` / `:not(pre) > code` | Code-block terminal stamp: black bg, hardcoded yellow `#ffd60a` text (visual rhyme with the workspace pill), thick border, hard offset shadow |

---

## 5. Icon registry

Icons are referenced by **semantic name** at call sites
(`<Icon name="files" />`) and resolved through
`src/components/icon/registry.tsx`. Source of truth is that file —
this section is the human-readable index.

### 5.1 Names shipped in Phase 1

| Name | Default rendering | Used at |
|---|---|---|
| `brand` | `字` (CJK serif glyph) | UserMenu trigger |
| `files` | `云` | UserMenu nav |
| `members` | `人` | UserMenu nav |
| `joined` | `入` | JoinedToast |
| `external` | `↗` | UserMenu shares / home |
| `arrow-right` | `→` | UserMenu workspace switch / exit |
| `chevron-down` | inline SVG path | UserMenu disclosure |
| `copy` | `lucide-react/Copy` | CopyButton |
| `check` | `lucide-react/Check` | CopyButton |
| `share` | `heroicons/ShareIcon` | ShareFullscreenButton |
| `fullscreen-enter` | `heroicons/ArrowsPointingOutIcon` | FullscreenToggleButton |
| `fullscreen-exit` | `heroicons/ArrowsPointingInIcon` | FullscreenContent |

### 5.2 Authoring rules

- **All icons must respect `currentColor`.** Pass color via
  `className` (e.g. `text-accent`); never hardcode `fill` / `stroke`
  attribute colors in the registry.
- **No new icons land outside the registry.** If a component reaches
  for a glyph or SVG that isn't in `ICON_NAMES`, add it to the
  registry first, then consume via `<Icon>`. Inline glyphs are an
  IA-drift signal.
- **Theme overrides** (Phase 2): a theme bundle's `icons/` directory
  maps SVG files onto names. Loader merges per-theme registry over
  `DEFAULT_ICONS`; unmapped names fall through to the default.

### 5.3 Reserved names (not yet in registry)

`folder`, `file`, `file-image`, `file-audio`, `file-video`,
`file-pdf`, `file-archive`, `search`, `close`. Will be added when
components that need them are migrated.

---

## 6. Theme bundle format

A theme bundle is a directory:

```
my-theme/
├── theme.json          # required: tokens + meta
├── icons/              # optional: per-icon SVG overrides, named by registry key
│   ├── files.svg
│   ├── brand.svg
│   └── …
├── fonts/              # optional: woff2 files referenced from theme.json
└── decorations/        # optional: background patterns, page chrome SVGs
```

### 6.1 `theme.json`

```jsonc
{
  "name": "brutal-mono",
  "version": 1,
  "extends": "default",            // inherit unspecified tokens/icons
  "tokens": {
    "background": "#fff8e1",
    "foreground": "#000",
    "muted": "#ffd60a",
    "muted-foreground": "#000",
    "border": "#000",
    "primary": "#000",
    "primary-foreground": "#fff8e1",
    "accent": "#c4594a",
    "accent-foreground": "#fff8e1",
    "destructive": "#ef4444",
    "info": "#7dd3fc",
    "surface-elevated": "#ffffff",
    "surface-active": "#ff85a2",

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

### 6.2 Versioning & fallback

- `version: 1` is the current schema. Loader rejects unknown major versions.
- `extends: "default"` is the recommended baseline. Any token a
  theme doesn't specify falls back to the default.
- New tokens added to the contract are always backward-compatible:
  existing themes simply use the default for the new token.
- `name` must be a kebab-case identifier; it appears in the
  `data-theme` attribute, the cookie, and the registry.

---

## 7. Loading & precedence

Two delivery channels, same bundle format.

### 7.1 Edge edition (self-host) — **build-time**

The deployer drops a bundle at `theme/` in the repo root before
building. The build inlines tokens into `globals.css` and bundles
the sprite map. **One theme per Edge deployment.** This is the
white-label channel.

- env var: `HUOZI_THEME=brutal-mono` (selects which built-in to compile in)
- or filesystem: `theme/` directory (overrides built-ins)

### 7.2 Cloud edition — **runtime, per-workspace**

- Cookie `huozi-theme` (default value: `default`).
- Server-side `getTheme()` reads the cookie in the root layout,
  writes `<html data-theme="…">`. Tokens for that theme are already
  in `globals.css` (via `[data-theme="…"]` selectors), so the swap
  is zero-RTT after first paint.
- Future: per-workspace persisted theme —
  `huozi-styles/<name>/theme.json` in the workspace, loaded by the
  worker, injected as inline `<style>` in the layout. Deferred until
  the contract proves out with built-in themes.

### 7.3 Precedence (when implemented)

```
workspace-stored theme (Cloud only)
  > user cookie selection
  >     deploy-time built-in (HUOZI_THEME)
  >       compile default
```

---

## 8. What is intentionally NOT themable

These are IA, hardcoded, will not move under a theme:

- Component layout (where the user-menu sits, where the file tree sits)
- Keyboard shortcuts and ARIA labels
- Semantic class names (themes target `data-theme` + Tailwind
  tokens, not bespoke selectors per component)
- The grammar of the file tree (folder/file separation, indentation)
- The huozi mark on `/login` and `/connect` (deliberate brand
  anchor — the product's identity must remain recognizable across
  themes)

---

## 9. Authoring workflow

1. Copy `default/theme.json` (or `brutal-mono/theme.json` for a
   stronger starting point).
2. Decide which tokens to override. Prefer `extends: "default"` and
   change only what's necessary.
3. If overriding icons, drop SVGs into `icons/` named after registry
   keys (`brand.svg`, `files.svg`, …). Each SVG should use a single
   path/group with `currentColor` for fills/strokes so token color
   flows through.
4. Validate: bundle must satisfy schema in §6.1, version 1.
5. For Edge: place at `theme/<name>/`, set `HUOZI_THEME=<name>`,
   redeploy. For Cloud (future): drop at `huozi-styles/<name>/` in
   your workspace.

A Claude prompt template lives at `theme/CLAUDE-PROMPT.md` (TODO).
