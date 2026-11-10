// How it tasted, part two: craving against reality, and the reactions.

import { useMemo } from 'react'
import type { Reaction } from '../../../data/types'
import { formatDay } from '../../../lib/dates'
import { cravingVsReality, reactionCounts, reactionTrend } from '../../../lib/stats'
import { REACTION_EMOJI, Stat } from '../../../ui/components'
import { ChartCard, LegendItem, LINE_STRONG, LineKey, Readout, TextButton, usePick } from '../charts/base'
import { Columns } from '../charts/Columns'
import { LineChart } from '../charts/LineChart'
import { Scatter } from '../charts/Scatter'
import { niceTicks, swarm, thin } from '../charts/scale'
import { monthName } from '../format'
import { openDish, type SectionProps } from '../parts'

const FIVE = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))
const REACTIONS: Reaction[] = [1, 2, 3, 4, 5, 6]

/** Craving before against rating after: every meal a dot, crowds as little posies. */
export function CravingChart({ kitchen, sel, w }: SectionProps) {
  const c = w.c.craving
  const result = useMemo(() => cravingVsReality(sel.meals), [sel.meals])
  const points = useMemo(() => swarm(result.points.map((p) => ({ key: p.servingId, x: p.craving, y: p.overall })), 5.4), [result])
  const meals = useMemo(() => new Map(sel.meals.map((meal) => [meal.serving.id, meal])), [sel.meals])
  const pick = usePick(points.length, points)

  if (points.length === 0 || result.accuracy === null) return <ChartCard id="craving" title={c.title} empty={c.empty} />

  const spot = result.points.filter((p) => p.overall === p.craving).length
  const better = result.points.filter((p) => p.overall > p.craving).length
  const worse = result.points.length - spot - better
  const percent = w.f.percent(result.accuracy)
  const picked = pick.picked !== null ? points[pick.picked] : null
  const meal = picked ? meals.get(picked.key) : undefined
  const menu = meal?.serving.menuId ? kitchen.menus.get(meal.serving.menuId) : undefined
  const only = meal && meal.plates.length === 1 ? meal.plates[0].dishId : null
  const name = meal ? (menu?.name ?? w.dishName(meal.plates[0]?.dishId ?? '')) : ''

  return (
    <ChartCard id="craving" title={c.title}>
      <div className="px-4 pt-3" data-testid="craving-accuracy">
        <Stat value={percent} label={c.accuracy} />
        <p className="text-2xs font-bold text-ink-soft">{c.accuracyNote(result.points.length)}</p>
      </div>
      <div className="pt-3">
        <Scatter
          label={`${c.title}. ${c.summary(result.points.length, percent, spot, better, worse)}`}
          xDomain={[0.5, 5.5]}
          yDomain={[0.5, 5.5]}
          xTicks={FIVE}
          yTicks={FIVE}
          xLabel={c.x}
          yLabel={c.y}
          points={points}
          pick={pick}
          radius={3.6}
          grid="both"
          diagonal={{ above: c.better, below: c.worse }}
        />
      </div>
      <div className="px-4">
        <LegendItem swatch={<LineKey stroke={LINE_STRONG} dash="5 5" width={1.5} />}>{c.spotOn}</LegendItem>
      </div>
      <Readout hint={w.c.shared.tapHint} action={only ? <TextButton onClick={() => openDish(only)}>{w.c.shared.seeDish}</TextButton> : undefined}>
        {picked && meal && `${name}, ${formatDay(meal.day, w.lang, 'date-short')}: ${c.readout(picked.x, w.f.loose(picked.y))}`}
      </Readout>
    </ChartCard>
  )
}

/** How often each of the six faces was given. */
export function ReactionCountsChart({ sel, w }: SectionProps) {
  const c = w.c.reactions
  const counts = useMemo(() => reactionCounts(sel.meals), [sel.meals])
  const pick = usePick(6, counts)
  const total = counts.reduce((sum, n) => sum + n, 0)
  if (total === 0) return <ChartCard id="reactions" title={c.title} empty={c.empty} />

  const list = REACTIONS.map((reaction) => c.count(w.reactionName(reaction), counts[reaction - 1]))
  const picked = pick.picked !== null ? ((pick.picked + 1) as Reaction) : null
  return (
    <ChartCard id="reactions" title={c.title} sub={w.c.shared.reactions(total)}>
      <div className="pt-2">
        <Columns
          label={`${c.title}. ${c.summary(list.join(', '))}`}
          height={170}
          columns={REACTIONS.map((reaction) => ({ key: String(reaction), value: counts[reaction - 1], tick: REACTION_EMOJI[reaction], cap: String(counts[reaction - 1]) }))}
          yTicks={niceTicks(Math.max(...counts), 3, true).map((value) => ({ value, label: String(value) }))}
          pick={pick}
          tickSize={18}
          left={26}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>{picked && `${REACTION_EMOJI[picked]} ${c.count(w.reactionName(picked), counts[picked - 1])}`}</Readout>
    </ChartCard>
  )
}

/** The mean reaction per month, from kitchen disaster (1) to super delicious (6). */
export function ReactionTrendChart({ sel, w }: SectionProps) {
  const c = w.c.reactions
  const trend = useMemo(() => reactionTrend(sel.meals), [sel.meals])
  const pick = usePick(trend.length, trend)
  if (trend.length === 0) return <ChartCard id="reaction-trend" title={c.trendTitle} empty={c.empty} />

  const picked = pick.picked !== null ? trend[pick.picked] : null
  const stops = trend.map((_, i) => i)
  const labelled = new Set(thin(stops, 6))
  const summary = `${c.trendTitle}. ${c.summary(trend.map((month) => c.readout(monthName(month.month, w.lang), w.f.one(month.value.mean), month.value.n)).join('. '))}`
  return (
    <ChartCard id="reaction-trend" title={c.trendTitle} sub={c.trendSub}>
      <div className="pt-2">
        <LineChart
          label={summary}
          height={190}
          xDomain={[0, trend.length - 1]}
          yDomain={[0.5, 6.5]}
          xTicks={stops.filter((i) => labelled.has(i)).map((i) => ({ value: i, label: monthName(trend[i].month, w.lang, 'short') }))}
          yTicks={REACTIONS.map((reaction) => ({ value: reaction, label: REACTION_EMOJI[reaction] }))}
          yTickSize={14}
          left={30}
          series={[{ key: 'reaction', points: trend.map((month, i) => ({ x: i, y: month.value.mean })), look: 'stitched' }]}
          stops={stops}
          pick={pick}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>{picked && c.readout(monthName(picked.month, w.lang), w.f.one(picked.value.mean), picked.value.n)}</Readout>
    </ChartCard>
  )
}
