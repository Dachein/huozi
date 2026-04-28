/**
 * Extension → MIME map shared by ReadTool's binary_ref branch and the
 * worker's blob-download endpoint.
 *
 * Detection is by extension, mirroring Claude Code's FileReadTool behavior
 * (cc:FileReadTool.ts:472-481). We intentionally do not sniff bytes — the
 * cost (an extra R2 read on every download) outweighs the marginal accuracy
 * gain.
 */

export const MIME_BY_EXT: Record<string, string> = {
  // images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  // documents
  '.pdf': 'application/pdf',
  '.ipynb': 'application/x-ipynb+json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  // archives
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  // audio / video
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  // office (until Phase 3 conversion lands, these download as-is)
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export function guessMime(path: string): string {
  const i = path.lastIndexOf('.')
  if (i < 0) return 'application/octet-stream'
  return MIME_BY_EXT[path.slice(i).toLowerCase()] ?? 'application/octet-stream'
}
