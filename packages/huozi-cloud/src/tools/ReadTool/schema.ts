/**
 * Input/output zod schemas for huozi_read.
 *
 * Input: mirrors cc:sdk-tools.d.ts FileReadInput.
 * Output: discriminated union (SPEC §4.1). v1 emits `text` / `file_unchanged`
 *         / `binary_ref` / placeholder-for-empty. image/pdf/parts/notebook
 *         variants are declared but emitted by later iterations.
 */

import { z } from 'zod'

export const readInputSchema = z.object({
  file_path: z.string().describe('Path relative to workspace / scope root.'),
  offset: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'The line number to start reading from (1-indexed). Provide only for large files.',
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'The number of lines to read. Provide only if the file is too large to read at once.',
    ),
  pages: z
    .string()
    .optional()
    .describe('Page range for PDF files (e.g., "1-5"). Max 20 pages per request.'),
})

export type ReadInput = z.infer<typeof readInputSchema>

// ── Output variants ─────────────────────────────────────────────────────

const textFile = z.object({
  type: z.literal('text'),
  file: z.object({
    filePath: z.string(),
    content: z.string(),
    numLines: z.number().int().nonnegative(),
    startLine: z.number().int().positive(),
    totalLines: z.number().int().nonnegative(),
    blob_sha: z.string(),
  }),
})

const fileUnchanged = z.object({
  type: z.literal('file_unchanged'),
  file: z.object({
    filePath: z.string(),
    blob_sha: z.string(),
  }),
})

const binaryRef = z.object({
  type: z.literal('binary_ref'),
  file: z.object({
    filePath: z.string(),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
    sha: z.string(),
    url: z.string().url(),
    expiresAt: z.number().int().positive(),
  }),
})

// v1 only emits these three. Others from SPEC §4.1 will be added later.
export const readOutputSchema = z.discriminatedUnion('type', [
  textFile,
  fileUnchanged,
  binaryRef,
])

export type ReadOutput = z.infer<typeof readOutputSchema>
export type ReadOutputText = z.infer<typeof textFile>
export type ReadOutputUnchanged = z.infer<typeof fileUnchanged>
export type ReadOutputBinaryRef = z.infer<typeof binaryRef>
