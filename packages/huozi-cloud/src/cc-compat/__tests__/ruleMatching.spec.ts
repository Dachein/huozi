/**
 * Unit tests for cc-compat/ruleMatching.ts — permission rule semantics.
 *
 * These must stay byte-identical to CC's behavior. If any of these fail,
 * the permission system in the Agent stops behaving like users expect.
 */

import { describe, expect, it } from 'vitest'
import {
  hasWildcards,
  matchWildcardPattern,
  parsePermissionRule,
  permissionRuleExtractPrefix,
} from '../ruleMatching.js'

describe('permissionRuleExtractPrefix', () => {
  it('extracts "npm" from "npm:*"', () => {
    expect(permissionRuleExtractPrefix('npm:*')).toBe('npm')
  })
  it('returns null for plain strings', () => {
    expect(permissionRuleExtractPrefix('npm run build')).toBeNull()
  })
  it('handles multi-word prefixes', () => {
    expect(permissionRuleExtractPrefix('git push origin:*')).toBe(
      'git push origin',
    )
  })
  it('null for wildcard mid-string', () => {
    expect(permissionRuleExtractPrefix('git * push')).toBeNull()
  })
})

describe('hasWildcards', () => {
  it('false for plain strings', () => {
    expect(hasWildcards('git push')).toBe(false)
  })
  it('false for legacy :* (those are prefix, not wildcard)', () => {
    expect(hasWildcards('npm:*')).toBe(false)
  })
  it('true for "git *"', () => {
    expect(hasWildcards('git *')).toBe(true)
  })
  it('false for escaped \\*', () => {
    expect(hasWildcards('\\*literal')).toBe(false)
  })
  it('true for multiple wildcards', () => {
    expect(hasWildcards('git * *')).toBe(true)
  })
  it('handles escaped backslash before *', () => {
    // \\* → literal backslash followed by unescaped wildcard → IS a wildcard
    expect(hasWildcards('\\\\*')).toBe(true)
  })
})

describe('matchWildcardPattern', () => {
  it('exact match works', () => {
    expect(matchWildcardPattern('git push', 'git push')).toBe(true)
  })
  it('no match for different strings', () => {
    expect(matchWildcardPattern('git push', 'git pull')).toBe(false)
  })
  it('* matches any characters', () => {
    expect(matchWildcardPattern('git *', 'git push origin main')).toBe(true)
    expect(matchWildcardPattern('git *', 'git')).toBe(true) // trailing " *" special case
  })
  it('* stops at end anchor', () => {
    expect(matchWildcardPattern('npm *', 'yarn add')).toBe(false)
  })
  it('\\* matches literal asterisk', () => {
    expect(matchWildcardPattern('echo \\*', 'echo *')).toBe(true)
    expect(matchWildcardPattern('echo \\*', 'echo hello')).toBe(false)
  })
  it('multiple wildcards do NOT get the trailing-space optional treatment', () => {
    // 'npm * run' should require an argument before "run"
    expect(matchWildcardPattern('* run *', 'npm run build')).toBe(true)
    expect(matchWildcardPattern('* run *', 'npm run')).toBe(false)
  })
  it('dotAll flag: `.*` inside match spans newlines', () => {
    // The trailing " *" optimization requires a literal space before the
    // wildcard content, but once inside the wildcard, `.` with the `s`
    // flag matches newlines.
    expect(matchWildcardPattern('echo *', 'echo multi\nline')).toBe(true)
    // And the leading-space requirement still holds — newline in place of
    // the expected space does NOT match.
    expect(matchWildcardPattern('echo *', 'echo\nhello')).toBe(false)
  })
  it('case-insensitive mode', () => {
    expect(matchWildcardPattern('GIT push', 'git push', true)).toBe(true)
    expect(matchWildcardPattern('GIT push', 'git push', false)).toBe(false)
  })
  it('whitespace around pattern is trimmed', () => {
    expect(matchWildcardPattern('  git push  ', 'git push')).toBe(true)
  })
  it('regex special chars in pattern are literal', () => {
    // + ? . [ ] etc should NOT be interpreted as regex
    expect(matchWildcardPattern('foo.bar', 'fooXbar')).toBe(false)
    expect(matchWildcardPattern('foo.bar', 'foo.bar')).toBe(true)
    expect(matchWildcardPattern('a+b', 'a+b')).toBe(true)
    expect(matchWildcardPattern('a+b', 'aab')).toBe(false)
  })
})

describe('parsePermissionRule', () => {
  it('classifies "git push" as exact', () => {
    expect(parsePermissionRule('git push')).toEqual({
      type: 'exact',
      command: 'git push',
    })
  })
  it('classifies "npm:*" as prefix', () => {
    expect(parsePermissionRule('npm:*')).toEqual({
      type: 'prefix',
      prefix: 'npm',
    })
  })
  it('classifies "git *" as wildcard', () => {
    expect(parsePermissionRule('git *')).toEqual({
      type: 'wildcard',
      pattern: 'git *',
    })
  })
  it('classifies "cmd \\*" as exact (escaped star, no wildcard)', () => {
    expect(parsePermissionRule('cmd \\*')).toEqual({
      type: 'exact',
      command: 'cmd \\*',
    })
  })
})
