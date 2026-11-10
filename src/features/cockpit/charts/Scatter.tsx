// Dots (or little faces) on two axes. A tap picks the nearest one, so nobody has to
// hit a dot dead centre with a thumb.

import { AXIS_TEXT, INK, INK_SOFT, LINE, LINE_STRONG, Plot, ROSE, ROSE_EDGE, SURFACE, useWidth, type Pick } from './base'
import type { Tick } from './LineChart'
import { linear, nearest } from './scale'

export interface ScatterPoint {
  key: string
  x: number
  y: number
  /** A nudge in pixels, for points that share a spot. */
  dx?: number
  dy?: number
  /** Drawn instead of a dot. */
  emoji?: string
}

interface Props {
  label: string
  height?: number
  xDomain: [number, number]
  yDomain: [number, number]
  xTicks: Tick[]
  yTicks: Tick[]
  /** What the axes measure, in a few words. */
  xLabel: string
  yLabel: string
  points: ScatterPoint[]
  pick?: Pick
  radius?: number
  /** A stitched line where both axes are equal, with words for the two sides of it. */
  diagonal?: { above: string; below: string }
  /** Vertical guides at the x ticks as well: for scales with only a few steps. */
  grid?: 'both' | 'rows'
}

export function Scatter({ label, height = 230, xDomain, yDomain, xTicks, yTicks, xLabel, yLabel, points, pick, radius = 4.5, diagonal, grid = 'rows' }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const left = 26
  const right = 12
  const top = 22
  const bottom = 40
  const x = linear(xDomain, [left, width - right])
  const y = linear(yDomain, [height - bottom, top])
  const placed = points.map((p) => ({ ...p, px: x(p.x) + (p.dx ?? 0), py: y(p.y) + (p.dy ?? 0) }))
  const spots = placed.map((p) => ({ x: p.px, y: p.py }))
  const picked = pick && pick.picked !== null ? placed[pick.picked] : undefined

  return (
    <div ref={ref} className="mx-4">
      <Plot label={label} width={width} height={height} onKeyDown={pick?.onKeyDown} onTap={pick ? (tapX, tapY) => pick.setPicked(nearest(spots, tapX, tapY)) : undefined}>
        <text x={0} y={10} {...AXIS_TEXT}>
          {yLabel}
        </text>
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={left} x2={width - right} y1={y(tick.value)} y2={y(tick.value)} stroke={LINE} strokeWidth="1" />
            <text x={left - 8} y={y(tick.value)} textAnchor="end" dominantBaseline="central" {...AXIS_TEXT}>
              {tick.label}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={tick.value}>
            {grid === 'both' && <line x1={x(tick.value)} x2={x(tick.value)} y1={top} y2={height - bottom} stroke={LINE} strokeWidth="1" />}
            <text x={x(tick.value)} y={height - bottom + 16} textAnchor="middle" {...AXIS_TEXT}>
              {tick.label}
            </text>
          </g>
        ))}
        <text x={width - right} y={height - 4} textAnchor="end" {...AXIS_TEXT}>
          {xLabel}
        </text>

        {diagonal && (
          <g>
            <line
              x1={x(Math.max(xDomain[0], yDomain[0]))}
              y1={y(Math.max(xDomain[0], yDomain[0]))}
              x2={x(Math.min(xDomain[1], yDomain[1]))}
              y2={y(Math.min(xDomain[1], yDomain[1]))}
              stroke={LINE_STRONG}
              strokeWidth="1.5"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            <text x={left + 6} y={top + 2} dominantBaseline="hanging" {...AXIS_TEXT} fontStyle="italic">
              {diagonal.above}
            </text>
            <text x={width - right - 4} y={height - bottom - 6} textAnchor="end" {...AXIS_TEXT} fontStyle="italic">
              {diagonal.below}
            </text>
          </g>
        )}

        {placed.map((p, i) => (
          // The outer group carries the position, the inner one grows in.
          <g key={p.key} transform={`translate(${p.px} ${p.py})`}>
            <g data-g="pop" style={{ ['--i' as string]: Math.min(i, 30) }}>
              {p.emoji ? (
                <text textAnchor="middle" dominantBaseline="central" fontSize="16">
                  {p.emoji}
                </text>
              ) : (
                <circle r={radius} fill={ROSE} stroke={ROSE_EDGE} strokeWidth="1" />
              )}
            </g>
          </g>
        ))}
        {picked &&
          (picked.emoji ? (
            <circle cx={picked.px} cy={picked.py} r="13" fill="none" stroke={INK} strokeWidth="2" />
          ) : (
            <circle cx={picked.px} cy={picked.py} r={radius + 2.5} fill={INK} stroke={SURFACE} strokeWidth="2" />
          ))}
        {picked && <line x1={picked.px} x2={picked.px} y1={picked.py + (picked.emoji ? 14 : radius + 4)} y2={height - bottom} stroke={INK_SOFT} strokeWidth="1" />}
      </Plot>
    </div>
  )
}
