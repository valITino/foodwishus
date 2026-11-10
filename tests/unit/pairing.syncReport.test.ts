import { describe, expect, it } from 'vitest'
import { syncReport, type SyncReportInput } from '../../src/features/settings/syncReport'

const base: SyncReportInput = {
  version: '0.1.0',
  backend: 'supabase',
  now: '2026-11-10T08:00:00.000Z',
  status: { state: 'idle', pending: 0, uploads: 0, stuck: 0, lastSyncAt: '2026-11-10T07:59:00.000Z', lastError: null },
  online: true,
  demo: false,
  lang: 'en',
  theme: 'light',
  members: 2,
  householdId: '11111111-2222-3333-4444-555555555555',
  memberId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  userAgent: 'TestPhone/1.0',
  refused: [],
}

describe('the sync report for support', () => {
  it('lists the state, the counts and the versions', () => {
    const text = syncReport(base)
    expect(text.split('\n')[0]).toBe('FoodwishUs sync report')
    expect(text).toContain('App: 0.1.0 (supabase)')
    expect(text).toContain('State: idle')
    expect(text).toContain('Last sync: 2026-11-10T07:59:00.000Z')
    expect(text).toContain('Changes waiting: 0')
    expect(text).toContain('Photos waiting: 0')
    expect(text).toContain('Refused changes: 0')
    expect(text).toContain('Last error: none')
    expect(text).toContain('Phone: TestPhone/1.0')
  })

  it('shows only the start of the ids', () => {
    const text = syncReport(base)
    expect(text).toContain('Kitchen: 11111111, people: 2, me: aaaaaaaa')
    expect(text).not.toContain('2222-3333')
    expect(text).not.toContain('bbbb-cccc')
  })

  it('spells out trouble: offline, waiting changes, refused changes, the last error', () => {
    const text = syncReport({
      ...base,
      online: false,
      status: { state: 'error', pending: 3, uploads: 1, stuck: 12, lastSyncAt: null, lastError: 'forbidden' },
      refused: Array.from({ length: 12 }, (_, i) => ({ table: 'dishes', kind: 'patch', lastError: i ? 'forbidden' : undefined, failedAt: '2026-11-10T07:00:00.000Z' })),
    })
    expect(text).toContain('State: error')
    expect(text).toContain('Online: no')
    expect(text).toContain('Last sync: never')
    expect(text).toContain('Changes waiting: 3')
    expect(text).toContain('Photos waiting: 1')
    expect(text).toContain('Last error: forbidden')
    expect(text).toContain('Refused: patch dishes, no reason given, 2026-11-10T07:00:00.000Z')
    expect(text.match(/^Refused: /gm)).toHaveLength(10)
    expect(text).toContain('and 2 more refused changes')
  })

  it('says when it comes from the demo kitchen or an unpaired phone', () => {
    expect(syncReport({ ...base, demo: true, backend: 'fake' })).toContain('App: 0.1.0 (fake, demo kitchen)')
    expect(syncReport({ ...base, householdId: undefined, memberId: undefined, members: 0 })).toContain('Kitchen: none, people: 0, me: none')
  })
})
