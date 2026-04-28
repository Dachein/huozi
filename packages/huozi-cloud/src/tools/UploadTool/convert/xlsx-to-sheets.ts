/**
 * xlsx → folder of CSVs (one per sheet) + a README.md table of contents.
 *
 * Worker compatibility: ExcelJS works in `nodejs_compat` mode without
 * extra polyfill. We give it raw bytes via `Workbook.xlsx.load(Buffer)`.
 *
 * What's lost vs the original xlsx:
 *   - Formulas → output is the LAST CALCULATED VALUE, not `=SUM(...)`.
 *     ExcelJS reads the cached value from the workbook.
 *   - Cell formatting (colors / borders / conditional formatting / merged
 *     cells / charts) → none of it has CSV equivalents.
 *   - Comments / data validation → dropped.
 *   - Multiple-sheet relationships (named ranges, cross-sheet refs) → dropped.
 *
 * Date handling: ExcelJS returns Date objects for date cells. We emit ISO
 * 8601 (`2026-01-15`). The default would be the Excel serial number, which
 * is meaningless to humans and most tools.
 *
 * Empty sheets are skipped — no point in 0-row CSV files cluttering the
 * tree. The README still lists them in the warnings if any were dropped.
 */

import ExcelJS from 'exceljs'

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
 * Render a single ExcelJS cell value to its CSV-friendly string form.
 * ExcelJS's `cell.value` is a polymorphic union — we pull out the value
 * a human would see if the workbook were open in Excel.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    // Formula cell: `{ formula, result }`. Use the cached result —
    // re-evaluating formulas in the worker is not in scope.
    if ('result' in value && value.result !== undefined) {
      return cellToString(value.result as ExcelJS.CellValue)
    }
    // Hyperlink cell: `{ text, hyperlink }`. Display text wins.
    if ('text' in value && typeof value.text === 'string') return value.text
    // Rich text run: `{ richText: [{ text }] }`.
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text ?? '').join('')
    }
    if ('error' in value) return `#${String(value.error)}`
  }
  return String(value)
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
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as never)

  const sheets: XlsxSheet[] = []
  const warnings: string[] = []
  const usedFilenames = new Set<string>()

  wb.eachSheet((ws) => {
    // ws.rowCount is the largest used row index. We iterate from 1 for
    // human-friendliness (matches Excel).
    if (ws.rowCount === 0) {
      warnings.push(`Skipped empty sheet "${ws.name}"`)
      return
    }

    const rows: string[][] = []
    let maxCol = 0
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const cells: string[] = []
      // ExcelJS rows are sparse — getCell(c) for unused cells returns the
      // cell slot but with a null value. We materialize up to the max
      // column we've seen so the CSV stays rectangular.
      const localMax = Math.max(maxCol, row.cellCount)
      for (let c = 1; c <= localMax; c++) {
        cells.push(cellToString(row.getCell(c).value))
      }
      maxCol = localMax
      rows.push(cells)
    }

    // Pad earlier rows out to maxCol so the CSV is rectangular.
    for (const r of rows) {
      while (r.length < maxCol) r.push('')
    }

    // Strip purely-empty trailing rows (xlsx files often have phantom rows).
    while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === '')) {
      rows.pop()
    }
    if (rows.length === 0) {
      warnings.push(`Skipped empty sheet "${ws.name}"`)
      return
    }

    const filename = sheetNameToFilename(ws.name, usedFilenames)
    const headers = rows[0] ?? []
    sheets.push({
      name: ws.name,
      filename,
      csv: rowsToCsv(rows),
      rowCount: rows.length - 1, // exclude header from "data row" count
      columnHeaders: headers.slice(0, 16), // cap header preview in README
    })
  })

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
