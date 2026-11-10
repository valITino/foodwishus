// When we eat: the calendar of little hearts, meals by weekday and slot, and the hour
// the plate was really empty.

import { useMemo } from 'react'
import type { Day } from '../../../data/types'
import { useT } from '../../../i18n'
import { formatDay, weekOf } from '../../../lib/dates'
import { eatingTimes, mealCalendar, SLOTS } from '../../../lib/stats'
import { BubbleGrid } from '../charts/BubbleGrid'
import { ChartCard, LegendItem, Readout, usePick } from '../charts/base'
import { HeartCalendar, HeartMark } from '../charts/HeartCalendar'
import { calendarWeeks } from '../charts/scale'
import { hourLabel, monthName } from '../format'
import { DishLinks, type SectionProps } from '../parts'

/** Seven weekday names, Monday first, from any week. */
function useWeekdays(w: SectionProps['w'], style: 'weekday' | 'weekday-short'): string[] {
  return useMemo(() => weekOf('2026-11-09').map((day) => formatDay(day, w.lang, style).replace(/\.$/, '')), [w.lang, style])
}

/** Where a number first shows up in a grid: [row, column]. */
function firstCell(counts: number[][], value: number): [number, number] {
  for (let row = 0; row < counts.length; row++) {
    const column = counts[row].indexOf(value)
    if (column !== -1) return [row, column]
  }
  return [0, 0]
}

/** The meal calendar: a heart for every day of the range. */
export function CalendarChart({ kitchen, sel, w }: SectionProps) {
  const c = w.c.calendar
  const weekdays = useWeekdays(w, 'weekday-short')
  const counts = useMemo(() => mealCalendar(sel.meals), [sel.meals])

  const view = useMemo(() => {
    if (sel.meals.length === 0 || kitchen.all.length === 0) return null
    // The calendar covers the filter's range, but never days before the first meal ever
    // (the kitchen did not exist yet) or days that have not happened.
    const { from, to } = sel.statsFilter
    const opened = kitchen.all[0].day
    const first = from ? (from > opened ? from : opened) : sel.meals[0].day
    const last = to && to < kitchen.today ? to : kitchen.today
    if (first > last) return null
    const weeks = calendarWeeks(first, last)
    return { weeks, days: weeks.flat().filter((day): day is Day => day !== null) }
  }, [sel, kitchen])

  const pick = usePick(view?.days.length ?? 0, view)
  if (!view) return <ChartCard id="calendar" title={c.title} empty={c.empty} />

  const withMeal = view.days.filter((day) => (counts.get(day) ?? 0) > 0).length
  const max = Math.max(0, ...view.days.map((day) => counts.get(day) ?? 0))
  const busiest = view.days.find((day) => (counts.get(day) ?? 0) === max) ?? view.days[0]
  const pickedDay = pick.picked !== null ? view.days[pick.picked] : null
  const onDay = pickedDay ? sel.meals.filter((meal) => meal.day === pickedDay) : []

  return (
    <ChartCard id="calendar" title={c.title}>
      <div className="pt-3">
        <HeartCalendar
          label={`${c.title}. ${c.summary(withMeal, view.days.length, formatDay(busiest, w.lang, 'full'), max)}`}
          weeks={view.weeks}
          counts={counts}
          weekdays={weekdays}
          monthLabel={(day) => monthName(day.slice(0, 7), w.lang, 'short')}
          pick={pick}
          days={view.days}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2">
        <span className="text-2xs font-bold text-ink-soft">{c.legend}</span>
        {[0, 1, 2, 3].map((count) => (
          <LegendItem
            key={count}
            swatch={
              <svg width="18" height="18" viewBox="0 0 18 18">
                <HeartMark x={9} y={9} size={17} count={count} />
              </svg>
            }
          >
            {count === 3 ? '3+' : count}
          </LegendItem>
        ))}
      </div>
      <Readout hint={w.c.shared.tapHint}>{pickedDay && c.readout(formatDay(pickedDay, w.lang, 'full'), counts.get(pickedDay) ?? 0)}</Readout>
      {pickedDay && <DishLinks ids={onDay.flatMap((meal) => meal.plates.map((plate) => plate.dishId))} w={w} />}
    </ChartCard>
  )
}

/** When we eat: how many meals each weekday had in each slot. */
export function SlotsChart({ sel, w }: SectionProps) {
  const t = useT()
  const c = w.c.slots
  const short = useWeekdays(w, 'weekday-short')
  const long = useWeekdays(w, 'weekday')
  const times = useMemo(() => eatingTimes(sel.meals), [sel.meals])
  // Rows are slots, columns are weekdays.
  const counts = useMemo(() => SLOTS.map((_, s) => times.byWeekdayAndSlot.map((day) => day[s])), [times])
  const pick = usePick(SLOTS.length * 7, counts)
  const max = Math.max(...counts.flat())
  if (max === 0) return <ChartCard id="slots" title={c.title} empty={c.empty} />

  const [topSlot, topDay] = firstCell(counts, max)
  const row = pick.picked !== null ? Math.floor(pick.picked / 7) : null
  const column = pick.picked !== null ? pick.picked % 7 : null
  return (
    <ChartCard id="slots" title={c.title}>
      <div className="pt-3">
        <BubbleGrid
          label={`${c.title}. ${c.summary(long[topDay], t.slots[SLOTS[topSlot]], max)}`}
          rows={SLOTS.map((slot) => w.c.shared.slotShort[slot])}
          columns={short}
          counts={counts}
          pick={pick}
          rowHeight={40}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>{row !== null && column !== null && c.readout(long[column], t.slots[SLOTS[row]], counts[row][column])}</Readout>
    </ChartCard>
  )
}

