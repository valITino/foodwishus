// A ring cut into slices, biggest first, clockwise from the top. The list next to it
// carries the names and numbers; tapping a slice or a row lights up its partner, so
// nobody has to match colours.

import type { ReactNode } from 'react'
import { cx } from '../../../ui/components'
import { LINE_STRONG, tapPoint, type Pick } from './base'
import { polar, ringSlice } from './scale'

export interface Slice {
  key: string
  label: string
  value: number
  /** Written next to the name: "41, 63%". */
  detail: string
  /** The slice's fill and the colour of text printed on it. */
  fill: string
  onFill: string
}

interface Props {
  label: string
  slices: Slice[]
  pick: Pick
  /** What sits in the hole: usually the total. */
  centre: ReactNode
  size?: number
}

export function Donut({ label, slices, pick, centre, size = 164 }: Props) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const outer = size / 2 - 4
  const inner = outer - 27
  const mid = (outer + inner) / 2
  const c = size / 2
  // The gap between slices is two pixels of paper, whatever the size of the slice.
  const gap = slices.length > 1 ? 2.5 / (2 * Math.PI * mid) : 0
  let start = 0
  const arcs = slices.map((slice) => {
    const share = total > 0 ? slice.value / total : 0
    const from = start
    start += share
    const pad = Math.min(gap / 2, share / 4)
    return { slice, share, from: from + pad, to: from + share - pad, centre: from + share / 2 }
  })

  const onTap = (x: number, y: number) => {
    const distance = Math.hypot(x - c, y - c)
    if (distance > outer + 8 || distance < inner - 8) return pick.setPicked(null)
    const turn = (Math.atan2(y - c, x - c) / (Math.PI * 2) + 1.25) % 1
    const index = arcs.findIndex((arc) => turn >= arc.from - gap && turn <= arc.to + gap)
    pick.setPicked(index === -1 ? null : index === pick.picked ? null : index)
  }

  return (
    <div className="px-3 pb-3 pt-3">
      <div role="img" aria-label={label} className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block cursor-pointer touch-manipulation" onClick={(event) => onTap(...tapPoint(event))}>
          <g data-g="pop">
            {arcs.map(({ slice, share, from, to, centre: at }, i) => {
              const on = pick.picked === i
              const [lx, ly] = polar(c, c, mid, at)
              const [ox, oy] = on ? polar(0, 0, 3, at) : [0, 0]
              return (
                <g key={slice.key} transform={`translate(${ox} ${oy})`} opacity={pick.picked !== null && !on ? 0.45 : 1}>
                  <path d={ringSlice(c, c, outer, inner, from, to)} fill={slice.fill} stroke={LINE_STRONG} strokeWidth="1" strokeLinejoin="round" />
                  {/* The share is printed on the slice when there is room for it. */}
                  {share >= 0.09 && (
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="800" fill={slice.onFill}>
                      {Math.round(share * 100)}%
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{centre}</div>
      </div>

      <ul className="mt-2 grid grid-cols-1 gap-x-1 min-[380px]:grid-cols-2" onKeyDown={pick.onKeyDown}>
        {arcs.map(({ slice }, i) => {
          const on = pick.picked === i
          return (
            <li key={slice.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => pick.setPicked(on ? null : i)}
                className={cx('flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-xs', on && 'bg-blush')}
                data-testid="slice-row"
              >
                <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-line-strong" style={{ background: slice.fill }} />
                <span className="min-w-0 flex-1 truncate font-bold">{slice.label}</span>
                <span className="tabular shrink-0 font-extrabold">{slice.detail}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
