import { describe, expect, test } from 'bun:test'

import { nextDomainStatus } from './checklist'

const items = (...done: boolean[]) => done.map((isDone) => ({ done: isDone }))

describe('nextDomainStatus', () => {
  test('closes only when every item is done', () => {
    expect(nextDomainStatus('in_progress', items(true, true))).toBe('closed')
    expect(nextDomainStatus('not_started', items(true, true))).toBe('closed')
    expect(nextDomainStatus('closed', items(true, false))).not.toBe('closed')
  })

  test('moves to in_progress when any item is done', () => {
    expect(nextDomainStatus('not_started', items(false, true, false))).toBe('in_progress')
    expect(nextDomainStatus('in_progress', items(true, false))).toBe('in_progress')
  })

  test('never downgrades a domain with no done items', () => {
    expect(nextDomainStatus('not_started', items(false, false))).toBe('not_started')
    expect(nextDomainStatus('in_progress', items(false))).toBe('in_progress')
    expect(nextDomainStatus('closed', [])).toBe('closed')
    expect(nextDomainStatus('not_started', [])).toBe('not_started')
  })
})
