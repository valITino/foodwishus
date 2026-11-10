// Ratings over time: the average per day, week or month as a stitched line, with every
// single rating as a faint dot behind it. Each criterion can be added as a small chart
// of its own underneath, drawn against the overall line.

import { useMemo, useState } from 'react'
import type { Day, ID } from '../../../data/types'
import { addDays, diffDays, formatDay } from '../../../lib/dates'
import { ratingsOverTime } from '../../../lib/stats'
import { Chip } from '../../../ui/components'
import { ChartCard, LegendItem, LINE_STRONG, LineKey, Readout, ROSE_EDGE, usePick } from '../charts/base'
import { LineChart, type LineSeries } from '../charts/LineChart'
import { bucketDays, bucketMeans, bucketStart, chooseBucket, jitter, type BucketMean, type BucketUnit } from '../charts/scale'
import { monthName, timeTicks } from '../format'
import { DishLinks, type SectionProps } from '../parts'

const RATING_TICKS = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))

/** A bucket in words: "Saturday 8 November", "Week of 3 Aug", "August 2026". */
export function bucketName(start: Day, unit: BucketUnit, w: SectionProps['w']): string {
  if (unit === 'day') return formatDay(start, w.lang, 'full')
  if (unit === 'week') return w.c.shared.weekOf(formatDay(start, w.lang, 'date-short'))
  return monthName(start.slice(0, 7), w.lang)
}

export function RatingsChart({ kitchen, sel, w }: SectionProps) {
  const c = w.c.ratings
  const [added, setAdded] = useState<ID[]>([])
  const points = useMemo(() => ratingsOverTime(sel.meals), [sel.meals])
  // A switched-off criterion is no longer asked, but its past ratings can still be looked at.
  const criteria = useMemo(() => kitchen.criteria.filter((criterion) => criterion.active || points.some((point) => point.scores[criterion.id] !== undefined)), [kitchen.criteria, points])

  const view = useMemo(() => {
    if (points.length === 0) return null
    const unit = chooseBucket(points[0].day, points[points.length - 1].day)
    const buckets = bucketMeans(points.map((p) => ({ day: p.day, value: p.overall })), unit)
    const origin = buckets[0].start
    const lastStart = buckets[buckets.length - 1].start
    const end = addDays(lastStart, bucketDays(lastStart, unit) - 1)
    // A bucket is drawn in its middle, where its ratings are.
    const at = (start: Day) => diffDays(origin, start) + (bucketDays(start, unit) - 1) / 2
    const line = (means: BucketMean[]) => means.map((bucket) => ({ x: at(bucket.start), y: bucket.mean }))
    return {
      unit,
      buckets,
      origin,
      end,
      at,
      line,
      domain: [0, diffDays(origin, end)] as [number, number],
      overall: line(buckets),
      dots: points.map((p) => ({ key: `${p.servingId}:${p.dishId}`, x: diffDays(origin, p.day) + jitter(`${p.servingId}x`, 0.3), y: p.overall + jitter(`${p.servingId}:${p.dishId}`, 0.13) })),
    }
  }, [points])

  const pick = usePick(view?.buckets.length ?? 0, view)

  if (!view) return <ChartCard id="ratings" title={c.title.week} empty={c.empty} />

  const { unit, buckets } = view
  const stops = view.overall.map((p) => p.x)
  const xTicks = timeTicks(view.origin, view.end, w.lang)
  const picked = pick.picked !== null ? buckets[pick.picked] : null
  const shown = criteria.filter((criterion) => added.includes(criterion.id))

  /** One criterion's mean per bucket. Buckets where it was not rated are left out. */
  const criterionMeans = (id: ID) => bucketMeans(points.flatMap((p) => (typeof p.scores[id] === 'number' ? [{ day: p.day, value: p.scores[id] }] : [])), unit)
  const inPicked = picked ? points.filter((p) => bucketStart(p.day, unit) === picked.start) : []
  const low = Math.min(...buckets.map((b) => b.mean))
  const high = Math.max(...buckets.map((b) => b.mean))
  const summary = `${c.title[unit]}. ${c.summary(bucketName(buckets[0].start, unit, w), bucketName(buckets[buckets.length - 1].start, unit, w), w.f.one(low), w.f.one(high))}`

  return (
    <ChartCard id="ratings" title={c.title[unit]} sub={c.sub(points.length)}>
      <div className="pt-2">
        <LineChart
          label={summary}
          xDomain={view.domain}
          yDomain={[0.6, 5.4]}
          xTicks={xTicks}
          yTicks={RATING_TICKS}
          series={[{ key: 'overall', points: view.overall, look: 'stitched' }]}
          dots={view.dots}
          stops={stops}
          pick={pick}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>
        {picked && (
          <>
            {c.readout(bucketName(picked.start, unit, w), w.f.one(picked.mean), picked.n)}
            {shown.map((criterion) => {
              const mean = criterionMeans(criterion.id).find((bucket) => bucket.start === picked.start)
              return mean ? `, ${criterion.label} ${w.f.one(mean.mean)}` : ''
            })}
          </>
        )}
      </Readout>
      {picked && <DishLinks ids={inPicked.map((p) => p.dishId)} w={w} extra={(id) => inPicked.filter((p) => p.dishId === id).map((p) => p.overall).join(', ')} />}

      {criteria.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="px-4 text-xs font-extrabold">{c.criteria}</p>
          <div role="group" aria-label={c.criteria} className="fw-scroll flex gap-2 overflow-x-auto px-4 pb-3 pt-2">
            {criteria.map((criterion) => (
              <Chip key={criterion.id} selected={added.includes(criterion.id)} onClick={() => setAdded((list) => (list.includes(criterion.id) ? list.filter((id) => id !== criterion.id) : [...list, criterion.id]))}>
                {criterion.label}
              </Chip>
            ))}
          </div>
          {shown.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-1">
              <LegendItem swatch={<LineKey stroke={ROSE_EDGE} />}>{c.criterionKey}</LegendItem>
              <LegendItem swatch={<LineKey stroke={LINE_STRONG} />}>{c.overallKey}</LegendItem>
            </div>
          )}
          {shown.map((criterion) => {
            const means = criterionMeans(criterion.id)
            const total = points.flatMap((p) => (typeof p.scores[criterion.id] === 'number' ? [p.scores[criterion.id]] : []))
            const series: LineSeries[] = [
              { key: 'overall', points: view.overall, look: 'context' },
              { key: criterion.id, points: view.line(means), look: 'plain' },
            ]
            const average = total.length > 0 ? total.reduce((sum, v) => sum + v, 0) / total.length : null
            return (
              <div key={criterion.id} className="pb-2" data-testid="criterion-strip">
                <p className="flex items-baseline justify-between gap-3 px-4 pt-2 text-xs">
                  <span className="font-extrabold">{criterion.label}</span>
                  <span className="text-ink-soft">{average === null ? w.c.criteria.notRated : w.c.shared.fromRatings(w.f.one(average), total.length)}</span>
                </p>
                <LineChart
                  label={`${criterion.label}: ${average === null ? w.c.criteria.notRated : w.c.shared.fromRatings(w.f.one(average), total.length)}`}
                  height={84}
                  xDomain={view.domain}
                  yDomain={[0.6, 5.4]}
                  xTicks={[]}
                  yTicks={[1, 3, 5].map((value) => ({ value, label: String(value) }))}
                  series={series}
                  stops={stops}
                  pick={pick}
                />
              </div>
            )
          })}
        </div>
      )}
    </ChartCard>
  )
}
