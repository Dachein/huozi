/**
 * Classify uploaded paths into the conversion lanes huozi_upload supports.
 *
 * Detection is by extension only — same policy as the rest of the worker.
 * Magic-byte sniffing would be marginally more accurate but costs an
 * additional Uint8Array scan for every upload, and a determined attacker
 * could craft a polyglot anyway. The defense in depth lives in the
 * converters themselves: mammoth / SheetJS validate format on parse.
 */

export type OfficeKind =
  /** docx — convert to markdown via mammoth, no original retained. */
  | 'docx'
  /** xlsx — convert each sheet to a CSV under a `<name>.sheets/` folder. */
  | 'xlsx'
  /** Legacy / unsupported Office formats. Upload is rejected with a hint. */
  | 'rejected'
  /** Any other extension — handled by the regular binary upload path. */
  | 'passthrough'

export interface OfficeClassification {
  kind: OfficeKind
  /** When kind === 'rejected', the user-facing reason; else undefined. */
  rejectReason?: string
  /** Suggested lowercase extension if the agent gave us mixed-case. */
  ext: string
}

const REJECTED: Record<string, string> = {
  '.pptx': 'PPTX is not accepted. Export your slides to PDF (File → Export → PDF) and upload the PDF instead.',
  '.ppt':
    'Legacy .ppt is not accepted. Export to PDF or save-as .pptx, then export to PDF.',
  '.doc':
    'Legacy .doc is not accepted. Save-as .docx in Word/LibreOffice and re-upload.',
  '.xls':
    'Legacy .xls is not accepted. Save-as .xlsx in Excel/LibreOffice and re-upload.',
  '.odt':
    'OpenDocument Text is not accepted. Export as .docx or PDF and re-upload.',
  '.ods':
    'OpenDocument Spreadsheet is not accepted. Export as .xlsx and re-upload.',
  '.odp':
    'OpenDocument Presentation is not accepted. Export as PDF and re-upload.',
  '.pages': 'Apple Pages is not accepted. Export as PDF or .docx and re-upload.',
  '.numbers':
    'Apple Numbers is not accepted. Export as .xlsx and re-upload.',
  '.key': 'Apple Keynote is not accepted. Export as PDF and re-upload.',
}

export function classifyOfficeUpload(filePath: string): OfficeClassification {
  const i = filePath.lastIndexOf('.')
  const ext = i >= 0 ? filePath.slice(i).toLowerCase() : ''

  if (ext === '.docx') return { kind: 'docx', ext }
  if (ext === '.xlsx') return { kind: 'xlsx', ext }
  if (ext in REJECTED) {
    return { kind: 'rejected', ext, rejectReason: REJECTED[ext]! }
  }
  return { kind: 'passthrough', ext }
}
