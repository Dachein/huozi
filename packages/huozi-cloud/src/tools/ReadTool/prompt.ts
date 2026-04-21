/**
 * Read tool name + user-facing description.
 *
 * Text is ported as-close-as-possible from cc:FileReadTool/prompt.ts so
 * Agents familiar with CC see the same instructions.
 *
 * The one deliberate change: paths in huozi-cloud are workspace-relative
 * (under an Scope or workspace root), not absolute. The prompt acknowledges
 * this.
 */

export const READ_TOOL_NAME = 'huozi_read'
export const READ_TOOL_USER_FACING_NAME = 'Read'

/** Cap on default `limit` when caller doesn't supply one. Matches CC. */
export const MAX_LINES_TO_READ = 2000

/** Cap on full-file size we'll decode at once. Matches CC (256 KB). */
export const MAX_OUTPUT_SIZE_BYTES = 256 * 1024

/** Cap on binary base64 inline. Over this → binary_ref. See SPEC §4.1. */
export const MAX_INLINE_BINARY_BYTES = 4 * 1024 * 1024

export function description(): string {
  return 'Read a file from the cloud workspace.'
}

export function prompt(): string {
  return `Reads a file from the cloud workspace. Paths are relative to your scope root; treat the workspace as your current working directory.

Usage:
- The file_path parameter is a path relative to your workspace (or scope) root. Leading slashes are treated as workspace-relative.
- By default, it reads up to ${MAX_LINES_TO_READ} lines starting from the beginning of the file
- When you already know which part of the file you need, only read that part. This can be important for larger files.
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows reading images (PNG, JPG, etc.) as base64 when they fit within the response budget.
- This tool can read PDF files (.pdf). For large PDFs (more than 10 pages), you MUST provide the pages parameter to read specific page ranges (e.g., pages: "1-5"). Maximum 20 pages per request.
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs. Editing notebooks is not supported in v1.
- This tool can only read files, not directories.
- If you read a file that exists but has empty contents you will receive a warning in place of file contents.
- Binary files larger than ${Math.floor(MAX_INLINE_BINARY_BYTES / 1024 / 1024)} MB are returned as a signed URL (type: "binary_ref") instead of inline base64. Fetch the URL yourself if you need the bytes.
- Each response includes a blob_sha field. This is the content identity; keep it if you plan to edit the file afterwards — the Edit tool will reject your edit if the blob_sha changed since your Read.`
}
