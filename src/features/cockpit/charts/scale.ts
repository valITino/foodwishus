// The arithmetic behind the charts: scales, ticks, time buckets and the little
// geometry helpers. Pure functions, so every one of them is unit-tested.

import type { Day } from '../../../data/types'
import { addDays, diffDays, weekOf } from '../../../lib/dates'

export type Scale = (value: number) => number

/** A straight-line scale from a domain to pixels. A domain without width maps to the middle. */
export function linear(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  if (d1 === d0) return () => (r0 + r1) / 2
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0)
}

/** A round step (1, 2, 2.5 or 5 times a power of ten) that is at least the given size. */
export function niceStep(rough: number): number {
  if (!(rough > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(rough))
  const unit = rough / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return nice * power
}

/**
 * Round axis ticks from zero up to at least the given maximum: niceTicks(7870) is
 * [0, 2000, 4000, 6000, 8000]. Counts stay whole: niceTicks(3) is [0, 1, 2, 3].
 */
export function niceTicks(max: number, about = 4, whole = false): number[] {
  if (!(max > 0)) return [0, 1]
  let step = niceStep(max / about)
  if (whole) step = Math.max(1, Math.ceil(step))
  const ticks: number[] = []
  for (let i = 0; i * step < max + step - 1e-9; i++) ticks.push(Number((i * step).toPrecision(12)))
  return ticks
}

/** A number between 0 and 1 that is always the same for the same text. */
export function hashUnit(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100_000) / 100_000
}

/** A small, repeatable nudge between −amount and +amount. */
export function jitter(key: string, amount: number): number {
  return (hashUnit(key) * 2 - 1) * amount
}

/**
 * Points that share a spot fan out like the seeds of a sunflower, so every one stays
 * visible and a crowd looks like a crowd. The first point of a spot sits exactly on it.
 */
export function swarm<T extends { key: string; x: number; y: number }>(points: T[], spacing: number): (T & { dx: number; dy: number })[] {
  const groups = new Map<string, T[]>()
  for (const point of points) {
    const spot = `${point.x}|${point.y}`
    groups.set(spot, [...(groups.get(spot) ?? []), point])
  }
  const golden = Math.PI * (3 - Math.sqrt(5))
  const placed = new Map<string, { dx: number; dy: number }>()
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    ordered.forEach((point, i) => {
      const radius = spacing * Math.sqrt(i)
      placed.set(point.key, { dx: Math.cos(i * golden) * radius, dy: Math.sin(i * golden) * radius })
    })
  }
  return points.map((point) => ({ ...point, ...(placed.get(point.key) as { dx: number; dy: number }) }))
}

/** A point on a circle. Angles are in turns: 0 is twelve o'clock, 0.25 is three o'clock. */
export function polar(cx: number, cy: number, radius: number, turn: number): [number, number] {
  const angle = turn * Math.PI * 2 - Math.PI / 2
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
}

const round = (value: number) => Math.round(value * 100) / 100

/** One slice of a ring, from one turn to another (see polar). */
export function ringSlice(cx: number, cy: number, outer: number, inner: number, from: number, to: number): string {
  // A full ring cannot be drawn as one arc: stop a hair short.
  const end = to - from >= 1 ? from + 0.9999 : to
  const large = end - from > 0.5 ? 1 : 0
  const [x0, y0] = polar(cx, cy, outer, from)
  const [x1, y1] = polar(cx, cy, outer, end)
  const [x2, y2] = polar(cx, cy, inner, end)
  const [x3, y3] = polar(cx, cy, inner, from)
  return `M${round(x0)} ${round(y0)}A${outer} ${outer} 0 ${large} 1 ${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}A${inner} ${inner} 0 ${large} 0 ${round(x3)} ${round(y3)}Z`
}

/** A line through points, as an SVG path. */
export function linePath(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join('')
}

// ------------------------------------------------------------------- time --

export type BucketUnit = 'day' | 'week' | 'month'

/** Days for a short stretch, weeks for a season, months for anything longer. */
export function chooseBucket(first: Day, last: Day): BucketUnit {
  const span = diffDays(first, last) + 1
  if (span <= 21) return 'day'
  if (span <= 190) return 'week'
  return 'month'
}

/** The first day of the bucket a day falls into: the day itself, its Monday, or the 1st. */
export function bucketStart(day: Day, unit: BucketUnit): Day {
  if (unit === 'day') return day
  if (unit === 'week') return weekOf(day)[0]
  return `${day.slice(0, 8)}01`
}

export interface BucketMean {
  start: Day
  mean: number
  n: number
}

/** The mean per bucket, oldest first. Buckets without values are left out. */
export function bucketMeans(points: readonly { day: Day; value: number }[], unit: BucketUnit): BucketMean[] {
  const sums = new Map<Day, { sum: number; n: number }>()
  for (const point of points) {
    const start = bucketStart(point.day, unit)
    const entry = sums.get(start) ?? { sum: 0, n: 0 }
    entry.sum += point.value
    entry.n += 1
    sums.set(start, entry)
  }
  return [...sums]
    .map(([start, { sum, n }]) => ({ start, mean: sum / n, n }))
    .sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * The weeks (Monday to Sunday) that cover a stretch of days, oldest first. Days outside
 * the stretch are null, so the first and the last week can be ragged.
 */
export function calendarWeeks(from: Day, to: Day): (Day | null)[][] {
  if (from > to) return []
  const weeks: (Day | null)[][] = []
  for (let monday = weekOf(from)[0]; monday <= to; monday = addDays(monday, 7)) {
    weeks.push(weekOf(monday).map((day) => (day >= from && day <= to ? day : null)))
  }
  return weeks
}

/** The first day of every month that begins inside a stretch of days. */
export function monthStarts(from: Day, to: Day): Day[] {
  const starts: Day[] = []
  let [year, month] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))]
  for (;;) {
    const first = `${year}-${String(month).padStart(2, '0')}-01`
    if (first > to) break
    if (first >= from) starts.push(first)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return starts
}

/** At most `limit` items, evenly thinned, always keeping the first. */
export function thin<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) return [...items]
  const step = Math.ceil(items.length / limit)
  return items.filter((_, i) => i % step === 0)
}

/** How many days a bucket covers. */
export function bucketDays(start: Day, unit: BucketUnit): number {
  if (unit === 'day') return 1
  if (unit === 'week') return 7
  const [year, month] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))]
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Every day from the first to the last, both included. */
export function dayRange(from: Day, to: Day): Day[] {
  const days: Day[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

/** How big a mark for a count should be, between 0 and 1: area grows with the count. */
export function areaShare(count: number, max: number): number {
  if (!(count > 0) || !(max > 0)) return 0
  return Math.sqrt(count / max)
}

/** The index of the point nearest to a spot, or null when nothing is within reach. */
export function nearest(points: readonly { x: number; y: number }[], x: number, y: number, options: { axis?: 'x' | 'xy'; reach?: number } = {}): number | null {
  const { axis = 'xy', reach = Infinity } = options
  let best: number | null = null
  let bestDistance = Infinity
  points.forEach((point, i) => {
    const distance = axis === 'x' ? Math.abs(point.x - x) : Math.hypot(point.x - x, point.y - y)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return bestDistance <= reach ? best : null
}
