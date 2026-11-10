// Wall-clock times in the kitchen's time zone. dates.ts turns a moment into a Zurich
// day; the demo needs the other direction: "that Saturday at 19:40 in Zurich".

import { ZONE } from '../../lib/dates'
import type { Day, ISO } from '../types'

const wallFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** How far Zurich's clock is ahead of UTC at that moment, in milliseconds. */
function offsetAt(utcMs: number): number {
  const part: Record<string, number> = {}
  for (const { type, value } of wallFormat.formatToParts(new Date(utcMs))) part[type] = Number(value)
  const wall = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second)
  return wall - Math.floor(utcMs / 1000) * 1000
}

/** The moment when clocks in Zurich show the given day and time. Seconds may be fractional minutes. */
export function zurichMoment(day: Day, minutesAfterMidnight: number): Date {
  const wall = Date.parse(`${day}T00:00:00Z`) + Math.round(minutesAfterMidnight * 60) * 1000
  // Two rounds, so the answer is right on both sides of a daylight-saving change.
  let utc = wall - offsetAt(wall)
  utc = wall - offsetAt(utc)
  return new Date(utc)
}

export function zurichIso(day: Day, minutesAfterMidnight: number): ISO {
  return zurichMoment(day, minutesAfterMidnight).toISOString()
}

/** Minutes after midnight on the Zurich clock. */
export function zurichMinutes(moment: Date | ISO): number {
  const date = typeof moment === 'string' ? new Date(moment) : moment
  const part: Record<string, number> = {}
  for (const { type, value } of wallFormat.formatToParts(date)) part[type] = Number(value)
  return part.hour * 60 + part.minute + part.second / 60
}

export const hm = (hours: number, minutes = 0): number => hours * 60 + minutes
