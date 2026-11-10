import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useT } from '../../i18n'
import { buzz, cx } from './cx'

const HEART = 'M24 40C10 30 6 22 7 16c1-6 6-9 11-8 3 .5 5 2.5 6 5 1-2.5 3-4.5 6-5 5-1 10 2 11 8 1 6-3 14-17 24Z'

interface Props {
  value: number | null
  onChange?: (value: 1 | 2 | 3 | 4 | 5) => void
  size?: number
  /** Show the playful label for the chosen level underneath. */
  showLabel?: boolean
}

/** Craving score: one to five hearts. Tapping one sends up a little burst. */
export function HeartMeter({ value, onChange, size = 38, showLabel = true }: Props) {
  const t = useT()
  const [burst, setBurst] = useState<{ at: number; key: number } | null>(null)
  const readOnly = !onChange

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div role={readOnly ? 'img' : 'radiogroup'} aria-label={readOnly ? t.craving.heart(value ?? 0) : t.craving.title} className="flex">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value !== null && n <= value
          const heart = (
            <span className="relative grid place-items-center" style={{ width: readOnly ? size + 3 : size + 6, height: readOnly ? size + 3 : Math.max(size + 6, 44) }}>
              <motion.svg
                width={size}
                height={size}
                viewBox="0 0 48 48"
                aria-hidden
                animate={filled && burst?.at === n ? { scale: [1, 1.35, 0.94, 1] } : { scale: 1 }}
                transition={{ duration: 0.38, ease: 'easeOut' }}
              >
                <path
                  d={HEART}
                  fill={filled ? 'var(--color-art-rose)' : 'transparent'}
                  stroke={filled ? 'var(--color-art-outline)' : 'var(--color-line-strong)'}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                />
              </motion.svg>
              <AnimatePresence>
                {burst?.at === n && (
                  <motion.span key={burst.key} className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
                    {[-52, -18, 18, 52].map((angle) => (
                      <motion.svg
                        key={angle}
                        width="12"
                        height="12"
                        viewBox="0 0 48 48"
                        className="absolute left-1/2 top-1/2"
                        initial={{ x: -6, y: -6, scale: 0.4 }}
                        animate={{ x: -6 + Math.sin((angle * Math.PI) / 180) * 26, y: -6 - Math.cos((angle * Math.PI) / 180) * 30, scale: 1 }}
                        transition={{ duration: 0.55, ease: 'easeOut' }}
                      >
                        <path d={HEART} fill="var(--color-cherry)" />
                      </motion.svg>
                    ))}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          )
          if (readOnly) return <span key={n}>{heart}</span>
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${t.craving.heart(n)}: ${t.craving.levels[n - 1]}`}
              className="rounded-full"
              onClick={() => {
                buzz(10)
                setBurst({ at: n, key: Date.now() })
                onChange(n as 1 | 2 | 3 | 4 | 5)
              }}
            >
              {heart}
            </button>
          )
        })}
      </div>
      {showLabel && (
        <p className={cx('pl-1 text-xs font-bold', value ? 'text-rose-ink' : 'text-ink-soft')} aria-live="polite">
          {value ? t.craving.levels[value - 1] : t.craving.hint}
        </p>
      )}
    </div>
  )
}
