# The Four Types

huozi treats every file as one of four data types. This is not a UI taxonomy — it is the product's information-architecture commitment. The renderer, the new-file UX, the agent-facing tool docs, and the marketing copy all collapse to these four names.

| Type           | Format       | Mental model                                              | Built-in renderer behavior                            |
|----------------|--------------|-----------------------------------------------------------|--------------------------------------------------------|
| **Spreadsheet**| `.csv` `.tsv`| A grid of same-shape rows. Cross-sectional snapshot.      | Sortable, virtualized data grid (`CsvGrid`).           |
| **Document**   | `.md` `.mdx` | Continuous prose. Narrative.                              | Rendered Markdown with the publish-flow renderer.      |
| **Collection** | `.jsonl`     | A stream of entities, each with identity and a lifeline.  | Cards / table / timeline / current-state views (toggleable). |
| **Page**       | `.html` `.htm`| A finished visual artifact, sized to its purpose.        | Sandboxed HTML with one of five sub-formats: `web`, `mobile`, `deck`, `story`, `paper`. |

`Collection` is the newcomer (introduced 2026-05). Everything else has shipped for months. The bulk of this doc is about why Collection deserves its own slot, and how to author and render one correctly.

---

## 0. Quickstart: which type when?

Ask one question per file: **what is the unit of meaning?**

| If the unit of meaning is…           | Use         |
|--------------------------------------|-------------|
| A row, comparable across other rows  | Spreadsheet |
| A passage of prose                   | Document    |
| **An entity with a lifecycle**       | **Collection** |
| A rendered artifact someone will see | Page        |

If you find yourself wanting two types for the same file, you've conflated two units of meaning. Split the file.

---

## 1. The four, in one paragraph each

### Spreadsheet — `.csv` / `.tsv`

A homogeneous grid. Every row has the same columns. The dominant question is **"all rows where ... how many ..."** — set-oriented, aggregate-friendly. Excel mental model. The renderer is `CsvGrid` (glide-data-grid) — virtualized, sortable, search-on-page. Type inference happens client-side; there is no schema declaration.

