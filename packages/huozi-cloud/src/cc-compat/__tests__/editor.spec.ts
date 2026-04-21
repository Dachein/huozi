/**
 * Unit tests for cc-compat/editor.ts — the edit algorithm port from CC.
 *
 * These tests cover behaviors that the integration smoke doesn't hit:
 *   - Curly quote normalization (findActualString + preserveQuoteStyle)
 *   - Desanitization of Claude-API-mangled XML tokens
 *   - Markdown trailing-whitespace preservation
 *   - Edge cases of applyEditToFile (newline handling, empty new_string)
 *   - getPatchForEdits invariants (no substring re-match, actual-change check)
 */

import { describe, expect, it } from 'vitest'
import {
  applyEditToFile,
  findActualString,
  getPatchForEdits,
  normalizeFileEditInput,
  normalizeQuotes,
  preserveQuoteStyle,
  stripTrailingWhitespace,
} from '../editor.js'

describe('normalizeQuotes', () => {
  it('converts all four curly quote variants to straight', () => {
    expect(normalizeQuotes('\u201Chello\u201D')).toBe('"hello"')
    expect(normalizeQuotes('\u2018world\u2019')).toBe("'world'")
    expect(normalizeQuotes('it\u2019s')).toBe("it's")
  })
  it('leaves straight quotes alone', () => {
    expect(normalizeQuotes('"hello" \'world\'')).toBe('"hello" \'world\'')
  })
  it('handles mixed content', () => {
    expect(normalizeQuotes('\u201CIt\u2019s\u201D working'))
      .toBe('"It\'s" working')
  })
})

describe('findActualString', () => {
  it('returns the exact string when found verbatim', () => {
    expect(findActualString('hello world', 'hello')).toBe('hello')
  })
  it('returns the actual (curly) bytes when model sent straight', () => {
    const file = '\u201Chello\u201D'  // "hello" with curly quotes
    const searched = '"hello"'        // straight quotes
    // Result should be the curly-quoted version pulled from the file
    const res = findActualString(file, searched)
    expect(res).toBe('\u201Chello\u201D')
  })
  it('returns null when nothing matches even after normalization', () => {
    expect(findActualString('hello', 'world')).toBeNull()
  })
  it('handles single curly quotes (apostrophes)', () => {
    const file = "don\u2019t stop"
    expect(findActualString(file, "don't stop")).toBe("don\u2019t stop")
  })
  it('prefers exact match when both exist', () => {
    // If the string is already in the file verbatim, don't go through
    // normalization.
    const file = 'a b "c" d'
    expect(findActualString(file, '"c"')).toBe('"c"')
  })
})

describe('preserveQuoteStyle', () => {
  it('returns new_string unchanged when no normalization happened', () => {
    // oldString and actualOldString match → no curly in the file
    const result = preserveQuoteStyle('hello', 'hello', 'world')
    expect(result).toBe('world')
  })

  it('applies curly double quotes when file had them', () => {
    // File had "x" in curly form
    const oldS = '"x"'
    const actualOld = '\u201Cx\u201D'
    const newS = '"y"'
    const result = preserveQuoteStyle(oldS, actualOld, newS)
    expect(result).toBe('\u201Cy\u201D')
  })

  it('applies curly single quotes, including contraction handling', () => {
    const oldS = "'x'"
    const actualOld = '\u2018x\u2019'
    const newS = "don't 'stop'"
    const result = preserveQuoteStyle(oldS, actualOld, newS)
    // "don't" contraction → right single curly
    expect(result).toContain('don\u2019t')
    // Quote pair around "stop" → left + right curly
    expect(result).toContain('\u2018stop\u2019')
  })

  it('does not touch unrelated quote types', () => {
    // File only had curly double quotes; only double quotes in newString should be converted
    const oldS = '"x"'
    const actualOld = '\u201Cx\u201D'
    const newS = '"y" and \'z\''
    const result = preserveQuoteStyle(oldS, actualOld, newS)
    expect(result).toContain('\u201Cy\u201D')
    // Single straight quotes untouched
    expect(result).toContain("'z'")
  })
})

describe('stripTrailingWhitespace', () => {
  it('strips spaces/tabs at end of each line, preserving line endings', () => {
    expect(stripTrailingWhitespace('foo   \nbar\t\t\nbaz'))
      .toBe('foo\nbar\nbaz')
  })
  it('preserves CRLF line endings', () => {
    expect(stripTrailingWhitespace('foo  \r\nbar\r\n'))
      .toBe('foo\r\nbar\r\n')
  })
  it('does nothing on lines that have no trailing whitespace', () => {
    expect(stripTrailingWhitespace('x\ny\nz')).toBe('x\ny\nz')
  })
})

describe('applyEditToFile', () => {
  it('does a literal single replacement by default', () => {
    expect(applyEditToFile('a b a', 'a', 'X')).toBe('X b a')
  })
  it('replaces all when replaceAll=true', () => {
    expect(applyEditToFile('a b a', 'a', 'X', true)).toBe('X b X')
  })
  it('strips trailing newline when deleting whole line', () => {
    // old_string doesn't end in \n but is followed by one
    const input = 'line1\nline2\nline3\n'
    const result = applyEditToFile(input, 'line2', '')
    // Should delete "line2\n" not just "line2" — otherwise a blank line remains
    expect(result).toBe('line1\nline3\n')
  })
  it('does not strip newline when old_string already ended in \\n', () => {
    const input = 'a\nb\n'
    const result = applyEditToFile(input, 'a\n', '')
    expect(result).toBe('b\n')
  })
  it('handles regex-like metacharacters in strings', () => {
    // $& is the regex backref pattern; our code uses function replacers to
    // avoid that interpretation
    expect(applyEditToFile('foo $&', '$&', 'REPLACED')).toBe('foo REPLACED')
    expect(applyEditToFile('a $1 b', '$1', '#')).toBe('a # b')
  })
})

