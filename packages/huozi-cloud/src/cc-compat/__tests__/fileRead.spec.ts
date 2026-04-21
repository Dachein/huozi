/**
 * Unit tests for cc-compat/fileRead.ts — encoding + line-ending detection.
 *
 * These guard the Windows / utf-16 / BOM edge cases our smokes don't exercise.
 */

import { describe, expect, it } from 'vitest'
import {
  detectEncoding,
  detectLineEndings,
  encodeContentForWrite,
  readBytesWithMetadata,
} from '../fileRead.js'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('detectEncoding', () => {
  it('returns utf8 on empty buffer (avoids the "empty file corrupts emojis" bug)', () => {
    expect(detectEncoding(new Uint8Array(0))).toBe('utf8')
  })

  it('detects UTF-16 LE via 0xFF 0xFE BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x68, 0x00]) // "h" in utf16le
    expect(detectEncoding(bytes)).toBe('utf16le')
  })

  it('returns utf8 on UTF-8 BOM (0xEF 0xBB 0xBF)', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69])
    expect(detectEncoding(bytes)).toBe('utf8')
  })

  it('returns utf8 for plain ASCII', () => {
    expect(detectEncoding(enc('hello'))).toBe('utf8')
  })

  it('returns utf8 for CJK / emoji content (it IS valid utf-8)', () => {
    expect(detectEncoding(enc('你好世界'))).toBe('utf8')
    expect(detectEncoding(enc('hi 👋'))).toBe('utf8')
  })
})

describe('detectLineEndings', () => {
  it('detects LF-only', () => {
    expect(detectLineEndings('a\nb\nc')).toBe('LF')
  })

  it('detects CRLF-dominant', () => {
    expect(detectLineEndings('a\r\nb\r\nc')).toBe('CRLF')
  })

  it('LF wins a tie (historical default, matches CC)', () => {
    // Equal counts → LF
    expect(detectLineEndings('a\nb\r\nc')).toBe('LF')
  })

  it('returns LF for empty string', () => {
    expect(detectLineEndings('')).toBe('LF')
  })

  it('returns LF for content with no line endings', () => {
    expect(detectLineEndings('singleline')).toBe('LF')
  })

  it('CRLF with more CR+LF than LF', () => {
    expect(detectLineEndings('a\r\nb\r\nc\r\nd\ne')).toBe('CRLF')
  })
})

describe('readBytesWithMetadata', () => {
  it('normalizes CRLF to LF in content, preserves lineEndings="CRLF"', () => {
    const r = readBytesWithMetadata(enc('a\r\nb\r\nc'))
    expect(r.content).toBe('a\nb\nc')
    expect(r.lineEndings).toBe('CRLF')
    expect(r.encoding).toBe('utf8')
  })

  it('leaves LF content untouched', () => {
    const r = readBytesWithMetadata(enc('a\nb\nc'))
    expect(r.content).toBe('a\nb\nc')
    expect(r.lineEndings).toBe('LF')
  })

  it('roundtrips an empty file', () => {
    const r = readBytesWithMetadata(new Uint8Array(0))
    expect(r.content).toBe('')
    expect(r.encoding).toBe('utf8')
    expect(r.lineEndings).toBe('LF')
  })

  it('handles UTF-8 BOM — content decoded without the BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('hello')])
    const r = readBytesWithMetadata(bytes)
    // TextDecoder with ignoreBOM: false strips the BOM
    expect(r.content).toBe('hello')
    expect(r.encoding).toBe('utf8')
  })
})

describe('encodeContentForWrite', () => {
  it('roundtrips utf8 + LF', () => {
    const bytes = encodeContentForWrite('hello', 'utf8', 'LF')
    expect(new TextDecoder().decode(bytes)).toBe('hello')
  })

  it('restores CRLF for utf8 files that had CRLF', () => {
    const bytes = encodeContentForWrite('a\nb\nc', 'utf8', 'CRLF')
    expect(new TextDecoder().decode(bytes)).toBe('a\r\nb\r\nc')
  })

  it('emits UTF-16 LE + BOM for utf16le encoding', () => {
    const bytes = encodeContentForWrite('hi', 'utf16le', 'LF')
    expect(bytes[0]).toBe(0xff)
    expect(bytes[1]).toBe(0xfe)
    // h = 0x68, 0x00 in LE
    expect(bytes[2]).toBe(0x68)
    expect(bytes[3]).toBe(0x00)
    expect(bytes[4]).toBe(0x69) // 'i'
    expect(bytes[5]).toBe(0x00)
  })

  it('preserves CRLF when lineEndings=CRLF even with utf16le', () => {
    const bytes = encodeContentForWrite('a\nb', 'utf16le', 'CRLF')
    // Skip BOM (2 bytes): "a" "\r" "\n" "b"
    // a=0x61, \r=0x0D, \n=0x0A, b=0x62
    expect(bytes[2]).toBe(0x61) // 'a'
    expect(bytes[4]).toBe(0x0d) // '\r'
    expect(bytes[6]).toBe(0x0a) // '\n'
    expect(bytes[8]).toBe(0x62) // 'b'
  })
})

describe('readBytesWithMetadata + encodeContentForWrite roundtrip', () => {
  it('CRLF utf8 → edit-in-memory → write-back preserves CRLF', () => {
    const original = enc('hello\r\nworld\r\n')
    const meta = readBytesWithMetadata(original)
    const edited = meta.content.replace('world', 'WORLD')
    const written = encodeContentForWrite(edited, meta.encoding, meta.lineEndings)
    expect(new TextDecoder().decode(written)).toBe('hello\r\nWORLD\r\n')
  })
})
