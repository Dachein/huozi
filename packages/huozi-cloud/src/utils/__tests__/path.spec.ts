/**
 * Unit tests for utils/path.ts — the canonicalizePath helper every tool runs.
 */

import { describe, expect, it } from 'vitest'
import { canonicalizePath } from '../path.js'

describe('canonicalizePath', () => {
  it('accepts a simple relative path', () => {
    const r = canonicalizePath('foo/bar.md')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('foo/bar.md')
  })

  it('strips leading slash (workspace-relative)', () => {
    const r = canonicalizePath('/foo/bar.md')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('foo/bar.md')
  })

  it('strips multiple leading slashes', () => {
    const r = canonicalizePath('///foo')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('foo')
  })

  it('collapses //', () => {
    const r = canonicalizePath('foo//bar///baz')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('foo/bar/baz')
  })

  it('normalizes ./ away', () => {
    const r = canonicalizePath('foo/./bar')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('foo/bar')
  })

  it('converts backslashes to forward slashes', () => {
    const r = canonicalizePath('foo\\bar')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('foo/bar')
  })

  it('rejects ".." segments', () => {
    const r = canonicalizePath('foo/../bar')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/\.\./)
  })

  it('rejects ".." even when normalization would let it resolve', () => {
    // Some attackers send "foo/../foo/bar" expecting us to normalize to
    // "foo/bar". Our stricter check rejects ANY `..`, which is safer.
    const r = canonicalizePath('foo/../foo/bar')
    expect(r.ok).toBe(false)
  })

  it('rejects leading-slash path that becomes empty after stripping', () => {
    const r = canonicalizePath('/')
    expect(r.ok).toBe(false)
  })

  it('rejects empty string', () => {
    const r = canonicalizePath('')
    expect(r.ok).toBe(false)
  })

  it('accepts single-segment path', () => {
    const r = canonicalizePath('README.md')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('README.md')
  })

  it('accepts deep nesting', () => {
    const r = canonicalizePath('a/b/c/d/e.ts')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('a/b/c/d/e.ts')
  })

  it('accepts paths with dots in filenames', () => {
    const r = canonicalizePath('foo.test.ts')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.path).toBe('foo.test.ts')
  })

  it('accepts hidden files (leading dot)', () => {
    const r = canonicalizePath('.env')
    expect(r.ok).toBe(true)
  })

  it('rejects an exact ".." path', () => {
    const r = canonicalizePath('..')
    expect(r.ok).toBe(false)
  })
})
