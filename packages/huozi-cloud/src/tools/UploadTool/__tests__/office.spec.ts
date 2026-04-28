import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { InMemoryStorage } from '../../../storage/memory.js'
import { InMemoryReadFileState } from '../../../state/ReadFileState.js'
import type { ToolUseContext } from '../../../types.js'
import { createUploadTool } from '../UploadTool.js'
import { classifyOfficeUpload } from '../convert/office-detect.js'
import { convertXlsxToSheets } from '../convert/xlsx-to-sheets.js'

function ctx(): ToolUseContext {
  return {
    workspaceId: 'ws_test',
    principalId: 'agent_1',
    principalType: 'agent',
    scopePath: null,
    readFileState: new InMemoryReadFileState(),
  }
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

async function buildXlsx(
  sheets: Array<{ name: string; rows: (string | number | Date)[][] }>,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name)
    for (const row of s.rows) ws.addRow(row)
  }
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Buffer
  // Workbook returns a Buffer; normalize to Uint8Array regardless.
  return new Uint8Array(buf as never)
}

describe('classifyOfficeUpload', () => {
  it('routes docx / xlsx to converter, others to passthrough', () => {
    expect(classifyOfficeUpload('a.docx').kind).toBe('docx')
    expect(classifyOfficeUpload('a.xlsx').kind).toBe('xlsx')
    expect(classifyOfficeUpload('a.pdf').kind).toBe('passthrough')
    expect(classifyOfficeUpload('a.png').kind).toBe('passthrough')
    expect(classifyOfficeUpload('no-extension').kind).toBe('passthrough')
  })

  it('rejects pptx / ppt / doc / xls and OpenDocument / Apple formats', () => {
    for (const ext of ['.pptx', '.ppt', '.doc', '.xls', '.odt', '.ods', '.odp', '.pages', '.numbers', '.key']) {
      const c = classifyOfficeUpload(`x${ext}`)
      expect(c.kind).toBe('rejected')
      expect(c.rejectReason).toBeTruthy()
    }
  })

  it('case-insensitive on extension', () => {
    expect(classifyOfficeUpload('REPORT.DOCX').kind).toBe('docx')
    expect(classifyOfficeUpload('Slides.PPTX').kind).toBe('rejected')
  })
})

describe('convertXlsxToSheets', () => {
  it('produces one CSV per non-empty sheet plus a README', async () => {
    const xlsx = await buildXlsx([
      {
        name: 'Sales',
        rows: [
          ['Product', 'Q1', 'Q2'],
          ['Alpha', 100, 150],
          ['Beta', 200, 250],
        ],
      },
      {
        name: 'Forecast',
        rows: [
          ['Month', 'Value'],
          ['Jan', 50],
          ['Feb', 75],
        ],
      },
    ])

    const result = await convertXlsxToSheets(xlsx)
    expect(result.sheets).toHaveLength(2)
    expect(result.sheets[0]?.name).toBe('Sales')
    expect(result.sheets[0]?.filename).toBe('Sales.csv')
    expect(result.sheets[0]?.csv).toContain('Alpha,100,150')
    expect(result.sheets[1]?.csv).toContain('Jan,50')
    expect(result.readme).toContain('| Sales |')
    expect(result.readme).toContain('| Forecast |')
  })

  it('handles dates as ISO 8601', async () => {
    const xlsx = await buildXlsx([
      {
        name: 'Dates',
        rows: [['Day'], [new Date('2026-01-15T00:00:00Z')]],
      },
    ])
    const result = await convertXlsxToSheets(xlsx)
    expect(result.sheets[0]?.csv).toContain('2026-01-15')
  })

  it('escapes values containing commas / quotes', async () => {
    const xlsx = await buildXlsx([
      {
        name: 'Quotes',
        rows: [['name', 'note'], ['ok', 'has,comma'], ['ok2', 'has"quote']],
      },
    ])
    const result = await convertXlsxToSheets(xlsx)
    expect(result.sheets[0]?.csv).toContain('"has,comma"')
    expect(result.sheets[0]?.csv).toContain('"has""quote"')
  })

  it('skips empty sheets and lists them as warnings', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Empty')
    const ws = wb.addWorksheet('Real')
    ws.addRow(['a', 'b'])
    ws.addRow([1, 2])
    const xlsx = new Uint8Array((await wb.xlsx.writeBuffer()) as never)

    const result = await convertXlsxToSheets(xlsx)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0]?.name).toBe('Real')
    expect(result.warnings.some((w) => w.includes('Empty'))).toBe(true)
  })

  // ExcelJS itself rejects path separators on write, so we can't synthesize
  // a malformed xlsx from this test. The filename sanitization is
  // defense-in-depth against externally-crafted files; it's verified by
  // reading the converter source: any "/" / "\" / NUL becomes "_".
})

describe('huozi_upload — office integration', () => {
  it('rejects pptx with a helpful message', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })
    const r = await tool.run(
      {
        file_path: 'deck.pptx',
        content_base64: b64(new Uint8Array([1, 2, 3])),
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message.toLowerCase()).toContain('pdf')
  })

  it('rejects legacy .doc with a save-as hint', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })
    const r = await tool.run(
      { file_path: 'old.doc', content_base64: b64(new Uint8Array([0])) },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message.toLowerCase()).toContain('docx')
  })

  it('writes xlsx as a sheets folder + README, drops original', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })

    const xlsx = await buildXlsx([
      {
        name: 'Sales',
        rows: [['product', 'q1'], ['Alpha', 100]],
      },
    ])

    const r = await tool.run(
      { file_path: 'reports/q1.xlsx', content_base64: b64(xlsx) },
      ctx(),
    )
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.kind).toBe('office')
    expect(r.data.derivatives).toBeDefined()
    const paths = r.data.derivatives!.map((d) => d.path).sort()
    expect(paths).toContain('reports/q1.sheets/README.md')
    expect(paths).toContain('reports/q1.sheets/Sales.csv')

    // Original xlsx must NOT be in storage.
    const orig = await storage.readFile('ws_test', 'reports/q1.xlsx')
    expect(orig).toBeNull()

    const csv = await storage.readFile(
      'ws_test',
      'reports/q1.sheets/Sales.csv',
    )
    expect(csv).not.toBeNull()
    expect(new TextDecoder().decode(csv!.content)).toContain('Alpha,100')
  })

  it('returns an error if xlsx has no usable sheets', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })

    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Empty')
    const xlsx = new Uint8Array((await wb.xlsx.writeBuffer()) as never)

    const r = await tool.run(
      { file_path: 'blank.xlsx', content_base64: b64(xlsx) },
      ctx(),
    )
    expect(r.kind).toBe('error')
  })
})
