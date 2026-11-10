// Ranked bars lying on their side, one row each: the name and the number in words,
// the bar underneath. A row can be tapped when it leads somewhere.

import type { ReactNode } from 'react'
import { cx } from '../../../ui/components'

export interface BarRow {
  key: string
  label: string
  /** The number as it is written at the end of the row: "6 times", "938 kcal". */
  value: string
  /** How long the bar is, compared with the longest. */
  amount: number
  /** A picture in front of the row, usually the dish. */
  lead?: ReactNode
  onClick?: () => void
  /** Read out instead of the row's text when the row is a button. */
  actionLabel?: string
}

interface Props {
  rows: BarRow[]
  /** The amount a full-width bar stands for. Defaults to the largest row. */
  max?: number
  /** sage for calm facts (ingredients), rose for everything about dishes. */
  tone?: 'rose' | 'sage' | 'butter'
  className?: string
}

// Candy sticks, like the buttons: a pastel face on a darker edge.
const TONES = {
  rose: 'bg-rose shadow-[0_2px_0_var(--color-rose-edge)]',
  sage: 'bg-sage shadow-[0_2px_0_color-mix(in_srgb,var(--color-sage-ink)_70%,transparent)]',
  butter: 'bg-butter shadow-[0_2px_0_color-mix(in_srgb,var(--color-butter-ink)_70%,transparent)]',
} as const

export function BarList({ rows, max, tone = 'rose', className }: Props) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.amount))
  return (
    <ol className={cx('flex flex-col pb-2', className)}>
      {rows.map((row, i) => {
        const inner = (
          <>
            {row.lead}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-bold">{row.label}</span>
                <span className="tabular shrink-0 text-xs font-extrabold">{row.value}</span>
              </span>
              <span className="mt-1.5 block h-3" aria-hidden>
                <span
                  data-g="x"
                  style={{ width: `${Math.max(3, (row.amount / top) * 100)}%`, ['--i' as string]: i }}
                  className={cx('block h-2.5 rounded-full', TONES[tone])}
                />
              </span>
            </span>
          </>
        )
        return (
          <li key={row.key}>
            {row.onClick ? (
              <button type="button" onClick={row.onClick} aria-label={row.actionLabel} className="flex min-h-13 w-full items-center gap-3 px-4 py-1.5 text-left active:bg-blush/40" data-testid="bar-row">
                {inner}
              </button>
            ) : (
              <div className="flex min-h-11 items-center gap-3 px-4 py-1.5" data-testid="bar-row">
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
