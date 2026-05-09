# Inline Edit — Spec

The "select text → edit" affordance on the workspace view page. Powers the
read-only-by-default Web UI's only write surface, going through the same
`huozi_edit` MCP tool an Agent would call.

This spec covers the framework: object model, selection→object resolution,
per-type strategies, and the display-overlay layer. Per-type details
(which mdast / DOM nodes count as objects, byte-encoding rules) live in
each strategy file's docblock.

Read alongside `four-types.md` (data-type framing) and
`packages/huozi-cloud/SPEC.md` (huozi_edit semantics on the server side).

---

## 1. Goals & non-goals

**Goals.**

- A user selects text in the rendered view, clicks "Edit", types new text,
  saves. The save lands as a normal `huozi_edit` commit, audited as the
  user.
- The flow works on all four data types — md, html, csv, jsonl — with
  one shared resolution rule and one shared modal.
- Each type's "what is the smallest editable unit" is a per-type concern,
  not a framework concern.
- Bytes-in equals bytes-out: anything the user didn't change comes back
  byte-identical, so `huozi_edit`'s exact-string semantics holds.

**Non-goals.**

- Rich-text editing (bold via toolbar, drag-drop images, etc.). The user
  edits source bytes; the rendered view is read-only-with-an-edit-loop,
  not a WYSIWYG editor.
- Multi-object batch edits. One save = one object.
- Conflict resolution beyond `parent_blob_sha` staleness checks.
  Concurrent writes to the same object surface as a `MODIFIED_SINCE_READ`
  error and the user retries.

---

## 2. The Object Model

The framework's atom is **EditObject** — the smallest editable unit at
the file's natural granularity. Each of the four types defines its own:

| Type    | Default object              | DOM marker                             |
|---------|-----------------------------|----------------------------------------|
| **md**  | inline node (`strong`, `em`, `a`, `code`, `td`, `li`, heading) or `p` if no inline ancestor | `data-obj-src="<startByte>,<endByte>"` injected by `lib/markdown/source-pos.ts` |
| **html**| any paired/void element     | `data-obj-src` injected by `lib/html/source-pos.ts` (every open tag) |
| **csv** | one cell                    | none (canvas grid — click-driven only)  |
| **jsonl**| one (line, fieldKey) pair  | `data-obj-src="jsonl:line:<n>:field:<k>"` on the rendered field span |

Every object carries:

```ts
interface EditObject {
  kind: 'md-inline' | 'html-element' | 'csv-cell' | 'jsonl-field'
  locator: ObjectLocator              // type-discriminated, see types.ts
  initialText: string                 // what lands in the modal textarea
  anchorRect?: DOMRect                // for popover positioning
}
```

The locator is what `edit-modal.tsx` hands to the strategy at save time
to compute `(old_string, new_string)`.

---

## 3. Selection → Object resolution

Two entry paths, one resolution rule.

### 3.1 Selection-driven (md / html / jsonl)

The user's text selection inside the rendered DOM. Run **least common
data-obj ancestor**:

```
A = startContainer's nearest [data-obj-src] ancestor (walking up)
B = endContainer's nearest [data-obj-src] ancestor

if A === B:                  return A
if A is ancestor of B:       return A   ← selection straddles a smaller
                                          object inside A; widen to A
if B is ancestor of A:       return B   ← mirror case
else (disjoint subtrees):    return whichever appears first
                                          in document order
```

This rule covers the three intent cases in one function:

| Selection vs. default object | Resolution                             |
|------------------------------|----------------------------------------|
| Subset (within one object)   | `A === B` → that object                |
| Exactly equals one object    | `A === B` → that object                |
| Spans into a nested object   | LCA → the parent object                |
| Spans across siblings        | First in document order                |

Concrete worked example —
`<p>讲完观察, ...是<strong>不要再...&ldquo;Agent 文档 API&rdquo;</strong>。</p>`:

| User selects                            | A         | B         | Result          |
|-----------------------------------------|-----------|-----------|-----------------|
| "Agent 文档 API" (inside strong)        | `strong`  | `strong`  | `strong` inner  |
| "讲完观察" (only paragraph text)        | `p`       | `p`       | `p` inner       |
| "讲完..." through "API\u201d" (crosses) | `p`       | `strong`  | `p` inner (LCA) |

