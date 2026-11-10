// A grid of plates: the more meals in a cell, the bigger its plate. Big plates carry
// their number; every cell tells its number when tapped.

import { AXIS_TEXT, INK, LINE_STRONG, Plot, ROSE, ROSE_EDGE, useWidth, type Pick } from './base'
import { areaShare } from './scale'

interface Props {
  label: string
  /** Row names, top to bottom. */
  rows: string[]
  /** Column names, left to right. An empty name leaves the tick out. */
  columns: string[]
  /** counts[row][column] */
  counts: number[][]
  /** Picks walk row by row: index = row * columns + column. */
  pick: Pick
  rowHeight?: number
  /** Print the number on a plate when it is big enough. */
  numbers?: boolean
}

export function BubbleGrid({ label, rows, columns, counts, pick, rowHeight = 34, numbers = true }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const left = Math.min(92, Math.max(...rows.map((row) => row.length)) * 6.8 + 10)
  const bottom = 22
  const top = 4
  const cellWidth = Math.max(8, (width - left) / Math.max(1, columns.length))
  const height = top + rows.length * rowHeight + bottom
  const max = Math.max(1, ...counts.flat())
  const most = Math.max(4, Math.min(cellWidth, rowHeight) / 2 - 1.5)
  const cx = (c: number) => left + cellWidth * (c + 0.5)
  const cy = (r: number) => top + rowHeight * (r + 0.5)
  const pickedRow = pick.picked !== null ? Math.floor(pick.picked / columns.length) : -1
  const pickedColumn = pick.picked !== null ? pick.picked % columns.length : -1

  const onTap = (x: number, y: number) => {
    const c = Math.floor((x - left) / cellWidth)
    const r = Math.floor((y - top) / rowHeight)
    if (c < 0 || c >= columns.length || r < 0 || r >= rows.length) return pick.setPicked(null)
    pick.setPicked(r * columns.length + c)
  }

  return (
    <div ref={ref} className="mx-4">
      <Plot label={label} width={width} height={height} onTap={onTap} onKeyDown={pick.onKeyDown}>
        {rows.map((row, r) => (
          <text key={row} x={0} y={cy(r)} dominantBaseline="central" {...AXIS_TEXT} fill={r === pickedRow ? INK : AXIS_TEXT.fill}>
            {row}
          </text>
        ))}
        {columns.map((column, c) =>
          column ? (
            <text key={c} x={cx(c)} y={height - 6} textAnchor="middle" {...AXIS_TEXT} fill={c === pickedColumn ? INK : AXIS_TEXT.fill}>
              {column}
            </text>
          ) : null,
        )}
        {counts.map((row, r) =>
          row.map((count, c) => {
            const radius = count > 0 ? Math.max(3, areaShare(count, max) * most) : 1.5
            const on = r === pickedRow && c === pickedColumn
            return (
              <g key={`${r}-${c}`}>
                {on && <circle cx={cx(c)} cy={cy(r)} r={Math.max(radius + 3, 8)} fill="none" stroke={INK} strokeWidth="1.5" />}
                {count > 0 ? (
                  <circle data-g="pop" style={{ ['--i' as string]: Math.min(c + r, 20) }} cx={cx(c)} cy={cy(r)} r={radius} fill={ROSE} stroke={ROSE_EDGE} strokeWidth="1.25" />
                ) : (
                  <circle cx={cx(c)} cy={cy(r)} r={radius} fill={LINE_STRONG} />
                )}
                {numbers && count > 0 && radius >= 8.5 && (
                  <text x={cx(c)} y={cy(r) + 0.5} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="800" fill="var(--color-on-rose)">
                    {count}
                  </text>
                )}
              </g>
            )
          }),
        )}
      </Plot>
    </div>
  )
}
