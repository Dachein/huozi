/**
 * Encoding + line-ending detection.
 *
 * Based on: cc:utils/fileRead.ts
 *
 * ⚠️  Divergence from CC: CC reads from `fs.readSync(path, ...)` because it's
 * a local tool. In Worker we don't have Node fs — so the public API takes raw
 * bytes (Uint8Array) instead of a path. The detection algorithms are
 * byte-identical.
 *
 * Callers typically:
 *   1. Fetch blob from R2 → Uint8Array
 *   2. Call `readBytesWithMetadata(bytes)` → { content, encoding, lineEndings }
 *   3. Pass result to Edit/Write logic
 */

export type LineEndingType = 'CRLF' | 'LF'
export type DetectedEncoding = 'utf8' | 'utf16le'

/**
 * Detect encoding from the first N bytes (BOM sniff).
 *   FF FE     → UTF-16 LE
 *   EF BB BF  → UTF-8 with BOM
 *   (else)    → UTF-8 (superset of ASCII; safe default)
 *
 * Empty buffer → 'utf8' (fixes CC bug where empty files caused emoji corruption).
 */
export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  if (bytes.length === 0) return 'utf8'

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf16le'
  }
  // UTF-8 BOM: 0xEF 0xBB 0xBF — we still treat the file as utf8, just
  // acknowledging the BOM is present. (TextDecoder will strip it.)
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return 'utf8'
  }
  return 'utf8'
}

/**
 * Count CRLF vs LF in a string; return whichever is majority.
 * Mixed-endings files default to LF.
 */
export function detectLineEndings(content: string): LineEndingType {
  let crlfCount = 0
  let lfCount = 0

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      if (i > 0 && content[i - 1] === '\r') crlfCount++
      else lfCount++
    }
  }
  return crlfCount > lfCount ? 'CRLF' : 'LF'
}

/**
 * One-shot decode + metadata extraction. After calling this, `content` is
 * always LF-normalized (CRLF has been stripped); use `lineEndings` to
 * reconstruct the original on write-back.
 *
 * CC's equivalent is `readFileSyncWithMetadata`. We take bytes instead of a
 * path. The line-ending detection uses the first 4096 chars of the raw
 * (pre-normalization) string — same as CC.
 */
export function readBytesWithMetadata(bytes: Uint8Array): {
  content: string
  encoding: DetectedEncoding
  lineEndings: LineEndingType
} {
  const encoding = detectEncoding(bytes)
  const decoder = new TextDecoder(encoding, { ignoreBOM: false })
  const raw = decoder.decode(bytes)

  // Detect line endings from the raw head BEFORE CRLF normalization erases
  // the distinction.
  const lineEndings = detectLineEndings(raw.slice(0, 4096))

  // Normalize to LF for all in-memory content. The write-back path uses
  // `lineEndings` to restore CRLF if that was the original format.
  const content = raw.replaceAll('\r\n', '\n')
  return { content, encoding, lineEndings }
}

/**
 * Re-encode a string for write-back, honoring original line endings + encoding.
 * The inverse of `readBytesWithMetadata`.
 */
export function encodeContentForWrite(
  content: string,
  encoding: DetectedEncoding,
  lineEndings: LineEndingType,
): Uint8Array {
  const withEndings =
    lineEndings === 'CRLF' ? content.replaceAll('\n', '\r\n') : content

  if (encoding === 'utf16le') {
    // Manual UTF-16 LE encoding (TextEncoder only supports UTF-8)
    const buf = new Uint8Array(withEndings.length * 2 + 2)
    // BOM
    buf[0] = 0xff
    buf[1] = 0xfe
    for (let i = 0; i < withEndings.length; i++) {
      const code = withEndings.charCodeAt(i)
      buf[2 + i * 2] = code & 0xff
      buf[2 + i * 2 + 1] = (code >> 8) & 0xff
    }
    return buf
  }

  return new TextEncoder().encode(withEndings)
}
