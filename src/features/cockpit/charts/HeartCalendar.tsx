// The meal calendar: one little heart per day, a column per week, Monday on top.
// Hollow means no meal; the more meals, the bigger and deeper the heart. A long
// stretch scrolls sideways and starts at the newest week.

import { useRef } from 'react'
import type { Day } from '../../../data/types'
import { AXIS_TEXT, CHERRY, HEART, INK, LINE_STRONG, ROSE, ROSE_EDGE, ROSE_INK, tapPoint, useStartAtEnd, useWidth, type Pick } from './base'

/** How a day with this many meals is drawn: the size of the heart and its colours. */
export function heartLook(count: number): { scale: number; fill: string; stroke: string } {
  if (count <= 0) return { scale: 0.6, fill: 'none', stroke: LINE_STRONG }
  if (count === 1) return { scale: 0.78, fill: `color-mix(in srgb, ${ROSE} 55%, var(--color-surface))`, stroke: ROSE_EDGE }
  if (count === 2) return { scale: 0.92, fill: ROSE, stroke: ROSE_INK }
  return { scale: 1.06, fill: CHERRY, stroke: INK }
}

/** One heart, centred on a spot. */
export function HeartMark({ x, y, size, count }: { x: number; y: number; size: number; count: number }) {
  const look = heartLook(count)
  const s = (size * look.scale) / 48
  // The outline keeps its width in pixels, however small the heart is drawn.
  return (
    <path
      d={HEART}
      transform={`translate(${x - 24 * s} ${y - 23.5 * s}) scale(${s})`}
      fill={look.fill}
      stroke={look.stroke}
      strokeWidth={count > 0 ? 1.25 : 1}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  )
}

interface Props {
  label: string
  /** Week columns, oldest first. Null marks a day outside the range. */
  weeks: (Day | null)[][]
  counts: Map<Day, number>
  /** Seven short weekday names, Monday first. */
  weekdays: string[]
  /** The label over a week column when a new month starts there. */
  monthLabel: (day: Day) => string
  pick: Pick
  /** The days in the order the arrow keys walk them. */
  days: Day[]
}

export function HeartCalendar({ label, weeks, counts, weekdays, monthLabel, pick, days }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const scroller = useRef<HTMLDivElement>(null)
  const left = 30
  const top = 20
  const room = Math.max(60, width - left)
  const cell = Math.max(19, Math.min(27, Math.floor(room / Math.max(1, weeks.length))))
  const plotWidth = Math.max(room, cell * weeks.length)
  const scrolls = plotWidth > room + 0.5
  const height = top + cell * 7 + 4
  // A short stretch hugs the right edge, like the newest end of a long one.
  const offset = plotWidth - cell * weeks.length
  const pickedDay = pick.picked !== null ? days[pick.picked] : undefined

  useStartAtEnd(scroller, scrolls, plotWidth)

  // A month gets its name over the first week that starts in it.
  const months: { x: number; text: string }[] = []
  weeks.forEach((week, w) => {
    const first = week.find((day): day is Day => day !== null)
    if (!first) return
    const previous = w > 0 ? weeks[w - 1].find((day): day is Day => day !== null) : undefined
    if (!previous || previous.slice(0, 7) !== first.slice(0, 7)) {
      const x = offset + w * cell
      if (months.length === 0 || x - months[months.length - 1].x > 30) months.push({ x, text: monthLabel(first) })
    }
  })

  const onTap = (x: number, y: number) => {
    const w = Math.floor((x - offset) / cell)
    const d = Math.floor((y - top) / cell)
    const day = weeks[w]?.[d] ?? null
    const index = day ? days.indexOf(day) : -1
    pick.setPicked(index === -1 ? null : index)
  }

  return (
    <div ref={ref} className="relative mx-4">
      <svg width={left} height={height} viewBox={`0 0 ${left} ${height}`} aria-hidden className="absolute left-0 top-0">
        {weekdays.map((name, d) => (
          <text key={d} x={0} y={top + cell * (d + 0.5)} dominantBaseline="central" {...AXIS_TEXT}>
            {name}
          </text>
        ))}
      </svg>
      <div
        key={plotWidth}
        ref={scroller}
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={pick.onKeyDown}
        className="fw-scroll overflow-x-auto rounded-md outline-offset-2"
        style={{ marginLeft: left }}
        data-scrolls={scrolls ? 'true' : undefined}
      >
        <svg width={plotWidth} height={height} viewBox={`0 0 ${plotWidth} ${height}`} aria-hidden className="block cursor-pointer touch-manipulation select-none" onClick={(event) => onTap(...tapPoint(event))}>
          {months.map((month) => (
            <text key={month.x} x={month.x + 2} y={11} {...AXIS_TEXT}>
              {month.text}
            </text>
          ))}
          {weeks.map((week, w) => (
            <g key={w} data-g="pop" style={{ ['--i' as string]: Math.max(0, 16 - (weeks.length - 1 - w)) }}>
              {week.map((day, d) => {
                if (!day) return null
                const x = offset + (w + 0.5) * cell
                const y = top + (d + 0.5) * cell
                return (
                  <g key={day}>
                    {day === pickedDay && <circle cx={x} cy={y} r={cell / 2 - 0.5} fill="none" stroke={INK} strokeWidth="1.5" />}
                    <HeartMark x={x} y={y} size={cell - 3} count={counts.get(day) ?? 0} />
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