**Limits to be honest about:** no nesting (one cell, one scalar); no schema flexibility (every row's columns are identical); type ambiguity (`""` vs null vs `0`); locale hazards (BOM, leading-zero stripping, date auto-conversion in downstream Excel). For SMB business records that need any of those, choose Collection instead.

### Document — `.md` / `.mdx`

Free-form prose with optional frontmatter. The dominant question is **"what does this say?"** — narrative-oriented, read top-to-bottom. The renderer is the same `renderMarkdown` pipeline used by the publish surface, so what you see in the workspace and what readers see at `/p/<slug>` are byte-identical.

A folder of `.md` files with shared frontmatter is a perfectly valid lightweight entity store (see §6 — Anti-patterns). Pick this when entities have prose bodies; pick Collection when they don't.

### Collection — `.jsonl`

A line-delimited stream of entity-events. Each line is one JSON object with at least an `id` field. The same `id` may appear on many lines, each line representing a moment in that entity's life. The dominant question is **"what happened to entity X?"** — entity-oriented, longitudinal.

This is the new type. The rest of this document is about it.

### Page — `.html` / `.htm`

A self-contained, sanitized HTML artifact. The dominant question is **"how does this look?"** — visual, finished, shareable. The publish flow strips `<script>` and unwanted CSS; the renderer applies a layout wrapper sized to one of five `huozi:format` declarations:

| Sub-format | Aspect / size       | Use for                                  |
|------------|---------------------|------------------------------------------|
| `web`      | flowing, no max     | Long-form web pages (default catch-all)  |
| `mobile`   | flowing, narrow     | Mobile-first long content                |
| `deck`     | 16:9, paginated     | Slide decks                              |
| `story`    | 9:16, paginated     | Vertical reels / stories                 |
| `paper`    | A4, paginated       | Print-style long documents               |

Sub-formats are sniffed from `<meta name="huozi:format">` or the body class. They are renderer hints, not separate types — every `.html` is one Page.

---

## 2. Cross-sectional vs longitudinal — the deep split

Spreadsheet and Collection look similar at a glance (both are "rows of records") but they sit on different sides of a fundamental statistical / data-modeling divide:

| Dimension                | Spreadsheet (cross-sectional)   | Collection (longitudinal)            |
|--------------------------|---------------------------------|--------------------------------------|
| What a row represents    | One subject, *now*              | One *event* in a subject's life      |
| What relates rows        | Same shape, same time           | Same `id`, ordered by time           |
| Native question          | Distribution / aggregate / compare | Trace / replay / audit             |
| Native viz               | Pivot, bar, scatter             | Timeline, gantt, status flow         |
| Schema                   | Strict, all rows identical      | Open, each line carries what it needs|
| Editing pattern          | Mutate the cell in place        | Append a new line                    |
| History                  | Lost on edit (must engineer it) | Free — the format *is* history       |
| Format peer in the wild  | SQL row, DataFrame, Parquet     | Event log, Kafka topic, Datomic datom|

These do not compete. A real CRM uses both. See §5.

---

## 3. Collection — author guide

### 3.1 The contract

A Collection file is a UTF-8 `.jsonl` file. Every non-empty line is one valid JSON object. There are **two line kinds**:

**Entity events** — the data. One field is required, three are recommended:

| Field | Required | Type   | Meaning                                          |
|-------|:--------:|--------|--------------------------------------------------|
| `id`  | **yes**  | string | Identity of the entity this line is about        |
| `at`  | recommended | RFC 3339 timestamp | When this event happened (valid time) |
| `by`  | recommended | string | Actor — `user:<id>`, `agent:<name>`, `system`    |
| `op`  | recommended | string | Business verb — `create`, `update`, `ship`, `refund_request`, ... |

Only `id` is enforced for entity events — Collection follows a **soft-schema** rule. A file with only `id` per line is still a valid Collection (it just gives up time-travel and audit). Renderers degrade gracefully when `at` / `by` / `op` are missing.

> **Why soft and not strict?** `at`/`by`/`op` are *useful* but adding them has cost (the agent has to remember to write them). Forcing them turns Collection into a ceremony. Better to recommend them, render their absence as visible-but-dim, and let the audit story emerge as files mature.

**Schema events** — the optional render config. A line with `op:"schema"` is a control record: it carries no `id` (the config is about the file, not an entity) and its `schema` payload tells the viewer how to render the Collection (field types, layout slots, filters). See §3.6. Schema events are entirely optional — without them the viewer falls back to id-as-title and a generic key/value list.

| Field    | Required | Type   | Meaning                                           |
|----------|:--------:|--------|---------------------------------------------------|
| `op`     | **yes**  | `"schema"` | Marks the line as a schema event              |
| `schema` | **yes**  | object | The render config — see §3.6                      |
| `at`     | recommended | RFC 3339 | Orders multiple schema events chronologically |
| `by`     | recommended | string | Actor                                             |
| `version`| optional | integer | Informational version label                      |

`schema` is the only `op` value with special meaning to the parser. All other `op` values (including `create`/`update`/`delete`/`restore`) are open business verbs.

### 3.2 Append-only is a discipline, not an enforcement

The format does not stop you from editing a line in place — `huozi_edit` works on `.jsonl` files like any other text file. But once you mutate, the longitudinal property is gone for that entity.

**Convention:** prefer `huozi_record_append` (and, when superseding a record, `huozi_record_supersede`) over `huozi_edit`. The renderer treats files where lines have monotonically increasing `at` values as "well-formed history"; out-of-order lines render with a small warning glyph but still parse.

### 3.3 Two writing styles

For the same business need ("order shipped"), there are two valid encodings:

**Snapshot style** — every line is a complete record of the entity at that moment.

```jsonl
{"id":"order_001","at":"...","status":"pending","items":[...],"buyer":"...","amount":1098}
{"id":"order_001","at":"...","status":"shipped","items":[...],"buyer":"...","amount":1098,"tracking":"SF12345"}
```

**Semantic-patch style** — first line is the full creation, every subsequent line carries only the fields that changed plus the action context.

```jsonl
{"id":"order_001","at":"...","by":"customer:u_123","op":"create","items":[...],"buyer":"...","amount":1098}
{"id":"order_001","at":"...","by":"staff:alice","op":"ship","carrier":"顺丰","tracking":"SF12345"}
{"id":"order_001","at":"...","by":"customer:u_123","op":"confirm"}
{"id":"order_001","at":"...","by":"customer:u_123","op":"refund_request","reason":"尺码不对","amount_to_refund":799}
```

**Recommended: semantic-patch.** It is 5–10× more compact, each line is humanly readable as a business event, and it composes naturally with the renderer's timeline view. Snapshot style is acceptable for entities that mutate so fully that "what changed" isn't a coherent question (rare in practice).

The `op` vocabulary is open. Use whatever verbs your business already speaks. The renderer treats `op` as an opaque label.

### 3.4 Reading: fold to current state

Given a Collection file, the **current state of entity X** is the result of folding all lines with `id = X` in `at` order, applying each line's fields on top of the running record. In TypeScript:

```ts
function currentState(lines: CollectionLine[], id: string): Record<string, unknown> {
  const events = lines.filter(l => l.id === id).sort((a, b) => a.at.localeCompare(b.at));
  let state: Record<string, unknown> = {};
  for (const ev of events) {
    state = { ...state, ...ev };
  }
  return state;
}
```

For semantic-patch files, the `op` field implicitly determines a state transition (e.g. `op: "ship"` ⇒ `status: "shipped"`). The renderer maintains a small built-in projector for common `op` values (`create / update / delete / restore`); custom verbs are passed through and shown as-is in the timeline.

**State-at-time-T** is the same fold, stopped at the line whose `at <= T`.

### 3.5 Compaction

Collection files grow monotonically. At small scale (< 10 MB, the workspace inline cap) this is a non-issue — full scans are fast and the workspace's commit history (`huozi_history`) already gives you file-level snapshots for free.

When a file approaches the cap, archive — do not delete:

```
products/
├── catalog.jsonl              ← current main file, kept small
└── catalog.archive/
    ├── 2025-Q1.jsonl
    └── 2025-Q2.jsonl
```

The archive folder is itself queryable. The main file holds only the last N versions per `id` (or the latest snapshot per `id` if you want minimum size).

Compaction is a maintenance operation, not a write-time concern. There is no automatic compaction in v1; it's something a user (or agent acting on the user's behalf) initiates.

