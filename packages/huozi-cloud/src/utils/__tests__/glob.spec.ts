/**
 * Unit tests for utils/glob.ts — glob-to-regex + GREP_TYPE_GLOBS table.
 */

import { describe, expect, it } from 'vitest'
import { globToRegex, GREP_TYPE_GLOBS, matchGlob } from '../glob.js'

describe('globToRegex', () => {
  it('anchors the pattern (^...$)', () => {
    const re = globToRegex('foo.ts')
    expect(re.test('foo.ts')).toBe(true)
    expect(re.test('afoo.ts')).toBe(false)
    expect(re.test('foo.tsX')).toBe(false)
  })

  it('* does NOT cross /', () => {
    const re = globToRegex('*.ts')
    expect(re.test('foo.ts')).toBe(true)
    expect(re.test('sub/foo.ts')).toBe(false)
  })

  it('** crosses /', () => {
    const re = globToRegex('**/foo.ts')
    expect(re.test('foo.ts')).toBe(true)
    expect(re.test('src/foo.ts')).toBe(true)
    expect(re.test('a/b/c/foo.ts')).toBe(true)
  })

  it('** as standalone pattern matches anything', () => {
    const re = globToRegex('**')
    expect(re.test('foo')).toBe(true)
    expect(re.test('a/b/c/d')).toBe(true)
  })

  it('? matches exactly one char (not /)', () => {
    const re = globToRegex('?.ts')
    expect(re.test('a.ts')).toBe(true)
    expect(re.test('ab.ts')).toBe(false)
    expect(re.test('/.ts')).toBe(false)
  })

  it('{a,b} alternation', () => {
    const re = globToRegex('file.{ts,tsx}')
    expect(re.test('file.ts')).toBe(true)
    expect(re.test('file.tsx')).toBe(true)
    expect(re.test('file.js')).toBe(false)
  })

  it('{a,b,c} multi-alternation', () => {
    const re = globToRegex('{a,b,c}.md')
    expect(re.test('a.md')).toBe(true)
    expect(re.test('b.md')).toBe(true)
    expect(re.test('c.md')).toBe(true)
    expect(re.test('d.md')).toBe(false)
  })

  it('[abc] char class', () => {
    const re = globToRegex('[abc].ts')
    expect(re.test('a.ts')).toBe(true)
    expect(re.test('b.ts')).toBe(true)
    expect(re.test('d.ts')).toBe(false)
  })

  it('regex metacharacters are literal', () => {
    const re = globToRegex('foo(bar).ts')
    expect(re.test('foo(bar).ts')).toBe(true)
    expect(re.test('foobar.ts')).toBe(false)
  })

  it('caseInsensitive flag works', () => {
    const re = globToRegex('FOO.ts', { caseInsensitive: true })
    expect(re.test('foo.ts')).toBe(true)
    expect(re.test('FoO.ts')).toBe(true)
  })

  it('default is case-sensitive', () => {
    const re = globToRegex('FOO.ts')
    expect(re.test('foo.ts')).toBe(false)
  })

  it('src/**/*.ts deep-matches', () => {
    const re = globToRegex('src/**/*.ts')
    expect(re.test('src/foo.ts')).toBe(true)
    expect(re.test('src/a/b.ts')).toBe(true)
    expect(re.test('src/a/b/c.ts')).toBe(true)
    expect(re.test('docs/foo.ts')).toBe(false)
  })
})

describe('matchGlob (convenience)', () => {
  it('wraps globToRegex correctly', () => {
    expect(matchGlob('*.md', 'README.md')).toBe(true)
    expect(matchGlob('*.md', 'code.ts')).toBe(false)
  })
})

describe('GREP_TYPE_GLOBS table', () => {
  it('js includes .js .mjs .cjs .jsx', () => {
    const patterns = GREP_TYPE_GLOBS['js']!
    expect(patterns).toContain('**/*.js')
    expect(patterns).toContain('**/*.mjs')
    expect(patterns).toContain('**/*.cjs')
    expect(patterns).toContain('**/*.jsx')
  })
  it('ts includes .ts and .tsx', () => {
    const patterns = GREP_TYPE_GLOBS['ts']!
    expect(patterns).toContain('**/*.ts')
    expect(patterns).toContain('**/*.tsx')
  })
  it('md includes .md and .mdx', () => {
    const patterns = GREP_TYPE_GLOBS['md']!
    expect(patterns).toContain('**/*.md')
    expect(patterns).toContain('**/*.mdx')
  })
  it('every type value is an array of strings', () => {
    for (const [typeName, patterns] of Object.entries(GREP_TYPE_GLOBS)) {
      expect(Array.isArray(patterns)).toBe(true)
      for (const p of patterns) {
        expect(typeof p).toBe('string')
        expect(p.length).toBeGreaterThan(0)
      }
      expect(typeName.length).toBeGreaterThan(0)
    }
  })
})
