/**
 * Unit tests for scope.ts — the core of §7.4.
 */

import { describe, expect, it } from 'vitest'
import {
  applyScopeToArgs,
  applyScopeToPath,
  unscopeGrepContent,
  unscopePath,
  unscopeResult,
} from '../scope.js'

describe('applyScopeToPath', () => {
  it('passes through when scope is null', () => {
    const r = applyScopeToPath(null, 'report.md')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.absolutePath).toBe('report.md')
  })

  it('prepends scope and strips user leading slash', () => {
    const r = applyScopeToPath('funds/fund-A/', '/report.md')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.absolutePath).toBe('funds/fund-A/report.md')
  })

  it('adds trailing slash to scope if missing', () => {
    const r = applyScopeToPath('funds/fund-A', 'report.md')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.absolutePath).toBe('funds/fund-A/report.md')
  })

  it('rejects `..` segments even when they mathematically cancel', () => {
    const r = applyScopeToPath(
      'funds/fund-A/',
      'sub/../other/file.md',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/escape attempt/)
  })

  it('rejects bare `..`', () => {
    const r = applyScopeToPath('funds/fund-A/', '..')
    expect(r.ok).toBe(false)
  })

  it('rejects absolute escape via `/..`', () => {
    const r = applyScopeToPath('funds/fund-A/', '/../fund-B/x.md')
    expect(r.ok).toBe(false)
  })

  it('rejects empty and root paths', () => {
    expect(applyScopeToPath('funds/fund-A/', '').ok).toBe(false)
    expect(applyScopeToPath('funds/fund-A/', '/').ok).toBe(false)
  })

  it('`..` inside a filename is OK (e.g. `foo..txt`)', () => {
    const r = applyScopeToPath('s/', 'foo..txt')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.absolutePath).toBe('s/foo..txt')
  })
})

describe('unscopePath', () => {
  it('passes through when scope is null', () => {
    expect(unscopePath(null, 'a/b.md')).toBe('a/b.md')
  })
  it('strips scope prefix', () => {
    expect(unscopePath('funds/fund-A/', 'funds/fund-A/report.md')).toBe(
      'report.md',
    )
  })
  it('leaves paths outside scope as-is (defensive)', () => {
    expect(unscopePath('funds/fund-A/', 'other/path.md')).toBe(
      'other/path.md',
    )
  })
  it('handles scope without trailing slash', () => {
    expect(unscopePath('funds/fund-A', 'funds/fund-A/report.md')).toBe(
      'report.md',
    )
  })
})

describe('applyScopeToArgs — per-tool', () => {
  const SCOPE = 'funds/fund-A/'

  it('huozi_read: file_path scoped', () => {
    const r = applyScopeToArgs('huozi_read', { file_path: 'r.md' }, SCOPE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.args['file_path']).toBe('funds/fund-A/r.md')
  })

  it('huozi_glob with no path → injects scope root', () => {
    const r = applyScopeToArgs('huozi_glob', { pattern: '**/*.md' }, SCOPE)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.args['pattern']).toBe('**/*.md')
      expect(r.args['path']).toBe('funds/fund-A')
    }
  })

  it('huozi_grep with user-provided path → scopes that path', () => {
    const r = applyScopeToArgs(
      'huozi_grep',
      { pattern: 'foo', path: 'subdir' },
      SCOPE,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.args['path']).toBe('funds/fund-A/subdir')
  })

  it('huozi_batch_edit: scopes edits[].file_path', () => {
    const r = applyScopeToArgs(
      'huozi_batch_edit',
      {
        edits: [
          { file_path: 'a.md', old_string: 'x', new_string: 'y' },
          { file_path: '/b.md', old_string: 'x', new_string: 'y' },
        ],
      },
      SCOPE,
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      const edits = r.args['edits'] as Array<{ file_path: string }>
      expect(edits[0]!.file_path).toBe('funds/fund-A/a.md')
      expect(edits[1]!.file_path).toBe('funds/fund-A/b.md')
    }
  })

  it('any batch_edit entry with `..` aborts the whole transform', () => {
    const r = applyScopeToArgs(
      'huozi_batch_edit',
      {
        edits: [
          { file_path: 'good.md', old_string: 'x', new_string: 'y' },
          { file_path: '../leak.md', old_string: 'x', new_string: 'y' },
        ],
      },
      SCOPE,
    )
    expect(r.ok).toBe(false)
  })

  it('scope=null is identity', () => {
    const input = { file_path: '/abs/path.md' }
    const r = applyScopeToArgs('huozi_read', input, null)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.args).toEqual(input)
  })
})