### 3.6 Schema events — render config inline

The viewer ships a soft-schema fallback (id-as-title, generic key/value list) so any `.jsonl` with `id` lines renders. To get richer chrome — typed fields, avatar, layout slots, filters — append a schema event:

```jsonl
{"op":"schema","at":"2026-05-07T09:00:00Z","by":"user:alice","version":1,"schema":{
  "title": "Customers",
  "entity": {
    "title_field": "name",
    "subtitle_field": "company",
    "avatar_field": "logo"
  },
  "fields": {
    "name":     {"type": "text",   "label": "Name",     "display": "headline",    "searchable": true},
    "company":  {"type": "text",   "label": "Company",  "display": "subheadline", "filterable": true},
    "logo":     {"type": "image",  "display": "avatar"},
    "stage":    {"type": "select", "display": "aside",  "filterable": true,
                 "options": [{"value":"new","label":"New","color":"blue"}, ...]},
    "notes":    {"type": "richtext", "display": "body"}
  }
}}
```

**Field types** the viewer understands today: `text`, `richtext`, `url`, `email`, `select`, `multi_select`, `date`, `number`, `image`, `url_map`. Unknown types render as `text`.

**Display slots** for layout — where the field lands in the card / detail page:

| Slot          | Used in                                         |
|---------------|--------------------------------------------------|
| `headline`    | The main title on cards and detail header        |
| `subheadline` | Secondary line under the headline                |
| `avatar`      | The round image on cards / detail header         |
| `meta`        | Small kv list at the bottom of cards             |
| `aside`       | Right-rail properties on detail page             |
| `body`        | Main body content on detail page (for richtext)  |