/** The hours worth showing: from the earliest to the latest meal, with a little air. */
function hourWindow(hours: number[]): number[] {
  const from = Math.max(0, Math.min(...hours) - 1)
  const to = Math.min(23, Math.max(...hours) + 1)
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

const hourTick = (hour: number, every: number) => (hour % every === 0 ? String(hour) : '')

/** When we actually eat: weekday by hour, from the moment each meal was eaten. */
export function HoursChart({ sel, w }: SectionProps) {
  const c = w.c.hours
  const short = useWeekdays(w, 'weekday-short')
  const long = useWeekdays(w, 'weekday')
  const times = useMemo(() => eatingTimes(sel.meals), [sel.meals])
  const view = useMemo(() => {
    const eaten = times.byWeekdayAndHour.flatMap((day) => day.flatMap((count, hour) => (count > 0 ? [hour] : [])))
    if (eaten.length === 0) return null
    const hours = hourWindow(eaten)
    return { hours, counts: times.byWeekdayAndHour.map((day) => hours.map((hour) => day[hour])) }
  }, [times])
  const pick = usePick(view ? 7 * view.hours.length : 0, view)
  if (!view) return <ChartCard id="hours" title={c.title} empty={c.empty} />

  const { hours, counts } = view
  const max = Math.max(...counts.flat())
  const top = firstCell(counts, max)
  const row = pick.picked !== null ? Math.floor(pick.picked / hours.length) : null
  const column = pick.picked !== null ? pick.picked % hours.length : null
  const span = (hour: number) => w.c.shared.hourSpan(hourLabel(hour), hourLabel((hour + 1) % 24))
  return (
    <ChartCard id="hours" title={c.title} sub={c.sub}>
      <div className="pt-3">
        <BubbleGrid
          label={`${c.title}. ${c.summary(long[top[0]], hourLabel(hours[top[1]]), max)}`}
          rows={short}
          columns={hours.map((hour) => hourTick(hour, hours.length > 12 ? 3 : 2))}
          counts={counts}
          pick={pick}
          rowHeight={26}
          numbers={false}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>{row !== null && column !== null && c.readout(long[row], span(hours[column]), counts[row][column])}</Readout>
    </ChartCard>
  )
}

/** Planned slot against the hour it was really eaten. */
export function PlannedHoursChart({ sel, w }: SectionProps) {
  const t = useT()
  const c = w.c.hours
  const times = useMemo(() => eatingTimes(sel.meals), [sel.meals])
  const view = useMemo(() => {
    if (times.plannedVsActual.length === 0) return null
    const hours = hourWindow(times.plannedVsActual.map((meal) => meal.hour))
    const slots = SLOTS.filter((slot) => times.plannedVsActual.some((meal) => meal.slot === slot))
    const counts = slots.map((slot) => hours.map((hour) => times.plannedVsActual.filter((meal) => meal.slot === slot && meal.hour === hour).length))
    return { hours, slots, counts }
  }, [times])
  const pick = usePick(view ? view.slots.length * view.hours.length : 0, view)
  if (!view) return <ChartCard id="planned-hours" title={c.slotTitle} empty={c.empty} />

  const { hours, slots, counts } = view
  const row = pick.picked !== null ? Math.floor(pick.picked / hours.length) : null
  const column = pick.picked !== null ? pick.picked % hours.length : null
  const span = (hour: number) => w.c.shared.hourSpan(hourLabel(hour), hourLabel((hour + 1) % 24))
  // For screen readers: the hour each slot is eaten at most often.
  const usual = slots.map((slot, s) => {
    const most = Math.max(...counts[s])
    return c.summary(t.slots[slot], hourLabel(hours[counts[s].indexOf(most)]), most)
  })
  return (
    <ChartCard id="planned-hours" title={c.slotTitle} sub={c.sub}>
      <div className="pt-3">
        <BubbleGrid
          label={`${c.slotTitle}. ${usual.join(' ')}`}
          rows={slots.map((slot) => w.c.shared.slotShort[slot])}
          columns={hours.map((hour) => hourTick(hour, hours.length > 12 ? 3 : 2))}
          counts={counts}
          pick={pick}
          rowHeight={32}
          numbers={false}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>{row !== null && column !== null && c.readout(t.slots[slots[row]], span(hours[column]), counts[row][column])}</Readout>
    </ChartCard>
  )
}