The **modal always opens at object granularity** — never at the user's
exact byte selection. Selection picks *which* object; the modal edits
the whole thing. This avoids exposing two granularity levels to users
and keeps the anchor-expansion math simple.

### 3.2 Click-driven (csv / jsonl)

Renderers without selectable source-mapped DOM dispatch directly:

```ts
const surface = useEditableSurface()
surface?.requestEdit({
  objectKind: 'csv-cell',
  initialText: parsedCellValue,
  locator: { kind: 'csv-cell', start, end, delim },
})
```

CsvGrid uses this from RowDetailModal cell clicks (canvas can't host
DOM markers). CollectionView used to use this exclusively for jsonl;
post-Step-3 it also exposes `data-obj-src` so selection works there too.

---

## 4. Strategy interface

Per-type behavior lives in `src/components/workspace/inline-edit/strategies/`.
The empty `strategies/` directory in the repo is reserved for these.

```ts
// strategies/types.ts
export interface EditStrategy<L extends ObjectLocator = ObjectLocator> {
  kind: ObjectKind

  /** Entry point from a DOM Selection. md/html/jsonl implement this;
   *  csv leaves it null (click-only). The default impl runs the LCA
   *  resolution from §3.1; types override only when their DOM model
   *  differs. */
  fromSelection?(
    sel: Selection,
    host: HTMLElement,
  ): EditObject | null

  /** Save-time conversion. Receives the user's typed value plus the
   *  original file source (read out of the EditableSurface's data-source
   *  attribute) and returns the (old_string, new_string) pair handed to
   *  `/api/app/drive/edit`. */
  buildEdit(
    obj: EditObject,
    userValue: string,
    source: string,
  ): { old_string: string; new_string: string } | { error: string }

  /** Optional: which CodeMirror language extensions to load in the
   *  modal's EditorBody (see §6). md → markdown, html → html, csv/jsonl
   *  → none (plain text). */
  editorLanguage?: 'markdown' | 'html' | null
}

// strategies/registry.ts
export const STRATEGIES: Record<ObjectKind, EditStrategy>
```

`editable-surface.tsx` and `edit-modal.tsx` look strategies up from the
registry instead of branching on `objectKind`. Adding a fifth type
(say `tsv-cell`, `xlsx-cell`) is one new file in `strategies/` plus one
registry entry — no changes to surface or modal.

### 4.1 Per-type quick reference

| Strategy   | fromSelection? | buildEdit                                      |
|------------|----------------|------------------------------------------------|
| `md`       | ✓ default LCA  | `expandToUnique` anchor → bytes replace        |
| `html`     | ✓ default LCA + `findHtmlInnerRange` to scope to inner content | `expandToUnique` anchor → bytes replace |
| `csv`      | — (click only) | RFC4180 cell encoding around bytes replace     |
| `jsonl`    | ✓ default LCA  | re-stringify the line's raw object with the field overridden |

---

## 5. Save path (BFF & beyond)

Modal POSTs to `/api/app/drive/edit` with:

```ts
{
  file_path: string
  old_string: string         // from strategy.buildEdit()
  new_string: string         // from strategy.buildEdit()
  parent_blob_sha?: string   // freshness proof; SSR threads this through
}
```

When `parent_blob_sha` is present, the BFF skips the Read-first round
trip and goes straight to `huozi_edit`. The Worker validates the sha
and rejects on mismatch (errorCode 7 → 409 → user-visible "stale" toast).

Error mapping table is in `edit-modal.tsx#errorKey` — keep that in sync
with new MCP error codes.

---

## 6. Display overlay (CodeMirror)

The modal's textarea is replaced by an `EditorBody` component. For most
content it behaves like a textarea; for html and (rarely) markdown it
adds a **display-only overlay** that decodes safe-listed entities to
their unicode glyphs without touching the underlying bytes.

### 6.1 Why display-only