**Multiple schema events accumulate.** Schema is event-sourced like everything else — append a new `{"op":"schema",...}` line to add a field or change a filter. The viewer folds all schema events in `at` order via deep-merge (later wins on scalar conflicts; nested objects merge by key; arrays replace wholesale). This means you can extend the schema without touching old lines:

```jsonl
{"op":"schema","at":"2026-05-07T09:00:00Z","schema":{"fields":{"name":{"type":"text"}}}}
{"op":"schema","at":"2026-05-20T11:00:00Z","schema":{"fields":{"seniority":{"type":"select","options":[...]}}}}
```

Result: both `name` and `seniority` are declared.

**Creating a Collection with a schema:** use `huozi_collection_init` — it writes the file with the schema event already in place and refuses to clobber existing files. Plain `huozi_write` to a `.jsonl` path still works for ad-hoc Collections without a schema; mix the styles however you like.

### 3.7 When NOT to use Collection

- **Entities have prose bodies (notes, articles, contact bios).** Use a folder of `.md` files with frontmatter. Each file is one entity; per-entity sharing via `huozi_share` works for free; backlinks are just text references.
- **Pure tabular data, no lifecycle (a static reference table — country codes, tax brackets).** Use Spreadsheet.
- **More than ~100,000 records *and* needing real query.** Use SQLite + JSON1 (a future fifth type, deliberately not in this v1 set).

---

## 4. Renderer behavior (Collection)

The renderer is **list ↔ detail**:

| View         | What it shows                                                    |
|--------------|------------------------------------------------------------------|
| **List**     | One card per `id`, latest folded state. Default landing surface. |
| **Detail**   | One entity: header (title/subtitle/avatar) + body fields + right-rail aside + chronological lifeline. Reached by clicking a card. |

Click a card on the list → drill into detail. Click "← Back" in detail → return to list.

When a schema event is present, the list cards and detail page use the schema's `entity.title_field`, `entity.avatar_field`, and per-field `display` slots to organize content. Without a schema, the renderer falls back to id-as-title and a generic key/value list.

Empty Collection files render a "this is a Collection — append your first entity" hint with a copy-pasteable agent prompt.

Implementation: `src/components/collection-view.tsx` (client island, plain DOM). Parsing, folding, and schema-fold live in `src/lib/jsonl/` (`parse.ts`, `fold.ts`; server-importable, unit-tested with vitest).

---

## 5. Running example: a small CRM, in all four types

A SMB managing 200 customers and 1,000 monthly interactions. Each of the four types pulls its weight:

```
crm/
├── README.md                          ← Document: what this workspace is for
├── customers.csv                      ← Spreadsheet: master roster (cross-sectional)
├── interactions.jsonl                 ← Collection: every touchpoint, append-only
├── deals.jsonl                        ← Collection: deal pipeline (lifecycle)
├── playbook.md                        ← Document: sales SOP, talk tracks
└── proposals/
    └── acme-corp-2026-q2.html         ← Page: a tailored proposal deck
```

