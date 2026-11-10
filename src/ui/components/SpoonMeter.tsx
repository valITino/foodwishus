import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { buzz } from './cx'

interface Props {
  label: string
  value: number | null
  onChange?: (value: 1 | 2 | 3 | 4 | 5) => void
  /** A small picture in front of the label, for example the criterion's icon. */
  icon?: ReactNode
}

/** One review criterion, rated with one to five little spoons. */
export function SpoonMeter({ label, value, onChange, icon }: Props) {
  const t = useT()
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
        {icon && <span className="shrink-0 text-ink-soft">{icon}</span>}
        <span className="min-w-0 break-words">{label}</span>
      </span>
      <div role="radiogroup" aria-label={label} className="flex">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value !== null && n <= value
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={t.review.spoon(n)}
              disabled={!onChange}
              className="grid h-11 w-9 place-items-center rounded-full"
              onClick={() => {
                buzz(8)
                onChange?.(n as 1 | 2 | 3 | 4 | 5)
              }}
            >
              <svg width="20" height="32" viewBox="0 0 22 34" aria-hidden>
                <path
                  d="M11 1.5c3.7 0 6.2 3.5 6.2 7.8 0 3.6-1.9 6.3-4.3 7.2l.7 13.3a2.6 2.6 0 0 1-5.2 0l.7-13.3C6.7 15.6 4.8 12.9 4.8 9.3 4.8 5 7.3 1.5 11 1.5Z"
                  fill={filled ? 'var(--color-rose)' : 'transparent'}
                  stroke={filled ? 'var(--color-rose-ink)' : 'var(--color-line-strong)'}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {filled && <path d="M8.2 8c.3-1.8 1.2-3 2.4-3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".7" />}
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}
