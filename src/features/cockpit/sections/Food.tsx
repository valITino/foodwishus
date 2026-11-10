// What we eat: the dishes eaten most often, the mix of courses and tags, the recipes
// in numbers, and recipe time against rating.

import { useMemo, useState } from 'react'
import type { Course } from '../../../data/types'
import { useT } from '../../../i18n'
import { courseMix, effortVsLove, recipeStats, tagMix, timesEatenTop, totalMinutes } from '../../../lib/stats'
import type { Reaction } from '../../../data/types'
import { REACTION_EMOJI, Segmented, Stat } from '../../../ui/components'
import { BarList } from '../charts/BarList'
import { BUTTER, ChartCard, CHERRY, ChartEmpty, INK, INK_SOFT, Readout, TextButton, ROSE, SAGE, SURFACE, usePick } from '../charts/base'
import { Donut, type Slice } from '../charts/Donut'
import { Scatter } from '../charts/Scatter'
import { useCockpitCopy } from '../copy'
import { niceTicks } from '../charts/scale'
import { openDish, Thumb, type SectionProps } from '../parts'

const FIVE = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))

/** Minutes as "45 min" or "1 h 15 min", in the words of the language. */
export function useDuration(): (minutes: number) => string {
  const { duration } = useCockpitCopy().shared
  return (minutes) => {
    const total = Math.max(0, Math.round(minutes))
    return duration(Math.floor(total / 60), total % 60)
  }
}

/** Times eaten per dish: the top ten as bars. Each row leads to the dish in numbers. */
export function TopDishesChart({ kitchen, sel, w }: SectionProps) {
  const c = w.c.top
  const top = useMemo(() => timesEatenTop(sel.stats, 10), [sel.stats])
  if (top.length === 0) return <ChartCard id="top-dishes" title={c.title} empty={c.empty} />
  return (
    <ChartCard id="top-dishes" title={c.title}>
      <BarList
        className="pt-2"
        rows={top.map((stats) => {
          const name = w.dishName(stats.dishId)
          return {
            key: stats.dishId,
            label: name,
            value: w.c.shared.times(stats.timesEaten),
            amount: stats.timesEaten,
            lead: <Thumb dish={kitchen.dishes.get(stats.dishId)} id={stats.dishId} />,
            onClick: () => openDish(stats.dishId),
            actionLabel: `${name}, ${w.c.shared.times(stats.timesEaten)}. ${w.c.shared.openDish(name)}`,
          }
        })}
      />
    </ChartCard>
  )
}

/**
 * Every course keeps its colour, whatever the filter shows. The tokens cannot carry
 * seven colours that everyone can tell apart, so the ring never relies on them: slices
 * are ordered, carry their share, and light up together with their row in the list.
 */
const COURSE_LOOK: Record<Course, { fill: string; onFill: string }> = {
  main: { fill: ROSE, onFill: 'var(--color-on-rose)' },
  breakfast: { fill: BUTTER, onFill: 'var(--color-on-rose)' },
  dessert: { fill: CHERRY, onFill: SURFACE },
  starter: { fill: SAGE, onFill: 'var(--color-on-rose)' },
  side: { fill: 'var(--color-sky)', onFill: 'var(--color-on-rose)' },
  snack: { fill: INK, onFill: SURFACE },
  drink: { fill: INK_SOFT, onFill: SURFACE },
}

/** The mix of courses as a ring, and the tags as ranked bars. */
export function MixChart({ sel, w }: SectionProps) {
  const t = useT()
  const c = w.c.mix
  const [view, setView] = useState<'courses' | 'tags'>('courses')
  const courses = useMemo(() => courseMix(sel.meals), [sel.meals])
  const tags = useMemo(() => tagMix(sel.meals), [sel.meals])
  const pick = usePick(courses.length, courses)
  const plates = courses.reduce((sum, row) => sum + row.count, 0)
  const title = view === 'courses' ? c.courseTitle : c.tagTitle

  if (plates === 0) return <ChartCard id="mix" title={c.courseTitle} empty={c.empty} />

  const slices: Slice[] = courses.map((row) => ({
    key: row.course,
    label: t.courses[row.course],
    value: row.count,
    detail: c.share(row.count, w.f.percent(row.count / plates)),
    ...COURSE_LOOK[row.course],
  }))
  const summary = `${title}. ${(view === 'courses' ? slices.map((slice) => `${slice.label} ${slice.detail}`) : tags.slice(0, 8).map((row) => `${row.tag} ${row.count}`)).join('. ')}.`

  return (
    <ChartCard id="mix" title={title}>
      <div className="px-4 pt-3">
        <Segmented
          label={c.show}
          value={view}
          onChange={setView}
          options={[
            { value: 'courses', label: c.courses },
            { value: 'tags', label: c.tags },
          ]}
        />
      </div>
      {view === 'courses' ? (
        <Donut
          label={summary}
          slices={slices}
          pick={pick}
          centre={
            <span>
              <span className="block font-display text-2xl font-bold leading-none font-soft">{plates}</span>
              <span className="block text-2xs font-bold text-ink-soft">{c.plates(plates)}</span>
            </span>
          }
        />
      ) : tags.length === 0 ? (
        <ChartEmpty>{c.tagEmpty}</ChartEmpty>
      ) : (
        <>
          <p className="sr-only">{summary}</p>
          <BarList className="pt-3" tone="sage" rows={tags.slice(0, 8).map((row) => ({ key: row.tag, label: row.tag, value: w.c.shared.plates(row.count), amount: row.count }))} />
          <p className="px-4 pb-4 text-2xs text-ink-soft">{c.tagNote}</p>
        </>
      )}
    </ChartCard>
  )
}