describe('unscopeResult — per-tool shape', () => {
  const SCOPE = 'funds/fund-A/'

  it('Read output: strips file.filePath', () => {
    const out = unscopeResult(
      'huozi_read',
      {
        type: 'text',
        file: {
          filePath: 'funds/fund-A/r.md',
          content: 'hi',
          numLines: 1,
          startLine: 1,
          totalLines: 1,
          blob_sha: 'abc',
        },
      },
      SCOPE,
    )
    expect(
      (out as { file: { filePath: string } }).file.filePath,
    ).toBe('r.md')
  })

  it('Edit/Write output: strips top-level filePath', () => {
    const out = unscopeResult(
      'huozi_edit',
      {
        filePath: 'funds/fund-A/r.md',
        commit_sha: 'x',
      },
      SCOPE,
    )
    expect((out as { filePath: string }).filePath).toBe('r.md')
  })

  it('Glob output: strips each filename', () => {
    const out = unscopeResult(
      'huozi_glob',
      {
        filenames: [
          'funds/fund-A/a.md',
          'funds/fund-A/sub/b.md',
          'funds/fund-B/leak.md', // stays as-is (defensive; shouldn't happen normally)
        ],
      },
      SCOPE,
    )
    const f = (out as { filenames: string[] }).filenames
    expect(f[0]).toBe('a.md')
    expect(f[1]).toBe('sub/b.md')
    expect(f[2]).toBe('funds/fund-B/leak.md')
  })

  it('Grep files_with_matches: strips filenames', () => {
    const out = unscopeResult(
      'huozi_grep',
      {
        mode: 'files_with_matches',
        numFiles: 1,
        filenames: ['funds/fund-A/r.md'],
      },
      SCOPE,
    )
    expect((out as { filenames: string[] }).filenames[0]).toBe('r.md')
  })

  it('Grep content mode: strips scope from each line', () => {
    const inputContent =
      'funds/fund-A/r.md:3:matched\n' +
      'funds/fund-A/r.md-2-context\n' +
      'funds/fund-A/other.md:5:another match'
    const out = unscopeResult(
      'huozi_grep',
      {
        mode: 'content',
        numFiles: 0,
        filenames: [],
        content: inputContent,
      },
      SCOPE,
    )
    const expected =
      'r.md:3:matched\n' + 'r.md-2-context\n' + 'other.md:5:another match'
    expect((out as { content: string }).content).toBe(expected)
  })

  it('batch_edit results[].file_path stripped', () => {
    const out = unscopeResult(
      'huozi_batch_edit',
      {
        commit_sha: 'x',
        aborted: false,
        results: [
          { file_path: 'funds/fund-A/a.md', success: true },
          { file_path: 'funds/fund-A/b.md', success: false, error: { code: 8, message: 'nope' } },
        ],
      },
      SCOPE,
    )
    const rs = (out as { results: Array<{ file_path: string }> }).results
    expect(rs[0]!.file_path).toBe('a.md')
    expect(rs[1]!.file_path).toBe('b.md')
  })

  it('scope=null is identity', () => {
    const input = { file: { filePath: 'abs/path.md' } }
    expect(unscopeResult('huozi_read', input, null)).toEqual(input)
  })
})

describe('unscopeGrepContent edge cases', () => {
  it('empty content unchanged', () => {
    expect(unscopeGrepContent('s/', '')).toBe('')
  })
  it('lines not starting with scope unchanged', () => {
    expect(unscopeGrepContent('s/', 'other:1:x')).toBe('other:1:x')
  })
  it('scope=null is identity', () => {
    expect(unscopeGrepContent(null, 'anything')).toBe('anything')
  })
})