The user's typed bytes are saved verbatim. Auto-encoding (`"` → `&ldquo;`)
would break the bytes-in / bytes-out contract and create round-trip
ambiguity. Display-only side-steps the contract entirely: the document
model is bytes, the visible layer renders entities as glyphs, the cursor
treats each entity as one atomic position.

### 6.2 Whitelist (Phase 1)

Entry criterion: **decoded form has a unique, lossless unicode equivalent**.

| Entity                                    | Display |
|-------------------------------------------|---------|
| `&ldquo;` `&rdquo;` `&lsquo;` `&rsquo;`   | `\u201c \u201d \u2018 \u2019` |
| `&laquo;` `&raquo;`                       | `\u00ab \u00bb` |
| `&amp;` `&lt;` `&gt;` `&quot;` `&apos;`   | `& < > " '` |
| `&hellip;` `&mdash;` `&ndash;`            | `\u2026 \u2014 \u2013` |
| `&copy;` `&reg;` `&trade;`                | `\u00a9 \u00ae \u2122` |
| `&nbsp;`                                  | `\u00b7` (visible dot, dim) |

Phase 2: numeric character references via regex `/&#\d+;|&#x[0-9a-f]+;/i`.

Phase 3: invisible-character markers (NBSP, ZWSP, BOM, trailing whitespace)
— the *opposite* direction (bytes are unicode, display adds visibility).

### 6.3 Implementation

CodeMirror 6 primitives:

- `MatchDecorator` — runs the whitelist regex over the document
- `Decoration.replace({ widget })` — atomic widget per match
- The widget renders the decoded glyph with a dotted underline so users
  can tell entity-glyph apart from typed-glyph

CodeMirror loads lazily — first modal open pulls ~80–100 KB gzipped.
The unwrapped textarea is the SSR fallback for the first render.

### 6.4 What overlay does NOT do

- Does not decode entities on save. Bytes go out as bytes came in.
- Does not encode user-typed unicode to entities. If the user types `\u201c`,
  the file gets U+201C — not `&ldquo;`.
- Does not render markdown / html structure. `**bold**` and `<strong>`
  stay literal in the editor; only the entity *glyph* is sugar-coated.
- Does not fire on csv-cell / jsonl-field modals — those values are
  already-decoded strings.

A separate "Normalize entities → unicode" workspace action could batch-
convert at file scope, but is out of scope for the inline editor.

---

## 7. File map

```
src/components/workspace/inline-edit/
├── index.ts                      public exports
├── types.ts                      ObjectKind / ObjectLocator / EditRequest
├── editable-surface.tsx          context provider + selection→popover
├── edit-modal.tsx                modal shell (title, body, save button)
├── editor-body.tsx               textarea today, CodeMirror after Step 5
├── anchor.ts                     expandToUnique / findHtmlInnerRange
├── use-object-selection.ts       LCA selection hook
└── strategies/
    ├── types.ts                  EditStrategy interface
    ├── registry.ts               STRATEGIES record
    ├── md.ts
    ├── html.ts
    ├── csv.ts
    └── jsonl.ts

src/lib/markdown/source-pos.ts    rehype plugin (block + inline)
src/lib/html/source-pos.ts        injectSourcePositions (every open tag)
src/app/api/app/drive/edit/route.ts  BFF
```

---

## 8. Implementation steps

Tracked in the session task list. In order:

1. **Strategy scaffolding.** Move existing if/else branches into per-type
   files; surface and modal go through the registry. Pure refactor.
2. **LCA resolution fix.** Replace `commonAncestorContainer` walk with
   start/end double anchor + LCA per §3.1. Adds the nested-object case.
3. **JSONL selection input.** CollectionView wraps each rendered field
   value in a `data-obj-src` span so selection works on jsonl too.
   Click-only path stays as a fallback.
4. **MD inline granularity.** Already shipped (`source-pos.ts` annotates
   inline tags). Verify and document; no code change expected.
5. **CodeMirror EditorBody.** Replace the textarea; add Phase 1 entity
   overlay; markdown / html syntax highlighting where useful.

Phases 2/3 of the overlay (numeric refs, invisible-char markers) and the
"Normalize entities" workspace action are tracked separately.
