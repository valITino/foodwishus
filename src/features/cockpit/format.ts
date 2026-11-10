// Numbers and dates as the Cockpit writes them, in the app's two languages.
// Switzerland writes 4.2 and 49'290, Britain 4.2 and 49,290: Intl knows both.

import type { Day } from '../../data/types'
import type { Lang } from '../../i18n'
import { diffDays, formatDay } from '../../lib/dates'
import { monthStarts, thin } from './charts/scale'

const locale = (lang: Lang) => (lang === 'de' ? 'de-CH' : 'en-GB')

export interface Formats {
  /** A rating or any other mean, with one decimal: 4.2 */
  one: (value: number) => string
  /** A whole number with thousands separators: 49,290 */
  whole: (value: number) => string
  /** A share between 0 and 1 as a percent: 80% */
  percent: (share: number) => string
  /** A whole number where it is one, otherwise one decimal: 2, 1.5 */
  loose: (value: number) => string
}

const cache = new Map<Lang, Formats>()

export function formats(lang: Lang): Formats {
  const cached = cache.get(lang)
  if (cached) return cached
  const one = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const whole = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 })
  const percent = new Intl.NumberFormat(locale(lang), { style: 'percent', maximumFractionDigits: 0 })
  const made: Formats = {
    one: (value) => one.format(value),
    whole: (value) => whole.format(Math.round(value)),
    percent: (share) => percent.format(share),
    loose: (value) => (Number.isInteger(value) ? whole.format(value) : one.format(value)),
  }
  cache.set(lang, made)
  return made
}

/** The name of a "2026-11" month: "November 2026", or "Nov" when short. */
export function monthName(month: string, lang: Lang, style: 'long' | 'short' = 'long'): string {
  const date = new Date(`${month}-15T12:00:00Z`)
  return new Intl.DateTimeFormat(locale(lang), style === 'long' ? { timeZone: 'UTC', month: 'long', year: 'numeric' } : { timeZone: 'UTC', month: 'short' }).format(date)
}

/** An hour of the day as a clock time: "19:00". */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

export interface TimeTick {
  /** Days after the first day of the axis. */
  value: number
  label: string
}

/**
 * Labels for a time axis that counts days from `from`. A stretch that crosses months
 * names the months where they begin; a shorter one names its first and last day.
 */
export function timeTicks(from: Day, to: Day, lang: Lang, limit = 5): TimeTick[] {
  const months = monthStarts(from, to)
  if (months.length >= 2) return thin(months, limit).map((day) => ({ value: diffDays(from, day), label: monthName(day.slice(0, 7), lang, 'short') }))
  if (from === to) return [{ value: 0, label: formatDay(from, lang, 'date-short') }]
  return [
    { value: 0, label: formatDay(from, lang, 'date-short') },
    { value: diffDays(from, to), label: formatDay(to, lang, 'date-short') },
  ]
}