/** Recipes in numbers: the average time, the recipes cooked most, the ingredients used most. */
export function RecipesChart({ kitchen, sel, w }: SectionProps) {
  const c = w.c.recipes
  const duration = useDuration()
  const stats = useMemo(() => recipeStats(sel.meals, 8), [sel.meals])
  const cooked = useMemo(() => timesEatenTop(sel.stats, 3), [sel.stats])
  if (sel.meals.length === 0) return <ChartCard id="recipes" title={c.title} empty={c.empty} />

  return (
    <ChartCard id="recipes" title={c.title}>
      {stats.averageMinutes && (
        <div className="px-4 pt-3" data-testid="recipe-time">
          <Stat value={duration(stats.averageMinutes.mean)} label={c.time} />
          <p className="text-2xs font-bold text-ink-soft">{c.timeNote(stats.averageMinutes.n)}</p>
        </div>
      )}

      <h4 className="px-4 pt-4 text-xs font-extrabold">{c.cooked}</h4>
      <ol className="pb-1 pt-1">
        {cooked.map((row) => {
          const dish = kitchen.dishes.get(row.dishId)
          const name = w.dishName(row.dishId)
          const minutes = dish ? totalMinutes(dish) : null
          return (
            <li key={row.dishId}>
              <button
                type="button"
                onClick={() => openDish(row.dishId)}
                aria-label={`${name}, ${w.c.shared.times(row.timesEaten)}. ${w.c.shared.openDish(name)}`}
                className="flex min-h-13 w-full items-center gap-3 px-4 py-1.5 text-left active:bg-blush/40"
              >
                <Thumb dish={dish} id={row.dishId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{name}</span>
                  {minutes !== null && <span className="block text-xs text-ink-soft">{duration(minutes)}</span>}
                </span>
                <span className="tabular shrink-0 text-xs font-extrabold">{w.c.shared.times(row.timesEaten)}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <h4 className="border-t border-line px-4 pt-4 text-xs font-extrabold">{c.ingredients}</h4>
      {stats.ingredients.length === 0 ? (
        <p className="px-4 pb-4 pt-2 text-sm text-ink-soft">{c.noIngredients}</p>
      ) : (
        <BarList className="pt-1" tone="sage" rows={stats.ingredients.map((row) => ({ key: row.name, label: row.name, value: c.inPlates(row.count), amount: row.count }))} />
      )}
    </ChartCard>
  )
}

/** Effort against love: recipe time across, rating up, and each dish as its usual face. */
export function EffortChart({ sel, w }: SectionProps) {
  const c = w.c.effort
  const duration = useDuration()
  const rows = useMemo(() => effortVsLove(sel.meals).filter((row) => row.average !== null), [sel.meals])
  const pick = usePick(rows.length, rows)
  if (rows.length === 0) return <ChartCard id="effort" title={c.title} empty={c.empty} />

  const face = (mean: number) => Math.min(6, Math.max(1, Math.round(mean))) as Reaction
  const most = Math.max(...rows.map((row) => row.minutes))
  const ticks = niceTicks(most, 4)
  const picked = pick.picked !== null ? rows[pick.picked] : null
  const minutes = rows.map((row) => row.minutes)
  return (
    <ChartCard id="effort" title={c.title} sub={c.sub}>
      <div className="pt-3">
        <Scatter
          label={`${c.title}. ${c.summary(rows.length, duration(Math.min(...minutes)), duration(most))}`}
          xDomain={[0, ticks[ticks.length - 1] * 1.04]}
          yDomain={[0.5, 5.5]}
          xTicks={ticks.map((value) => ({ value, label: String(value) }))}
          yTicks={FIVE}
          xLabel={c.x}
          yLabel={c.y}
          points={rows.map((row) => ({ key: row.dishId, x: row.minutes, y: row.average?.mean ?? 0, emoji: row.reaction ? REACTION_EMOJI[face(row.reaction.mean)] : undefined }))}
          pick={pick}
        />
      </div>
      <Readout hint={w.c.shared.tapHint} action={picked ? <TextButton onClick={() => openDish(picked.dishId)}>{w.c.shared.seeDish}</TextButton> : undefined}>
        {picked?.average &&
          `${w.dishName(picked.dishId)}: ${c.readout(duration(picked.minutes), w.c.shared.fromRatings(w.f.one(picked.average.mean), picked.average.n), picked.reaction ? w.reactionName(face(picked.reaction.mean)) : null)}`}
      </Readout>
    </ChartCard>
  )
}
