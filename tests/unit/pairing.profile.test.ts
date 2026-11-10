import { describe, expect, it } from 'vitest'
import { profileCopy } from '../../src/features/profile/copy'
import { changesBetween, clip, defaultDraft, draftFromMember, isReady, nextSuggestion, PLATE_COLORS, sameName, STATUS_MAX, toProfileInput, withRole, type ProfileDraft } from '../../src/features/profile/draft'
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

  it('hands the whole profile over in one go when opening or joining a kitchen', () => {
    expect(toProfileInput({ ...mia, name: '  Mia  ' })).toEqual({ name: 'Mia', avatar: 'whisk', color: 'rose', accessory: 'bow', status: 'Chef mode: on.', defaultRole: 'chef' })
    expect(toProfileInput({ ...mia, status: '   ', accessory: null })).toMatchObject({ status: null, accessory: null })
  })

  it('lets the look follow the role until someone has touched it', () => {
    // Untouched: the Chef's whisk becomes the Taster's Fork, and back.
    const asTaster = withRole(defaultDraft('chef'), 'taster')
    expect(asTaster).toMatchObject({ role: 'taster', avatar: 'fork', color: 'sage' })
    expect(withRole(asTaster, 'chef')).toMatchObject({ role: 'chef', avatar: 'whisk', color: 'rose' })
    // Touched: only the role changes.
    expect(withRole({ ...defaultDraft('chef'), avatar: 'cherry' }, 'taster')).toMatchObject({ role: 'taster', avatar: 'cherry', color: 'rose' })
    expect(withRole({ ...defaultDraft('chef'), accessory: 'crown' }, 'taster')).toMatchObject({ role: 'taster', avatar: 'whisk', accessory: 'crown' })
    // The name and status always stay.
    expect(withRole({ ...defaultDraft('chef'), name: 'Mia', status: 'Hi' }, 'taster')).toMatchObject({ name: 'Mia', status: 'Hi' })
  })

  it('treats two names as the same log-in without capitals and outer spaces', () => {
    expect(sameName('Leo', '  leo ')).toBe(true)
    expect(sameName('Leo', 'Leon')).toBe(false)
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

  it('asks "who are you at the table?" with two different lines per language', () => {
    for (const c of [profileCopy.en, profileCopy.de]) {
      expect(c.roleCards.chef.title).not.toBe(c.roleCards.taster.title)
      expect(c.roleSwap.length).toBeGreaterThan(10)
      expect(c.nameTaken('Mia')).toContain('Mia')
    }
    // German is written for German, not translated word by word.
    expect(profileCopy.de.roleCards.chef.title).toBe('Ich schwinge den Kochlöffel')
  })
})
