/**
 * Unit tests for memory.ts — schema constants + validator coverage.
 *
 * Goal: every legal type/op combination passes, and the four likely
 * footguns (unknown op, unknown type, empty body, missing supersedes)
 * reject with a descriptive error.
 */

import { describe, expect, it } from 'vitest'
import {
  MEMORY_OPS,
  MEMORY_SCHEMA,
  MEMORY_TYPES,
  buildInitialMemorySchemaLine,
  validateMemoryEvent,
} from '../memory.js'

describe('memory constants', () => {
  it('declares the four canonical ops', () => {
    expect(MEMORY_OPS).toEqual(['schema', 'record', 'supersede', 'tombstone'])
  })

  it('declares the four canonical types', () => {
    expect(MEMORY_TYPES).toEqual(['feedback', 'project', 'reference', 'user'])
  })

  it('schema headline points at name + colored type chip', () => {
    expect(MEMORY_SCHEMA.entity.title_field).toBe('name')
    expect(MEMORY_SCHEMA.entity.subtitle_field).toBe('type')
    const typeOptions = MEMORY_SCHEMA.fields.type.options
    expect(typeOptions.map((o) => o.value)).toEqual(MEMORY_TYPES)
  })
})

describe('buildInitialMemorySchemaLine', () => {
  it('produces a parseable schema event with the canonical schema body', () => {
    const line = buildInitialMemorySchemaLine({
      at: '2026-05-21T00:00:00.000Z',
      by: 'system',
    })
    const parsed = JSON.parse(line)
    expect(parsed.op).toBe('schema')
    expect(parsed.at).toBe('2026-05-21T00:00:00.000Z')
    expect(parsed.by).toBe('system')
    expect(parsed.version).toBe(1)
    expect(parsed.schema.title).toBe('Agent Memory')
  })
})

describe('validateMemoryEvent — happy paths', () => {
  const base = {
    id: 'm_abc',
    at: '2026-05-21T00:00:00.000Z',
    by: 'user:alice',
    name: 'Test rule',
    body: 'Some body',
  }

  for (const type of MEMORY_TYPES) {
    it(`accepts record op with type=${type}`, () => {
      const r = validateMemoryEvent({ op: 'record', type, ...base })
      expect(r.ok).toBe(true)
    })

    it(`accepts supersede op with type=${type}`, () => {
      const r = validateMemoryEvent({
        op: 'supersede',
        type,
        supersedes: 'm_old',
        ...base,
      })
      expect(r.ok).toBe(true)
    })
  }

  it('accepts tombstone op (no type/name/body required)', () => {
    const r = validateMemoryEvent({
      op: 'tombstone',
      id: 'm_x',
      at: '2026-05-21T00:00:00.000Z',
      by: 'user:alice',
      target: 'm_dead',
    })
    expect(r.ok).toBe(true)
  })

  it('accepts optional why / how_to_apply / origin_session', () => {
    const r = validateMemoryEvent({
      op: 'record',
      type: 'feedback',
      why: 'because',
      how_to_apply: 'always',
      origin_session: 'sess_42',
      ...base,
    })
    expect(r.ok).toBe(true)
  })
})

describe('validateMemoryEvent — illegal field paths', () => {
  const base = {
    id: 'm_abc',
    at: '2026-05-21T00:00:00.000Z',
    by: 'user:alice',
    name: 'Test',
    body: 'Body',
  }

  it('rejects op:"schema" written by client', () => {
    const r = validateMemoryEvent({ op: 'schema', ...base })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/seeded by the system/)
  })

  it('rejects unknown op', () => {
    const r = validateMemoryEvent({ op: 'delete', type: 'feedback', ...base })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/event\.op must be one of/)
  })

  it('rejects unknown type on record', () => {
    const r = validateMemoryEvent({
      op: 'record',
      type: 'lesson',
      ...base,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/event\.type must be one of/)
  })

  it('rejects supersede without "supersedes" pointer', () => {
    const r = validateMemoryEvent({
      op: 'supersede',
      type: 'project',
      ...base,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/supersede event must include "supersedes"/)
  })

  it('rejects tombstone without "target" pointer', () => {
    const r = validateMemoryEvent({
      op: 'tombstone',
      id: 'm_abc',
      at: '2026-05-21T00:00:00.000Z',
      by: 'user:alice',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/tombstone event must include "target"/)
  })

  it('rejects empty body string', () => {
    const r = validateMemoryEvent({
      op: 'record',
      type: 'user',
      ...base,
      body: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/event\.body must be a non-empty string/)
  })

  it('rejects empty name string', () => {
    const r = validateMemoryEvent({
      op: 'record',
      type: 'user',
      ...base,
      name: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/event\.name must be a non-empty string/)
  })

  it('rejects non-object event', () => {
    expect(validateMemoryEvent(null).ok).toBe(false)
    expect(validateMemoryEvent(42).ok).toBe(false)
    expect(validateMemoryEvent('hi').ok).toBe(false)
  })

  it('rejects non-string why / how_to_apply / origin_session', () => {
    const r = validateMemoryEvent({
      op: 'record',
      type: 'feedback',
      ...base,
      why: 123,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/event\.why must be a string/)
  })
})
