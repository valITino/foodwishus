// A line over time, stitched like embroidery thread. Faint dots behind it can show
// the single values the line averages. Tap anywhere: the nearest stop is picked.

import { useId } from 'react'
import { AXIS_TEXT, INK, INK_SOFT, leanIn, LINE, LINE_STRONG, Plot, ROSE, ROSE_EDGE, ROSE_INK, SURFACE, useWidth, type Pick } from './base'
import { linePath, linear, nearest } from './scale'

export interface LineSeries {
  key: string
  points: { x: number; y: number }[]
  /** stitched: the star of the chart. plain: a second line. context: a faint one behind. */
  look: 'stitched' | 'plain' | 'context'
}

export interface Tick {
  value: number
  label: string
}

interface Props {
  label: string
  height?: number
  xDomain: [number, number]
  yDomain: [number, number]
  xTicks: Tick[]
  yTicks: Tick[]
  series: LineSeries[]
  /** Single values, drawn small and faint behind the lines. */
  dots?: { key: string; x: number; y: number }[]
  /** The x positions a tap can land on. */
  stops?: number[]
  pick?: Pick
  /** Room for the y labels. Emoji need a little more than numbers. */
  left?: number
  yTickSize?: number
}

const LOOKS = {
  stitched: { stroke: ROSE_INK, width: 2.25, dash: '6 5', marker: 3.75 },
  plain: { stroke: ROSE_EDGE, width: 2, dash: undefined, marker: 3 },
  context: { stroke: LINE_STRONG, width: 2, dash: undefined, marker: 0 },
} as const

export function LineChart({ label, height = 170, xDomain, yDomain, xTicks, yTicks, series, dots = [], stops = [], pick, left = 24, yTickSize }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const clip = `reveal-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const top = 10
  const bottom = xTicks.length > 0 ? 24 : 8
  const right = 12
  // A single stop sits in the middle instead of on the left edge.
  const x = linear(xDomain, [left + 8, width - right - 4])
  const y = linear(yDomain, [height - bottom, top])
  const stopXs = stops.map((stop) => ({ x: x(stop), y: 0 }))
  const pickedX = pick && pick.picked !== null ? stops[pick.picked] : undefined

  return (
    <div ref={ref} className="mx-4">
      <Plot
        label={label}
        width={width}
        height={height}
        onKeyDown={pick?.onKeyDown}
        onTap={pick && stops.length > 0 ? (tapX) => pick.setPicked(nearest(stopXs, tapX, 0, { axis: 'x' })) : undefined}
      >
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={left} x2={width - right + 6} y1={y(tick.value)} y2={y(tick.value)} stroke={LINE} strokeWidth="1" />
            <text x={left - 6} y={y(tick.value)} textAnchor="end" dominantBaseline="central" {...AXIS_TEXT} fontSize={yTickSize ?? AXIS_TEXT.fontSize}>
              {tick.label}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick.value} {...leanIn(x(tick.value), tick.label, left, width - right + 6)} y={height - 6} {...AXIS_TEXT}>
            {tick.label}
          </text>
        ))}

        {pickedX !== undefined && <line x1={x(pickedX)} x2={x(pickedX)} y1={top - 4} y2={height - bottom} stroke={INK_SOFT} strokeWidth="1" />}

        <g data-g="fade">
          {dots.map((dot) => (
            <circle key={dot.key} cx={x(dot.x)} cy={y(dot.y)} r="2.25" fill={ROSE} opacity="0.5" />
          ))}
        </g>

        {/* The lines are revealed from the left by a growing window. */}
        <clipPath id={clip}>
          <rect data-g="x" x="0" y="0" width={width} height={height} />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          {series.map((line) => {
            const look = LOOKS[line.look]
            const path = linePath(line.points.map((p) => [x(p.x), y(p.y)] as const))
            return (
              <g key={line.key}>
                {line.look === 'stitched' && <path d={path} fill="none" stroke={ROSE} strokeOpacity="0.4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}
                <path d={path} fill="none" stroke={look.stroke} strokeWidth={look.width} strokeDasharray={look.dash} strokeLinecap="round" strokeLinejoin="round" />
                {look.marker > 0 &&
                  line.points.map((p) => {
                    const on = pickedX === p.x
                    return <circle key={p.x} cx={x(p.x)} cy={y(p.y)} r={on ? look.marker + 2 : look.marker} fill={on ? INK : look.stroke} stroke={SURFACE} strokeWidth="2" />
                  })}
              </g>
            )
          })}
        </g>
      </Plot>
    </div>
  )
}