| File                    | Type       | Why this type                                                |
|-------------------------|------------|--------------------------------------------------------------|
| `customers.csv`         | Spreadsheet | Stable identity record per customer (name, industry, size, region). Asked: "how many customers in 制造业?" — set query. |
| `interactions.jsonl`    | Collection | Every call/email/meeting is an event, ordered in time, attached to a customer `id`. Asked: "什么时候我们最后一次联系 acme?" — entity trace. |
| `deals.jsonl`           | Collection | A deal moves through `created → qualified → proposal_sent → won/lost`. Lifecycle is the point. |
| `playbook.md`           | Document   | Continuous prose; doesn't need to be queried, needs to be read. |
| `acme-corp-2026-q2.html`| Page       | A finished artifact a customer will see. Not data. |

A sample `interactions.jsonl` line:

```jsonl
{"id":"int_2026_05_07_001","at":"2026-05-07T14:30:00Z","by":"user:alice","op":"call","customer_id":"cust_acme","duration_min":35,"outcome":"interested","next_action":"send proposal","notes":"CTO wants to see ROI numbers, not feature list"}
```

A sample `deals.jsonl` lifecycle for one deal:

```jsonl
{"id":"deal_acme_001","at":"2026-04-01","by":"user:alice","op":"create","customer_id":"cust_acme","amount":48000,"product":"年度订阅"}
{"id":"deal_acme_001","at":"2026-04-15","by":"user:alice","op":"qualify","note":"预算确认,决策人 = CTO"}
{"id":"deal_acme_001","at":"2026-05-01","by":"user:alice","op":"proposal_sent","amount":52000,"valid_until":"2026-06-01"}
{"id":"deal_acme_001","at":"2026-05-20","by":"customer:cust_acme","op":"won","actual_amount":52000}
```

Folding the deal file by `id` gives the current state of every deal. Filtering for `op:"won"` gives the actual revenue. Filtering by `at` window gives a quarterly report. None of this needs a database server — it is all just text and a fold.

---

## 6. Anti-patterns

**Don't put prose in `.jsonl`.** A line with a 2-paragraph `body` field is a misuse — the line becomes unreadable raw. Move prose to a sibling `.md` file and reference it by path from the entity record.

**Don't use Spreadsheet for entities that change.** A `customers.csv` where you also try to track "last contact date" by editing a column is the anti-pattern Collection was invented to retire. Customers go in Spreadsheet (identity record), interactions go in Collection (events).

**Don't invent a new file extension.** A Collection is just `.jsonl`. The fact that it follows the conventions in §3 is what makes it a Collection — not a special extension. This keeps tool-compat (any `.jsonl` reader works) and avoids ecosystem fragmentation.

**Don't use Page for data.** If your `.html` exists to be queried or aggregated, you have a Spreadsheet or a Collection in disguise. Pages are end-products, not data sources.

**Don't conflate `op` with `status`.** `op` is what the actor *did*; `status` is what the resulting state *is*. The fold derives `status` from `op` — you don't need to write both.

---

## 7. Implementation pointers

| Concern                          | Where in the codebase                                 |
|----------------------------------|-------------------------------------------------------|
| Extension → Type mapping          | `src/lib/file-types.ts` (single source of truth)      |
| Renderer dispatch                | `src/components/workspace/file-renderer.tsx`          |
| Table view                       | `src/components/csv-grid.tsx`                         |
| Document view                    | `src/lib/markdown/renderer.ts`                        |
| Collection view (list ↔ detail)  | `src/components/collection-view.tsx`                  |
| Collection parser + fold         | `src/lib/jsonl/parse.ts`, `src/lib/jsonl/fold.ts` (`foldSchema` for §3.6) |
| Collection init MCP tool         | `packages/huozi-cloud/src/tools/CollectionInitTool.ts` |
| Page view                        | `src/lib/html/sanitizer.ts` + format sniffer          |
| New-file UX (4-card onboarding)  | `src/components/workspace/onboarding-prompts.tsx`     |
| i18n                             | `src/lib/i18n/{zh,en,fr,ja}.ts` (4 type names + onboarding copy) |
