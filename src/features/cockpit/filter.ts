// The Cockpit's one shared filter: what the filter bar holds, how it becomes the
// StatsFilter the numbers library understands, and which chips it shows. Pure logic.

import type { Course, Day, ID, Reaction } from '../../data/types'
import { rangeFor, type RangePreset, type StatsFilter } from '../../lib/stats'

export type RangeChoice = RangePreset | 'custom'

export const RANGE_CHOICES: readonly RangeChoice[] = ['week', 'month', 'quarter', 'year', 'all', 'custom']

export interface CockpitFilter {
  range: RangeChoice
  /** Only used with the custom range. Either end may stay open. */
  from: Day | null
  to: Day | null
  dishIds: ID[]
  menuId: ID | null
  courses: Course[]
  tags: string[]
  cookedBy: ID | null
  /** Lowest and highest overall rating, both included. */
  overall: [number, number] | null
  reactions: Reaction[]
  /** First and last calorie bucket, as indexes into KCAL_BUCKETS. */
  kcal: [number, number] | null
}

export const NO_FILTER: CockpitFilter = {
  range: 'all',
  from: null,
  to: null,
  dishIds: [],
  menuId: null,
  courses: [],
  tags: [],
  cookedBy: null,
  overall: null,
  reactions: [],
  kcal: null,
}

/** kcal per serving, from "from" up to but not including "below". The last bucket has no upper end. */
export const KCAL_BUCKETS: readonly { from: number; below: number }[] = [
  { from: 0, below: 300 },
  { from: 300, below: 500 },
  { from: 500, below: 700 },
  { from: 700, below: Infinity },
]

/** The kcal range a pair of buckets stands for, with both ends included (as StatsFilter wants it). */
export function kcalRange([first, last]: [number, number]): [number, number] {
  const low = KCAL_BUCKETS[Math.min(first, last)] ?? KCAL_BUCKETS[0]
  const high = KCAL_BUCKETS[Math.max(first, last)] ?? KCAL_BUCKETS[KCAL_BUCKETS.length - 1]
  return [low.from, high.below === Infinity ? Infinity : high.below - 0.001]
}

/** What the numbers library filters by. Calories only count while calories are shown. */
export function toStatsFilter(filter: CockpitFilter, today: Day, options: { calories: boolean }): StatsFilter {
  const out: StatsFilter = {}
  if (filter.range === 'custom') {
    let { from, to } = filter
    if (from && to && from > to) [from, to] = [to, from]
    if (from) out.from = from
    if (to) out.to = to
  } else {
    Object.assign(out, rangeFor(filter.range, today))
  }
  if (filter.dishIds.length) out.dishIds = filter.dishIds
  if (filter.menuId) out.menuId = filter.menuId
  if (filter.courses.length) out.courses = filter.courses
  if (filter.tags.length) out.tags = filter.tags
  if (filter.cookedBy) out.cookedBy = filter.cookedBy
  if (filter.overall) out.overall = [Math.min(...filter.overall), Math.max(...filter.overall)]
  if (filter.reactions.length) out.reactions = filter.reactions
  if (filter.kcal && options.calories) out.kcalPerServing = kcalRange(filter.kcal)
  return out
}

export type FilterChip =
  | { kind: 'range' }
  | { kind: 'dish'; id: ID }
  | { kind: 'menu'; id: ID }
  | { kind: 'course'; course: Course }
  | { kind: 'tag'; tag: string }
  | { kind: 'cook'; id: ID }
  | { kind: 'overall'; range: [number, number] }
  | { kind: 'reaction'; reaction: Reaction }
  | { kind: 'kcal'; range: [number, number] }

export function chipKey(chip: FilterChip): string {
  switch (chip.kind) {
    case 'dish':
    case 'menu':
    case 'cook':
      return `${chip.kind}:${chip.id}`
    case 'course':
      return `course:${chip.course}`
    case 'tag':
      return `tag:${chip.tag}`
    case 'reaction':
      return `reaction:${chip.reaction}`
    default:
      return chip.kind
  }
}

