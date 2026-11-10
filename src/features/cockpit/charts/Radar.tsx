// A radar: one spoke per criterion, one shape per dish. At most three shapes, and each
// has its own line style and marker, so they can be told apart without colour.

import { AXIS_TEXT, BLUSH, INK, LINE, LINE_STRONG, Plot, ROSE, ROSE_EDGE, SURFACE, useWidth } from './base'
import { linePath, linear, polar } from './scale'

export interface RadarShape {
  key: string
  /** One value per spoke. Null where nothing was rated: the shape dips to the centre there. */
  values: (number | null)[]
  /** context: a soft area behind. first: rose, round markers. second: ink, dashed, square markers. */
  look: 'context' | 'first' | 'second'
}

interface Props {
  label: string
  spokes: string[]
  shapes: RadarShape[]
  /** The value at the centre and at the rim. */
  domain?: [number, number]
}

const short = (text: string, room: number) => (text.length * 6.6 > room ? `${text.slice(0, Math.max(3, Math.floor(room / 6.6) - 1)).trimEnd()}…` : text)

export function Radar({ label, spokes, shapes, domain = [1, 5] }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const size = Math.min(width, 360)
  const radius = Math.max(60, Math.min(size / 2 - 74, 104))
  const height = radius * 2 + 56
  const cx = width / 2
  const cy = height / 2
  const reach = linear(domain, [0, radius])
  const turn = (i: number) => i / spokes.length
  const rings: number[] = []
  for (let value = domain[0] + 1; value <= domain[1]; value++) rings.push(value)
  const ring = (value: number) => `${linePath(spokes.map((_, i) => polar(cx, cy, reach(value), turn(i))))}Z`
  const order: RadarShape['look'][] = ['context', 'second', 'first']

  return (
    <div ref={ref} className="mx-4">
      <Plot label={label} width={width} height={height}>
        {rings.map((value) => (
          <path key={value} d={ring(value)} fill="none" stroke={value === domain[1] ? LINE_STRONG : LINE} strokeWidth="1" />
        ))}
        {spokes.map((spoke, i) => {
          const [x, y] = polar(cx, cy, radius, turn(i))
          const [lx, ly] = polar(cx, cy, radius + 12, turn(i))
          const side = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end'
          const room = side === 'middle' ? width : side === 'start' ? width - lx : lx
          return (
            <g key={`${spoke}-${i}`}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={LINE} strokeWidth="1" />
              <text x={lx} y={ly} textAnchor={side} dominantBaseline={ly < cy - radius / 2 ? 'auto' : ly > cy + radius / 2 ? 'hanging' : 'central'} {...AXIS_TEXT} fill={INK}>
                {short(spoke, room)}
              </text>
            </g>
          )
        })}
        {/* The scale, written once along the first spoke. */}
        {rings.map((value) => (
          <text key={value} x={cx + 4} y={cy - reach(value) + 1} dominantBaseline="hanging" {...AXIS_TEXT} fontSize={10}>
            {value}
          </text>
        ))}

        {order.flatMap((look) =>
          shapes
            .filter((shape) => shape.look === look)
            .map((shape) => {
              const corners = shape.values.map((value, i) => polar(cx, cy, reach(value ?? domain[0]), turn(i)))
              const path = `${linePath(corners)}Z`
              if (look === 'context') return <path key={shape.key} data-g="pop" d={path} fill={BLUSH} stroke={LINE_STRONG} strokeWidth="1" strokeLinejoin="round" />
              const first = look === 'first'
              return (
                <g key={shape.key} data-g="pop">
                  <path
                    d={path}
                    fill={first ? ROSE : 'none'}
                    fillOpacity={first ? 0.35 : undefined}
                    stroke={first ? ROSE_EDGE : INK}
                    strokeWidth={first ? 2.25 : 1.75}
                    strokeDasharray={first ? undefined : '5 4'}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {corners.map(([x, y], i) =>
                    first ? (
                      <circle key={i} cx={x} cy={y} r="3.5" fill={ROSE_EDGE} stroke={SURFACE} strokeWidth="1.5" />
                    ) : (
                      <rect key={i} x={x - 3.25} y={y - 3.25} width="6.5" height="6.5" rx="1" fill={INK} stroke={SURFACE} strokeWidth="1.5" />
                    ),
                  )}
                </g>
              )
            }),
        )}
      </Plot>
    </div>
  )
}
