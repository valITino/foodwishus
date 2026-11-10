// Upright bars with rounded tops. When there are more bars than fit, the plot scrolls
// sideways (it starts at the newest end) while the y axis stays where it is.

import { useRef } from 'react'
import { AXIS_TEXT, INK, leanIn, LINE, Plot, ROSE, ROSE_EDGE, ROSE_INK, useStartAtEnd, useWidth, type Pick } from './base'
import type { Tick } from './LineChart'
import { linear } from './scale'

export interface Column {
  key: string
  value: number
  /** Written under the bar. Leave out to keep the axis quiet. */
  tick?: string
  /** Written on top of the bar. */
  cap?: string
}

interface Props {
  label: string
  height?: number
  columns: Column[]
  yTicks: Tick[]
  pick?: Pick
  /** The least room one bar gets. More bars than fit make the plot scroll. */
  minPitch?: number
  /** Size of the labels under the bars: emoji want to be bigger than dates. */
  tickSize?: number
  left?: number
}

/** A bar that is round on top and square where it stands. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`
}

export function Columns({ label, height = 180, columns, yTicks, pick, minPitch = 0, tickSize = 11, left = 34 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const scroller = useRef<HTMLDivElement>(null)
  const top = 18
  const bottom = tickSize > 12 ? 30 : 24
  const right = 6
  const room = Math.max(40, width - left - right)
  const pitch = Math.max(minPitch, room / Math.max(1, columns.length))
  const plotWidth = Math.max(room, pitch * columns.length)
  const scrolls = plotWidth > room + 0.5
  const barWidth = Math.max(2, Math.min(24, pitch - (pitch > 8 ? 4 : 1.5)))
  const yMax = yTicks.at(-1)?.value ?? 1
  const y = linear([0, yMax], [height - bottom, top])
  const centre = (i: number) => pitch * (i + 0.5)

  // The newest bars are on the right: start there.
  useStartAtEnd(scroller, scrolls, plotWidth)

  return (
    <div ref={ref} className="relative mx-4">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="pointer-events-none absolute left-0 top-0">
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={left} x2={width} y1={y(tick.value)} y2={y(tick.value)} stroke={LINE} strokeWidth="1" />
            <text x={left - 6} y={y(tick.value)} textAnchor="end" dominantBaseline="central" {...AXIS_TEXT}>
              {tick.label}
            </text>
          </g>
        ))}
      </svg>
      <div key={plotWidth} ref={scroller} className="fw-scroll relative overflow-x-auto" style={{ marginLeft: left, marginRight: right }} data-scrolls={scrolls ? 'true' : undefined}>
        <Plot
          label={label}
          width={plotWidth}
          height={height}
          onKeyDown={pick?.onKeyDown}
          onTap={pick ? (tapX) => pick.setPicked(Math.max(0, Math.min(columns.length - 1, Math.floor(tapX / pitch)))) : undefined}
        >
          {columns.map((column, i) => {
            const on = pick?.picked === i
            const barHeight = column.value > 0 ? Math.max(2, y(0) - y(column.value)) : 0
            return (
              <g key={column.key}>
                {barHeight > 0 && (
                  <g>
                    <path
                      data-g="y"
                      style={{ ['--i' as string]: Math.min(i, 24) }}
                      d={barPath(centre(i) - barWidth / 2, y(0) - barHeight, barWidth, barHeight)}
                      fill={on ? ROSE_INK : ROSE}
                      stroke={on ? INK : barWidth >= 8 ? ROSE_EDGE : 'none'}
                      strokeWidth="1.25"
                    />
                  </g>
                )}
                {column.cap && (
                  <text x={centre(i)} y={y(0) - barHeight - 5} textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>
                    {column.cap}
                  </text>
                )}
                {column.tick && <text {...leanIn(centre(i), column.tick, 0, plotWidth, tickSize)} y={height - (tickSize > 12 ? 7 : 6)} {...AXIS_TEXT} fontSize={tickSize}>{column.tick}</text>}
              </g>
            )
          })}
        </Plot>
      </div>
    </div>
  )
}