/** One chip for everything that narrows the numbers, in the order of the filter bar. */
export function activeChips(filter: CockpitFilter, options: { calories: boolean }): FilterChip[] {
  const chips: FilterChip[] = []
  if (filter.range !== 'all') chips.push({ kind: 'range' })
  for (const id of filter.dishIds) chips.push({ kind: 'dish', id })
  if (filter.menuId) chips.push({ kind: 'menu', id: filter.menuId })
  for (const course of filter.courses) chips.push({ kind: 'course', course })
  for (const tag of filter.tags) chips.push({ kind: 'tag', tag })
  if (filter.cookedBy) chips.push({ kind: 'cook', id: filter.cookedBy })
  if (filter.overall) chips.push({ kind: 'overall', range: [Math.min(...filter.overall), Math.max(...filter.overall)] })
  for (const reaction of [...filter.reactions].sort((a, b) => a - b)) chips.push({ kind: 'reaction', reaction })
  if (filter.kcal && options.calories) chips.push({ kind: 'kcal', range: [Math.min(...filter.kcal), Math.max(...filter.kcal)] })
  return chips
}

/** The filter with one chip taken away. */
export function withoutChip(filter: CockpitFilter, chip: FilterChip): CockpitFilter {
  switch (chip.kind) {
    case 'range':
      return { ...filter, range: 'all', from: null, to: null }
    case 'dish':
      return { ...filter, dishIds: filter.dishIds.filter((id) => id !== chip.id) }
    case 'menu':
      return { ...filter, menuId: null }
    case 'course':
      return { ...filter, courses: filter.courses.filter((c) => c !== chip.course) }
    case 'tag':
      return { ...filter, tags: filter.tags.filter((t) => t !== chip.tag) }
    case 'cook':
      return { ...filter, cookedBy: null }
    case 'overall':
      return { ...filter, overall: null }
    case 'reaction':
      return { ...filter, reactions: filter.reactions.filter((r) => r !== chip.reaction) }
    case 'kcal':
      return { ...filter, kcal: null }
  }
}

/** Add the value when it is missing, take it out when it is there. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/**
 * Picking a range on a row of ordered chips (ratings 1 to 5, calorie buckets). The
 * selection is always one unbroken stretch:
 *   nothing picked, tap 4        → 4 to 4
 *   tap outside the stretch      → the stretch grows to reach it
 *   tap an end of the stretch    → that end lets go
 *   tap in the middle            → only that one
 */
export function pickRange(current: [number, number] | null, value: number): [number, number] | null {
  if (!current) return [value, value]
  const low = Math.min(...current)
  const high = Math.max(...current)
  if (value < low) return [value, high]
  if (value > high) return [low, value]
  if (low === high) return null
  if (value === low) return [low + 1, high]
  if (value === high) return [low, high - 1]
  return [value, value]
}

export const inRange = (range: [number, number] | null, value: number): boolean => range !== null && value >= Math.min(...range) && value <= Math.max(...range)

export interface Known {
  dishIds: ReadonlySet<ID>
  menuIds: ReadonlySet<ID>
  memberIds: ReadonlySet<ID>
}

/** Drop choices that point at things which no longer exist (a deleted dish, another kitchen). */
export function sanitise(filter: CockpitFilter, known: Known): CockpitFilter {
  const dishIds = filter.dishIds.filter((id) => known.dishIds.has(id))
  const menuId = filter.menuId && known.menuIds.has(filter.menuId) ? filter.menuId : null
  const cookedBy = filter.cookedBy && known.memberIds.has(filter.cookedBy) ? filter.cookedBy : null
  if (dishIds.length === filter.dishIds.length && menuId === filter.menuId && cookedBy === filter.cookedBy) return filter
  return { ...filter, dishIds, menuId, cookedBy }
}

const isDay = (value: unknown): value is Day => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isPair = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n))
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/** Read a filter that was saved as text. Anything odd falls back to "no filter". */
export function parseFilter(text: string | null): CockpitFilter {
  if (!text) return NO_FILTER
  try {
    const raw = JSON.parse(text) as Partial<Record<keyof CockpitFilter, unknown>>
    return {
      range: RANGE_CHOICES.includes(raw.range as RangeChoice) ? (raw.range as RangeChoice) : 'all',
      from: isDay(raw.from) ? raw.from : null,
      to: isDay(raw.to) ? raw.to : null,
      dishIds: strings(raw.dishIds),
      menuId: typeof raw.menuId === 'string' ? raw.menuId : null,
      courses: strings(raw.courses) as Course[],
      tags: strings(raw.tags),
      cookedBy: typeof raw.cookedBy === 'string' ? raw.cookedBy : null,
      overall: isPair(raw.overall) ? raw.overall : null,
      reactions: (Array.isArray(raw.reactions) ? raw.reactions.filter((r) => [1, 2, 3, 4, 5, 6].includes(r as number)) : []) as Reaction[],
      kcal: isPair(raw.kcal) ? raw.kcal : null,
    }
  } catch {
    return NO_FILTER
  }
}
