import { describe, expect, it } from 'vitest'
import {
  activeChips,
  chipKey,
  inRange,
  kcalRange,
  NO_FILTER,
  parseFilter,
  pickRange,
  sanitise,
  toStatsFilter,
  toggled,
  withoutChip,
  type CockpitFilter,
} from '../../src/features/cockpit/filter'

// Tuesday.
const today = '2026-11-10'
const on = { calories: true }
const filter = (changes: Partial<CockpitFilter>): CockpitFilter => ({ ...NO_FILTER, ...changes })

describe('what the numbers library is asked for', () => {
  it('asks for everything when nothing is set', () => {
    expect(toStatsFilter(NO_FILTER, today, on)).toEqual({})
  })

  it('turns the presets into days', () => {
    expect(toStatsFilter(filter({ range: 'week' }), today, on)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(toStatsFilter(filter({ range: 'month' }), today, on)).toEqual({ from: '2026-11-01', to: today })
    expect(toStatsFilter(filter({ range: 'quarter' }), today, on)).toEqual({ from: '2026-08-10', to: today })
    expect(toStatsFilter(filter({ range: 'year' }), today, on)).toEqual({ from: '2026-01-01', to: today })
  })

  it('takes a custom range as written, with either end open', () => {
    expect(toStatsFilter(filter({ range: 'custom', from: '2026-09-01', to: '2026-09-30' }), today, on)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(toStatsFilter(filter({ range: 'custom', from: '2026-09-01' }), today, on)).toEqual({ from: '2026-09-01' })
    expect(toStatsFilter(filter({ range: 'custom', to: '2026-09-30' }), today, on)).toEqual({ to: '2026-09-30' })
    expect(toStatsFilter(filter({ range: 'custom' }), today, on)).toEqual({})
  })

  it('puts a custom range that was typed backwards the right way round', () => {
    expect(toStatsFilter(filter({ range: 'custom', from: '2026-09-30', to: '2026-09-01' }), today, on)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('ignores custom days left over from before when a preset is chosen', () => {
    expect(toStatsFilter(filter({ range: 'all', from: '2026-09-01', to: '2026-09-30' }), today, on)).toEqual({})
  })

  it('passes dishes, menu, courses, tags, cook, rating and reactions on', () => {
    expect(
      toStatsFilter(filter({ dishIds: ['a', 'b'], menuId: 'm', courses: ['main'], tags: ['Swiss'], cookedBy: 'mia', overall: [5, 4], reactions: [6, 5] }), today, on),
    ).toEqual({ dishIds: ['a', 'b'], menuId: 'm', courses: ['main'], tags: ['Swiss'], cookedBy: 'mia', overall: [4, 5], reactions: [6, 5] })
  })

  it('turns calorie buckets into kcal with both ends included', () => {
    expect(kcalRange([0, 0])).toEqual([0, 299.999])
    expect(kcalRange([1, 2])).toEqual([300, 699.999])
    expect(kcalRange([2, 1])).toEqual([300, 699.999])
    expect(kcalRange([3, 3])).toEqual([700, Infinity])
    expect(toStatsFilter(filter({ kcal: [1, 1] }), today, on)).toEqual({ kcalPerServing: [300, 499.999] })
  })

  it('drops the calorie filter while calories are hidden', () => {
    expect(toStatsFilter(filter({ kcal: [1, 1], courses: ['main'] }), today, { calories: false })).toEqual({ courses: ['main'] })
  })
})

describe('chips', () => {
  const busy = filter({ range: 'quarter', dishIds: ['a', 'b'], menuId: 'm', courses: ['main', 'dessert'], tags: ['Swiss'], cookedBy: 'mia', overall: [5, 4], reactions: [6, 2], kcal: [2, 1] })

  it('shows nothing while nothing narrows the numbers', () => {
    expect(activeChips(NO_FILTER, on)).toEqual([])
  })

  it('shows one chip for each thing that does, in the order of the filter bar', () => {
    expect(activeChips(busy, on).map(chipKey)).toEqual(['range', 'dish:a', 'dish:b', 'menu:m', 'course:main', 'course:dessert', 'tag:Swiss', 'cook:mia', 'overall', 'reaction:2', 'reaction:6', 'kcal'])
  })

  it('writes ranges lowest first', () => {
    const chips = activeChips(busy, on)
    expect(chips.find((chip) => chip.kind === 'overall')).toEqual({ kind: 'overall', range: [4, 5] })
    expect(chips.find((chip) => chip.kind === 'kcal')).toEqual({ kind: 'kcal', range: [1, 2] })
  })

  it('hides the calorie chip while calories are hidden', () => {
    expect(activeChips(busy, { calories: false }).some((chip) => chip.kind === 'kcal')).toBe(false)
  })

  it('takes one chip away and leaves the others', () => {
    let left = busy
    for (const chip of activeChips(busy, on)) {
      const next = withoutChip(left, chip)
      expect(activeChips(next, on).map(chipKey)).toEqual(activeChips(left, on).map(chipKey).filter((key) => key !== chipKey(chip)))
      left = next
    }
    expect(left).toEqual(NO_FILTER)
  })

  it('forgets the custom days together with the range chip', () => {
    expect(withoutChip(filter({ range: 'custom', from: '2026-09-01', to: '2026-09-30' }), { kind: 'range' })).toEqual(NO_FILTER)
  })
})

describe('picking a range on a row of chips', () => {
  it('starts with the one that was tapped', () => {
    expect(pickRange(null, 4)).toEqual([4, 4])
  })

  it('grows to reach a tap outside', () => {
    expect(pickRange([4, 4], 5)).toEqual([4, 5])
    expect(pickRange([4, 5], 2)).toEqual([2, 5])
    expect(pickRange([2, 3], 5)).toEqual([2, 5])
  })

  it('lets go of an end that is tapped', () => {
    expect(pickRange([2, 5], 2)).toEqual([3, 5])
    expect(pickRange([2, 5], 5)).toEqual([2, 4])
  })

  it('keeps only the one tapped in the middle', () => {
    expect(pickRange([1, 5], 3)).toEqual([3, 3])
  })

  it('clears when the only one picked is tapped again', () => {
    expect(pickRange([3, 3], 3)).toBeNull()
  })

  it('reads a range whichever way round it was stored', () => {
    expect(pickRange([5, 2], 1)).toEqual([1, 5])
    expect(inRange([5, 2], 3)).toBe(true)
    expect(inRange([2, 5], 1)).toBe(false)
    expect(inRange(null, 3)).toBe(false)
  })
})

describe('toggling', () => {
  it('adds what is missing and removes what is there', () => {
    expect(toggled(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggled(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('choices that no longer exist', () => {
  const known = { dishIds: new Set(['a']), menuIds: new Set(['m']), memberIds: new Set(['mia']) }

  it('are dropped', () => {
    expect(sanitise(filter({ dishIds: ['a', 'gone'], menuId: 'old', cookedBy: 'nobody', courses: ['main'] }), known)).toEqual(filter({ dishIds: ['a'], courses: ['main'] }))
  })

  it('leave a clean filter untouched (the very same object)', () => {
    const clean = filter({ dishIds: ['a'], menuId: 'm', cookedBy: 'mia' })
    expect(sanitise(clean, known)).toBe(clean)
  })
})

describe('a filter that was saved as text', () => {
  it('comes back as it was', () => {
    const saved = filter({ range: 'custom', from: '2026-09-01', to: '2026-09-30', dishIds: ['a'], menuId: 'm', courses: ['main'], tags: ['Swiss'], cookedBy: 'mia', overall: [4, 5], reactions: [5, 6], kcal: [0, 1] })
    expect(parseFilter(JSON.stringify(saved))).toEqual(saved)
  })

  it('falls back to no filter when there is nothing, or nonsense', () => {
    expect(parseFilter(null)).toEqual(NO_FILTER)
    expect(parseFilter('')).toEqual(NO_FILTER)
    expect(parseFilter('{not json')).toEqual(NO_FILTER)
    expect(parseFilter('[]')).toEqual(NO_FILTER)
  })

  it('keeps what makes sense and drops the rest', () => {
    expect(parseFilter(JSON.stringify({ range: 'decade', from: 'yesterday', to: '2026-09-30', dishIds: 'a', reactions: [6, 7, 'x'], overall: [1], kcal: [1, 2], tags: ['Swiss', 3] }))).toEqual(
      filter({ to: '2026-09-30', reactions: [6], kcal: [1, 2], tags: ['Swiss'] }),
    )
  })
})
