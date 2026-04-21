/**
 * Unit tests for cc-compat/diff.ts — structured patch generation.
 */

import { describe, expect, it } from 'vitest'
import {
  adjustHunkLineNumbers,
  countLinesChanged,
  getPatchForDisplay,
  getPatchFromContents,
} from '../diff.js'

describe('getPatchFromContents', () => {
  it('returns empty array for identical content', () => {
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'hello',
      newContent: 'hello',
    })
    expect(patch).toEqual([])
  })

  it('produces hunks for line-level change', () => {
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'a\nb\nc',
      newContent: 'a\nX\nc',
    })
    expect(patch.length).toBeGreaterThan(0)
    const lines = patch.flatMap((h) => h.lines)
    expect(lines.some((l) => l.startsWith('-b'))).toBe(true)
    expect(lines.some((l) => l.startsWith('+X'))).toBe(true)
  })

  it('handles `&` without bug (escape trick)', () => {
    // `&` used to confuse the diff lib. Our escapeForDiff trick should mask.
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'foo & bar',
      newContent: 'foo & BAZ',
    })
    expect(patch.length).toBeGreaterThan(0)
    // Lines should have `&` preserved, not replaced with the token
    const lines = patch.flatMap((h) => h.lines).join('\n')
    expect(lines).toContain('&')
    expect(lines).not.toContain('AMPERSAND_TOKEN')
  })

  it('handles `$` similarly', () => {
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'x = $name',
      newContent: 'x = $other',
    })
    const lines = patch.flatMap((h) => h.lines).join('\n')
    expect(lines).toContain('$')
    expect(lines).not.toContain('DOLLAR_TOKEN')
  })

  it('singleHunk=true squashes into one hunk', () => {
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'a\n'.repeat(50) + 'X\n' + 'b\n'.repeat(50) + 'Y\n',
      newContent: 'a\n'.repeat(50) + 'x\n' + 'b\n'.repeat(50) + 'y\n',
      singleHunk: true,
    })
    expect(patch.length).toBeLessThanOrEqual(1)
  })
})

describe('getPatchForDisplay', () => {
  it('returns hunks when an edit changes content', () => {
    const patch = getPatchForDisplay({
      filePath: 'x.txt',
      fileContents: 'a\nb\nc',
      edits: [{ old_string: 'b', new_string: 'BBB', replace_all: false }],
    })
    expect(patch.length).toBeGreaterThan(0)
  })

  it('converts leading tabs to spaces in display patch', () => {
    // Display patch should normalize tabs for consistent rendering
    const patch = getPatchForDisplay({
      filePath: 'x.ts',
      fileContents: '\tfoo()\n',
      edits: [
        { old_string: '\tfoo()', new_string: '\tbar()', replace_all: false },
      ],
    })
    const lines = patch.flatMap((h) => h.lines)
    // Original tab character should have been rendered as spaces
    const tabLines = lines.filter((l) => l.includes('\t'))
    expect(tabLines.length).toBe(0)
  })
})

describe('countLinesChanged', () => {
  it('returns zeros for empty patch + no new-file content', () => {
    const r = countLinesChanged([])
    expect(r).toEqual({ additions: 0, removals: 0 })
  })

  it('counts all lines as additions for a new file', () => {
    const r = countLinesChanged([], 'line1\nline2\nline3')
    // 3 lines
    expect(r.additions).toBe(3)
    expect(r.removals).toBe(0)
  })

  it('counts +/- lines in a patch', () => {
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'a\nb\nc',
      newContent: 'a\nX\nY\nc',
    })
    const r = countLinesChanged(patch)
    expect(r.additions).toBeGreaterThanOrEqual(1)
    expect(r.removals).toBeGreaterThanOrEqual(1)
  })
})

describe('adjustHunkLineNumbers', () => {
  it('shifts both oldStart and newStart by offset', () => {
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'a\nb',
      newContent: 'a\nB',
    })
    const shifted = adjustHunkLineNumbers(patch, 10)
    expect(shifted[0]!.oldStart).toBe(patch[0]!.oldStart + 10)
    expect(shifted[0]!.newStart).toBe(patch[0]!.newStart + 10)
  })

  it('offset=0 is identity', () => {
    const patch = getPatchFromContents({
      filePath: 'x.txt',
      oldContent: 'a\nb',
      newContent: 'a\nB',
    })
    const shifted = adjustHunkLineNumbers(patch, 0)
    expect(shifted).toBe(patch)
  })
})
