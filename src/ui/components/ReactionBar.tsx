import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useT } from '../../i18n'
import type { Reaction } from '../../data/types'
import { buzz, cx } from './cx'

export const REACTION_EMOJI: Record<Reaction, string> = { 1: '😵', 2: '😬', 3: '😐', 4: '🙂', 5: '😋', 6: '🤤' }

interface Props {
  value: Reaction | null
  onChange?: (value: Reaction) => void
  /** Custom labels from Settings, keyed "1".."6". */
  labels?: Partial<Record<string, string>>
}

/** The fast verdict: six faces from kitchen disaster to super delicious. */
export function ReactionBar({ value, onChange, labels }: Props) {
  const t = useT()
  const [floater, setFloater] = useState<{ n: Reaction; key: number } | null>(null)
  const labelFor = (n: Reaction) => labels?.[String(n)] ?? t.reactions.levels[n - 1]

  return (
    <div>
      <div role="radiogroup" aria-label={t.reactions.title} className="flex justify-between">
        {([1, 2, 3, 4, 5, 6] as Reaction[]).map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={labelFor(n)}
              disabled={!onChange}
              className="relative grid size-13 place-items-center rounded-full"
              onClick={() => {
                buzz([10, 30, 14])
                setFloater({ n, key: Date.now() })
                onChange?.(n)
              }}
            >
              <motion.span
                className={cx('grid size-12 place-items-center rounded-full text-[1.75rem] leading-none', selected && 'bg-blush')}
                animate={selected ? { scale: [1, 1.3, 0.92, 1.12], rotate: [0, -10, 8, 0] } : { scale: 1, rotate: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                style={{ filter: value !== null && !selected ? 'grayscale(0.75) opacity(0.6)' : undefined }}
              >
                {REACTION_EMOJI[n]}
              </motion.span>
              <AnimatePresence>
                {floater?.n === n && (
                  <motion.span
                    key={floater.key}
                    aria-hidden
                    className="pointer-events-none absolute text-xl"
                    initial={{ y: 0, opacity: 0.9, scale: 0.7 }}
                    animate={{ y: -46, opacity: 0, scale: 1.15 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    onAnimationComplete={() => setFloater(null)}
                  >
                    {REACTION_EMOJI[n]}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>
      <p className={cx('mt-1 text-center text-sm font-extrabold', value ? 'text-ink' : 'text-ink-soft font-bold')} aria-live="polite">
        {value ? labelFor(value) : t.reactions.hint}
      </p>
    </div>
  )
}