describe('getPatchForEdits', () => {
  it('throws when old_string not found', () => {
    expect(() =>
      getPatchForEdits({
        filePath: 'f.txt',
        fileContents: 'hello',
        edits: [
          { old_string: 'nope', new_string: 'x', replace_all: false },
        ],
      }),
    ).toThrow(/not found/i)
  })

  it('throws when edit N+1 old_string is substring of earlier new_string', () => {
    expect(() =>
      getPatchForEdits({
        filePath: 'f.txt',
        fileContents: 'aaa bbb',
        edits: [
          { old_string: 'aaa', new_string: 'foo bar', replace_all: false },
          { old_string: 'bar', new_string: 'x', replace_all: false },
        ],
      }),
    ).toThrow(/substring/i)
  })

  it('applies sequential edits in order', () => {
    const { updatedFile } = getPatchForEdits({
      filePath: 'f.txt',
      fileContents: 'aaa bbb',
      edits: [
        { old_string: 'aaa', new_string: 'AAA', replace_all: false },
        { old_string: 'bbb', new_string: 'BBB', replace_all: false },
      ],
    })
    expect(updatedFile).toBe('AAA BBB')
  })

  it('empty edit on empty file is a valid no-op', () => {
    const { updatedFile } = getPatchForEdits({
      filePath: 'f.txt',
      fileContents: '',
      edits: [{ old_string: '', new_string: '', replace_all: false }],
    })
    expect(updatedFile).toBe('')
  })

  it('generates non-empty structuredPatch on meaningful change', () => {
    const { patch } = getPatchForEdits({
      filePath: 'f.txt',
      fileContents: 'line1\nline2\nline3',
      edits: [
        { old_string: 'line2', new_string: 'LINE2', replace_all: false },
      ],
    })
    expect(patch.length).toBeGreaterThan(0)
    const hunk = patch[0]!
    expect(hunk.oldStart).toBeGreaterThan(0)
    expect(hunk.lines.some((l) => l.startsWith('-'))).toBe(true)
    expect(hunk.lines.some((l) => l.startsWith('+'))).toBe(true)
  })
})

describe('normalizeFileEditInput', () => {
  it('strips trailing whitespace from new_string for non-markdown files', () => {
    const r = normalizeFileEditInput({
      file_path: 'foo.ts',
      fileContent: 'hello',
      edits: [
        { old_string: 'hello', new_string: 'world   ', replace_all: false },
      ],
    })
    expect(r.edits[0]!.new_string).toBe('world')
  })

  it('preserves trailing spaces in .md files (Markdown hard line break)', () => {
    const r = normalizeFileEditInput({
      file_path: 'README.md',
      fileContent: 'line',
      edits: [
        { old_string: 'line', new_string: 'hard break  \nnext', replace_all: false },
      ],
    })
    // Two trailing spaces before \n → preserved
    expect(r.edits[0]!.new_string).toBe('hard break  \nnext')
  })

  it('preserves trailing spaces in .mdx', () => {
    const r = normalizeFileEditInput({
      file_path: 'doc.mdx',
      fileContent: 'x',
      edits: [{ old_string: 'x', new_string: 'x  ', replace_all: false }],
    })
    expect(r.edits[0]!.new_string).toBe('x  ')
  })

  it('desanitizes <fnr> to <function_results> when file contains real tag', () => {
    const fileContent = 'before <function_results>data</function_results> after'
    const r = normalizeFileEditInput({
      file_path: 'f.txt',
      fileContent,
      edits: [
        {
          old_string: '<fnr>data</function_results>',
          new_string: '<fnr>REPLACED</function_results>',
          replace_all: false,
        },
      ],
    })
    // old_string was desanitized to match file content; new_string got the
    // same substitutions applied.
    expect(r.edits[0]!.old_string).toBe(
      '<function_results>data</function_results>',
    )
    expect(r.edits[0]!.new_string).toBe(
      '<function_results>REPLACED</function_results>',
    )
  })

  it('desanitizes \\n\\nH: to \\n\\nHuman: when file uses the long form', () => {
    const fileContent = 'log\n\nHuman: hello'
    const r = normalizeFileEditInput({
      file_path: 'log.txt',
      fileContent,
      edits: [
        {
          old_string: '\n\nH: hello',
          new_string: '\n\nH: goodbye',
          replace_all: false,
        },
      ],
    })
    expect(r.edits[0]!.old_string).toBe('\n\nHuman: hello')
    expect(r.edits[0]!.new_string).toBe('\n\nHuman: goodbye')
  })

  it('leaves input unchanged when exact match already works', () => {
    const r = normalizeFileEditInput({
      file_path: 'f.txt',
      fileContent: 'hello world',
      edits: [{ old_string: 'hello', new_string: 'hi', replace_all: false }],
    })
    expect(r.edits[0]!.old_string).toBe('hello')
    expect(r.edits[0]!.new_string).toBe('hi')
  })
})
