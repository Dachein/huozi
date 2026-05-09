/**
 * CodeMirror 6 extension: render a curated whitelist of HTML entities
 * (e.g. `&ldquo;`, `&hellip;`) as their decoded glyphs, atomically.
 *
 * Display-only — bytes are not modified. The cursor treats each entity
 * as a single position; one Backspace deletes the whole entity. See
 * docs/inline-edit.md §6.
 *
 * Glyphs render with a dotted underline so users can distinguish
 * entity-glyph from typed-glyph at a glance.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/**
 * Phase 1 whitelist — entities with a unique, lossless unicode glyph.
 * Add to this table to extend coverage. Numeric character references
 * (`&#NN;`) are Phase 2; not handled here.
 */
const ENTITIES: Record<string, string> = {
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  laquo: "\u00ab",
  raquo: "\u00bb",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  // Non-breaking space — render visible so users see the difference from " ".
  nbsp: "\u00b7",
};

const ENTITY_REGEX = new RegExp(
  `&(${Object.keys(ENTITIES).join("|")});`,
  "g",
);

class EntityWidget extends WidgetType {
  constructor(
    private readonly glyph: string,
    private readonly raw: string,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof EntityWidget && other.raw === this.raw;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.glyph;
    span.title = this.raw;
    span.style.textDecoration = "underline dotted";
    span.style.textUnderlineOffset = "3px";
    span.style.textDecorationColor = "currentColor";
    span.style.textDecorationThickness = "1px";
    span.style.opacity = "0.85";
    span.setAttribute("data-entity", this.raw);
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const entityDecorator = new MatchDecorator({
  regexp: ENTITY_REGEX,
  decoration: (match) => {
    const name = match[1]!;
    const glyph = ENTITIES[name];
    if (!glyph) return null;
    return Decoration.replace({ widget: new EntityWidget(glyph, match[0]) });
  },
});

/**
 * CodeMirror extension installing the entity overlay. Add to your
 * extension list after the language and before highlight if you want
 * the overlay to take precedence over generic token coloring.
 *
 * `provide` registers each replaced range as atomic — cursor navigation
 * (arrow keys, click, double-click word selection) treats the whole
 * `&entity;` as one unit. Without this, the cursor would pass through
 * the 5-7 invisible byte positions inside the widget, looking stuck.
 * Backspace/Delete still work — they remove the entire entity in one
 * keystroke, which is what users expect.
 */
export const entityOverlay = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = entityDecorator.createDeco(view);
    }
    update(u: ViewUpdate): void {
      this.decorations = entityDecorator.updateDeco(u, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
      ),
  },
);
