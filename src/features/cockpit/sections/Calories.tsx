// Calories, told plainly: what was eaten per day and per week, the average per meal
// by slot, and rating against calories per serving. No targets, no judging. Meals
// whose calories nobody wrote down are counted as unknown and left out, never as zero.

import { useMemo, useState } from 'react'
import { useT } from '../../../i18n'
import { addDays, diffDays, formatDay } from '../../../lib/dates'
import { calorieCharts, SLOTS, tasteVsCalories } from '../../../lib/stats'
import { Segmented } from '../../../ui/components'
import { BarList } from '../charts/BarList'
import { ChartCard, Readout, TextButton, usePick } from '../charts/base'
import { Columns, type Column } from '../charts/Columns'
import { Scatter } from '../charts/Scatter'
import { dayRange, niceTicks } from '../charts/scale'
import { monthName } from '../format'
import { openDish, type SectionProps } from '../parts'

const FIVE = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))
const NO_BARS: { start: string; kcal: number }[] = []

/** Calories eaten per day or per week, as bars. */
export function CaloriesChart({ sel, w }: SectionProps) {
  const c = w.c.calories
  const [view, setView] = useState<'day' | 'week'>('week')
  const charts = useMemo(() => calorieCharts(sel.meals), [sel.meals])

  const bars = useMemo(() => {
    if (charts.perDay.length === 0) return null
    const byDay = new Map(charts.perDay.map((row) => [row.day, row.kcal]))
    const byWeek = new Map(charts.perWeek.map((row) => [row.weekStart, row.kcal]))
    const first = charts.perDay[0].day
    const last = charts.perDay[charts.perDay.length - 1].day
    // Every day and every week of the stretch gets its place, so gaps stay visible.
    const days = dayRange(first, last).map((day) => ({ start: day, kcal: byDay.get(day) ?? 0 }))
    const weeks: { start: string; kcal: number }[] = []
    for (let monday = charts.perWeek[0].weekStart; monday <= charts.perWeek[charts.perWeek.length - 1].weekStart; monday = addDays(monday, 7)) weeks.push({ start: monday, kcal: byWeek.get(monday) ?? 0 })
    return { day: days, week: weeks }
  }, [charts])

  const rows = bars?.[view] ?? NO_BARS
  const pick = usePick(rows.length, rows)
  const title = view === 'day' ? c.dayTitle : c.weekTitle
  if (!bars) {
    return <ChartCard id="calories" title={c.weekTitle} empty={charts.total.unknown > 0 ? `${c.unknownOnly(charts.total.unknown)} ${c.empty}` : c.empty} />
  }

  const when = (start: string) => (view === 'day' ? formatDay(start, w.lang, 'full') : w.c.shared.weekOf(formatDay(start, w.lang, 'date-short')))
  const top = rows.reduce((best, row) => (row.kcal > best.kcal ? row : best), rows[0])
  // A month is named under the first bar that belongs to it.
  const columns: Column[] = rows.map((row, i) => {
    const newMonth = i === 0 || rows[i - 1].start.slice(0, 7) !== row.start.slice(0, 7)
    const room = i === 0 || diffDays(rows[0].start, row.start) > (view === 'day' ? 6 : 13)
    return { key: row.start, value: row.kcal, tick: newMonth && room ? monthName(row.start.slice(0, 7), w.lang, 'short') : undefined }
  })
  const picked = pick.picked !== null ? rows[pick.picked] : null
  return (
    <ChartCard id="calories" title={title} sub={c.sub(charts.total.known, charts.total.unknown)}>
      <div className="px-4 pt-3">
        <Segmented
          label={c.view}
          value={view}
          onChange={setView}
          options={[
            { value: 'week', label: c.perWeek },
            { value: 'day', label: c.perDay },
          ]}
        />
      </div>
      <div className="pt-3">
        <Columns
          label={`${title}. ${c.summary(w.f.whole(charts.total.kcal), w.f.whole(top.kcal), when(top.start))}`}
          columns={columns}
          yTicks={niceTicks(top.kcal, 4).map((value) => ({ value, label: w.f.whole(value) }))}
          pick={pick}
          minPitch={view === 'day' ? 7 : 14}
          left={40}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>{picked && c.readout(when(picked.start), w.f.whole(picked.kcal))}</Readout>
    </ChartCard>
  )
}

/** Average calories per meal, for each slot of the day. */
export function CaloriesBySlotChart({ sel, w }: SectionProps) {
  const t = useT()
  const c = w.c.calories
  const charts = useMemo(() => calorieCharts(sel.meals), [sel.meals])
  const rows = SLOTS.flatMap((slot) => {
    const mean = charts.perMealBySlot[slot]
    return mean ? [{ slot, mean }] : []
  })
  if (rows.length === 0) return <ChartCard id="calories-slot" title={c.slotTitle} empty={c.empty} />
  return (
    <ChartCard id="calories-slot" title={c.slotTitle}>
      <BarList className="pt-2" tone="butter" rows={rows.map(({ slot, mean }) => ({ key: slot, label: t.slots[slot], value: c.slotRow(w.f.whole(mean.mean), mean.n), amount: mean.mean }))} />
    </ChartCard>
  )
}

/** Rating against calories per serving: one dot per dish. */
export function TasteChart({ sel, w }: SectionProps) {
  const c = w.c.taste
  const rows = useMemo(() => tasteVsCalories(sel.meals), [sel.meals])
  const pick = usePick(rows.length, rows)
  if (rows.length === 0) return <ChartCard id="taste" title={c.title} empty={c.empty} />

  const rated = [...sel.stats.values()].filter((stats) => stats.average !== null).length
  const kcal = rows.map((row) => row.kcalPerServing)
  const ticks = niceTicks(Math.max(...kcal), 4)
  const picked = pick.picked !== null ? rows[pick.picked] : null
  return (
    <ChartCard id="taste" title={c.title} sub={c.sub(rows.length, rated - rows.length)}>
      <div className="pt-3">
        <Scatter
          label={`${c.title}. ${c.summary(rows.length, w.f.whole(Math.min(...kcal)), w.f.whole(Math.max(...kcal)))}`}
          xDomain={[0, ticks[ticks.length - 1] * 1.04]}
          yDomain={[0.5, 5.5]}
          xTicks={ticks.map((value) => ({ value, label: w.f.whole(value) }))}
          yTicks={FIVE}
          xLabel={c.x}
          yLabel={c.y}
          points={rows.map((row) => ({ key: row.dishId, x: row.kcalPerServing, y: row.average.mean }))}
          pick={pick}
        />
      </div>
      <Readout hint={w.c.shared.tapHint} action={picked ? <TextButton onClick={() => openDish(picked.dishId)}>{w.c.shared.seeDish}</TextButton> : undefined}>
        {picked && `${w.dishName(picked.dishId)}: ${c.readout(w.f.whole(picked.kcalPerServing), w.c.shared.fromRatings(w.f.one(picked.average.mean), picked.average.n))}`}
      </Readout>
    </ChartCard>
  )
}
