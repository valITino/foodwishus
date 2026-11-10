import { describe, expect, it } from 'vitest'
import { profileCopy } from '../../src/features/profile/copy'
import { changesBetween, clip, defaultDraft, draftFromMember, extrasOf, isReady, nextSuggestion, PLATE_COLORS, STATUS_MAX, toProfileInput, type ProfileDraft } from '../../src/features/profile/draft'
import { ACCESSORIES, AVATARS } from '../../src/ui/components/Bits'

const mia: ProfileDraft = { name: 'Mia', role: 'chef', avatar: 'whisk', color: 'rose', accessory: 'bow', status: 'Chef mode: on.' }

describe('profile drafts', () => {
  it('starts the Chef with the whisk and the Taster with Fork', () => {
    expect(defaultDraft('chef')).toMatchObject({ role: 'chef', avatar: 'whisk', color: 'rose', accessory: null, status: '' })
    expect(defaultDraft('taster')).toMatchObject({ role: 'taster', avatar: 'fork', color: 'sage' })
    expect(isReady(defaultDraft('chef'))).toBe(false)
    expect(isReady({ ...defaultDraft('chef'), name: '  ' })).toBe(false)
    expect(isReady(mia)).toBe(true)
  })

  it('splits a draft into what pairing carries and what is saved right after', () => {
    expect(toProfileInput({ ...mia, name: '  Mia  ' })).toEqual({ name: 'Mia', avatar: 'whisk', color: 'rose', defaultRole: 'chef' })
    expect(extrasOf(mia)).toEqual({ status: 'Chef mode: on.', accessory: 'bow' })
    expect(extrasOf({ ...mia, status: '   ', accessory: null })).toEqual({ status: null, accessory: null })
  })

  it('reads a saved profile back into a draft', () => {
    expect(draftFromMember({ name: 'Leo', defaultRole: 'taster', avatar: 'fork', color: 'sage', accessory: null, status: null })).toEqual({
      name: 'Leo',
      role: 'taster',
      avatar: 'fork',
      color: 'sage',
      accessory: null,
      status: '',
    })
  })

  it('saves only what changed', () => {
    expect(changesBetween(mia, mia)).toEqual({})
    expect(changesBetween(mia, { ...mia, status: 'Always Huuungryyyyy' })).toEqual({ status: 'Always Huuungryyyyy' })
    expect(changesBetween(mia, { ...mia, status: '  ' })).toEqual({ status: null })
    expect(changesBetween(mia, { ...mia, accessory: null, color: 'sky' })).toEqual({ accessory: null, color: 'sky' })
    expect(changesBetween(mia, { ...mia, name: ' Mia ', role: 'taster' })).toEqual({ defaultRole: 'taster' })
  })

  it('cuts long text without leaving half an emoji', () => {
    expect(clip('abc', 60)).toBe('abc')
    expect(clip('x'.repeat(70), STATUS_MAX)).toHaveLength(60)
    const cut = clip('x'.repeat(59) + '🍝', STATUS_MAX)
    expect(cut).toBe('x'.repeat(59))
  })

  it('"Surprise me" walks through the suggestions and starts over', () => {
    const list = ['one', 'two', 'three']
    expect(nextSuggestion(list, '')).toBe('one')
    expect(nextSuggestion(list, 'one')).toBe('two')
    expect(nextSuggestion(list, 'three')).toBe('one')
    expect(nextSuggestion(list, 'my own words')).toBe('one')
    expect(nextSuggestion([], 'kept')).toBe('kept')
  })
})

describe('profile copy', () => {
  it('has a name for every character, plate colour and accessory in both languages', () => {
    for (const c of [profileCopy.en, profileCopy.de]) {
      for (const avatar of AVATARS) expect(c.characters[avatar]).toBeTruthy()
      for (const color of PLATE_COLORS) expect(c.plates[color]).toBeTruthy()
      for (const accessory of ['none', ...ACCESSORIES]) expect(c.accessories[accessory]).toBeTruthy()
    }
  })

  it('only suggests status lines that fit and are not repeated', () => {
    for (const c of [profileCopy.en, profileCopy.de]) {
      for (const role of ['chef', 'taster'] as const) {
        const list = c.suggestions[role]
        expect(list.length).toBeGreaterThanOrEqual(6)
        expect(new Set(list).size).toBe(list.length)
        for (const line of list) expect(line.length).toBeLessThanOrEqual(STATUS_MAX)
      }
    }
    // The user's own example comes first for the Taster.
    expect(profileCopy.en.suggestions.taster[0]).toBe('Always Huuungryyyyy')
  })
})
