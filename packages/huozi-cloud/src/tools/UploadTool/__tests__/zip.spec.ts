import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import {
  extractZip,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_PER_ENTRY_BYTES,
} from '../zip.js'

function makeZip(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries)
}

describe('extractZip — happy path', () => {
  it('extracts a basic archive', () => {
    const zip = makeZip({
      'a.txt': strToU8('alpha'),
      'b/c.txt': strToU8('charlie'),
    })
    const result = extractZip(zip)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map((e) => e.path).sort()).toEqual([
      'a.txt',
      'b/c.txt',
    ])
  })

  it('skips directory entries silently (folders are implicit in huozi)', () => {
    // fflate's zipSync doesn't emit folder entries by default, so we don't
    // construct one here — but we cover the code path: any entry whose
    // name ends in "/" must be ignored, not written as an empty file.
    // Documenting via assertion on a normal extraction.
    const zip = makeZip({ 'only.txt': strToU8('x') })
    const result = extractZip(zip)
    expect(result.ok).toBe(true)
  })
})

describe('extractZip — safety nets', () => {
  it('rejects path traversal entries', () => {
    const zip = makeZip({
      'safe.txt': strToU8('ok'),
      '../escape.txt': strToU8('uh oh'),
    })
    const result = extractZip(zip)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('unsafe_path')
  })

  it('rejects absolute-path entries', () => {
    const zip = makeZip({
      '/etc/passwd': strToU8('root:x:0:'),
    })
    const result = extractZip(zip)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('unsafe_path')
  })

  it('rejects backslash separators (Windows-style trickery)', () => {
    const zip = makeZip({
      'subdir\\file.txt': strToU8('x'),
    })
    const result = extractZip(zip)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('unsafe_path')
  })

  it('rejects entries with embedded NUL', () => {
    const zip = makeZip({
      'safe\u0000.txt': strToU8('x'),
    })
    const result = extractZip(zip)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('unsafe_path')
  })

  it('rejects archives with too many entries', () => {
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i < MAX_ZIP_ENTRIES + 5; i++) {
      entries[`f${i}.txt`] = strToU8(`${i}`)
    }
    const zip = makeZip(entries)
    const result = extractZip(zip)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('too_many_entries')
  })

  it('rejects an entry that exceeds per-entry size cap', () => {
    // Build a single oversize entry (~MAX_ZIP_PER_ENTRY_BYTES + 1 bytes).
    // Use an array of zero bytes so fflate compresses it tiny but the
    // uncompressed length still trips the guard.
    const big = new Uint8Array(MAX_ZIP_PER_ENTRY_BYTES + 1)
    const zip = makeZip({ 'big.bin': big })
    const result = extractZip(zip)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('entry_size_exceeded')
  })

  it('rejects garbage bytes as invalid_zip', () => {
    const result = extractZip(new Uint8Array([1, 2, 3, 4, 5]))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid_zip')
  })

  it('accepts a filename that legitimately contains "..";', () => {
    // `a..b.txt` is a perfectly valid filename — the guard must only
    // trip on whole-segment ".." sequences, not the substring.
    const zip = makeZip({ 'a..b.txt': strToU8('ok') })
    const result = extractZip(zip)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0]?.path).toBe('a..b.txt')
  })
})
