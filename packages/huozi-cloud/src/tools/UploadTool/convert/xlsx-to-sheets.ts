/**
 * xlsx → folder of CSVs (one per sheet) + a README.md table of contents.
 *
 * Worker compatibility: SheetJS (xlsx) works in `nodejs_compat` mode without
 * extra polyfill. We give it raw bytes via `XLSX.read(bytes, { type: 'buffer' })`.
 *
 * Why SheetJS over ExcelJS: SheetJS bundles the SSF number-format engine,
 * so cells with `numFmt: "0%"` render as "75%" instead of the raw "0.75"
 * — i.e. the CSV matches what a human sees in Excel. ExcelJS exposes
 * `cell.numFmt` but doesn't apply it; we'd have to re-implement SSF.
 *
 * What's lost vs the original xlsx:
 *   - Formulas → output is the LAST CALCULATED VALUE, not `=SUM(...)`.
 *     SheetJS reads the cached value from the workbook.
 *   - Cell formatting (colors / borders / conditional formatting / merged
 *     cells / charts) → none of it has CSV equivalents.
 *   - Comments / data validation → dropped.
 *   - Multiple-sheet relationships (named ranges, cross-sheet refs) → dropped.
 *
 * Date handling: with `cellDates: true` + `raw: false`, dates render in
 * the cell's own number format (e.g. "3/3/25" if the cell uses `mm-dd-yy`).
 * That matches Excel's on-screen display, which is the whole point of using
 * SheetJS. The previous ExcelJS implementation emitted ISO 8601, which was
 * mechanically convenient but didn't match what the user saw.
 *
 * Empty sheets are skipped — no point in 0-row CSV files cluttering the
 * tree. The README still lists them in the warnings if any were dropped.
 *
 * CSV escaping: we don't use `XLSX.utils.sheet_to_csv` because it doesn't
 * quote bare `\n` (it only quotes `\r\n`), which breaks RFC 4180-compliant
 * parsers. We pull formatted strings via `sheet_to_json({ raw: false })`
 * and escape ourselves — same `csvEscape` we've used since the ExcelJS
 * implementation.
 */

import * as XLSX from 'xlsx'

export interface XlsxSheet {
  name: string
  filename: string
  csv: string
  rowCount: number
  columnHeaders: string[]
}

export interface XlsxConversionResult {
  sheets: XlsxSheet[]
  /** Markdown body for `<basename>.sheets/README.md`. */
  readme: string
  /** Soft warnings (skipped empty sheets, name-collisions resolved, etc.). */
  warnings: string[]
}

/**
 * Sanitize a sheet name to be a safe filename.
 *
 * Excel allows almost anything in a sheet name (spaces, parentheses, even
 * Chinese punctuation); filesystems do not. We normalize to:
 *   - replace path separators / NUL with `_`
 *   - collapse runs of whitespace to a single space
 *   - trim
 *   - cap at 80 chars (Excel allows 31 in the spec but tools sometimes
 *     produce longer; cap is mostly to prevent pathological lengths)
 */
function sheetNameToFilename(name: string, used: Set<string>): string {
  let s = name
    .replace(/[\u0000\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (s === '') s = 'Sheet'

  // De-collide (Excel itself rejects duplicates, but we play safe).
  let candidate = `${s}.csv`
  let i = 2
  while (used.has(candidate)) {
    candidate = `${s} (${i}).csv`
    i += 1
  }
  used.add(candidate)
  return candidate
}

/**
 * RFC 4180-ish CSV escaping: wrap in quotes if the field contains a
 * comma / newline / quote, doubling embedded quotes.
 */
function csvEscape(field: string): string {
  if (/[",\n\r]/.test(field)) return `"${field.replace(/"/g, '""')}"`
  return field
}

function rowsToCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
}

export async function convertXlsxToSheets(
  bytes: Uint8Array,
): Promise<XlsxConversionResult> {
  // SheetJS accepts a Buffer or Uint8Array under type:'buffer'.
  const wb = XLSX.read(bytes, { type: 'buffer', cellDates: true })

  const sheets: XlsxSheet[] = []
  const warnings: string[] = []
  const usedFilenames = new Set<string>()

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    // No `!ref` means the sheet has no used cells at all.
    if (!ws || !ws['!ref']) {
      warnings.push(`Skipped empty sheet "${name}"`)
      continue
    }

    // header:1 → 2D array. raw:false → apply numFmt (so 0.75 with numFmt
    // "0%" comes back as "75%"). defval:'' → empty cells become "" so the
    // array stays rectangular within each row. blankrows:true → keep
    // blank rows in their original positions; we strip trailing ones below.
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    })

    // Coerce every cell to string. sheet_to_json with raw:false returns
    // strings for formatted values, but bare empty cells / numbers without
    // a numFmt may slip through as undefined / number — normalize here.
    const rows: string[][] = rawRows.map((r) =>
      (r ?? []).map((c) => (c == null ? '' : String(c))),
    )

    // Rectangularize — pad short rows out to maxCol so the CSV is square.
    const maxCol = rows.reduce((m, r) => Math.max(m, r.length), 0)
    for (const r of rows) while (r.length < maxCol) r.push('')

    // Strip purely-empty trailing rows (xlsx files often have phantom rows).
    while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === '')) {
      rows.pop()
    }
    if (rows.length === 0) {
      warnings.push(`Skipped empty sheet "${name}"`)
      continue
    }

    const filename = sheetNameToFilename(name, usedFilenames)
    const headers = rows[0] ?? []
    sheets.push({
      name,
      filename,
      csv: rowsToCsv(rows),
      rowCount: rows.length - 1, // exclude header from "data row" count
      columnHeaders: headers.slice(0, 16), // cap header preview in README
    })
  }

  return {
    sheets,
    readme: buildReadme(sheets, warnings),
    warnings,
  }
}

function buildReadme(sheets: XlsxSheet[], warnings: string[]): string {
  const lines: string[] = []
  lines.push(
    `# Workbook (${sheets.length} sheet${sheets.length === 1 ? '' : 's'})`,
  )
  lines.push('')
  lines.push(
    `> Auto-converted from a .xlsx upload. Original not retained — formulas were resolved to their last calculated value.`,
  )
  lines.push('')

  if (sheets.length > 0) {
    lines.push('| Sheet | Rows | Columns | File |')
    lines.push('|---|---|---|---|')
    for (const s of sheets) {
      const cols = s.columnHeaders
        .map((h) => h.replace(/\|/g, '\\|'))
        .join(' / ')
      const colsCell =
        cols.length > 60 ? `${cols.slice(0, 60)}…` : cols || '_(no header row)_'
      lines.push(
        `| ${s.name.replace(/\|/g, '\\|')} | ${s.rowCount} | ${colsCell} | [${s.filename}](./${encodeURIComponent(s.filename)}) |`,
      )
    }
  }

  if (warnings.length > 0) {
    lines.push('')
    lines.push('## Conversion notes')
    for (const w of warnings) lines.push(`- ${w}`)
  }

  return lines.join('\n')
}
