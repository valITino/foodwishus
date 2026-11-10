// Small pieces the review screens share. They are built from the design system and
// live here because nothing else needs them yet:
//   BigSpoons     the overall score and the Chef's guess (SpoonMeter is a labelled row)
//   SmallSpoons   a score to read, not to tap
//   FacePicker    ReactionBar plus "hold a face" for the extra reactions
//   ExtrasTray    the six extra reactions, as chips to switch on and off
//   ProofPolaroid a proof photo that can be opened and removed
//   PhotoViewer   the photo, large
//   HeartConfetti hearts and sprinkles for a 5 out of 5

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import type { ExtraReaction, ID, ProofPhoto, Reaction, Score5 } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { buzz, Chip, cx, PhotoImg, Polaroid, ReactionBar, Sheet } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { noTouchMenu } from '../planning/shared'
import { reviewCopy } from './copy'
import { EXTRA_EMOJI, EXTRA_REACTIONS } from './logic'

// ------------------------------------------------------------------- clock --

/** The time right now, refreshed often enough for "23 hours left" to stay true. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, everyMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [everyMs])
  return now
}

// ------------------------------------------------------------------ spoons --

const SPOON = 'M11 1.5c3.7 0 6.2 3.5 6.2 7.8 0 3.6-1.9 6.3-4.3 7.2l.7 13.3a2.6 2.6 0 0 1-5.2 0l.7-13.3C6.7 15.6 4.8 12.9 4.8 9.3 4.8 5 7.3 1.5 11 1.5Z'

function Spoon({ filled, width }: { filled: boolean; width: number }) {
  return (
    <svg width={width} height={(width * 34) / 22} viewBox="0 0 22 34" aria-hidden>
      <path d={SPOON} fill={filled ? 'var(--color-rose)' : 'transparent'} stroke={filled ? 'var(--color-rose-ink)' : 'var(--color-line-strong)'} strokeWidth="2" strokeLinejoin="round" />
      {filled && <path d="M8.2 8c.3-1.8 1.2-3 2.4-3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".7" />}
    </svg>
  )
}

interface BigSpoonsProps {
  label: string
  value: Score5 | null
  /** Tapping the chosen spoon again takes the score back. */
  onChange: (value: Score5 | null) => void
  hint: string
  centred?: boolean
}

/** One score out of five as big spoons, with the words for the chosen level underneath. */
export function BigSpoons({ label, value, onChange, hint, centred = false }: BigSpoonsProps) {
  const t = useT()
  const c = useCopy(reviewCopy)
  return (
    <div className={cx('flex flex-col gap-0.5', centred ? 'items-center' : 'items-start')}>
      <div role="radiogroup" aria-label={label} className="-mx-1 flex">
        {([1, 2, 3, 4, 5] as Score5[]).map((n) => {
          const filled = value !== null && n <= value
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={c.details.spoons(n, t.review.levels[n - 1])}
              className="grid h-14 w-12 place-items-center rounded-full"
              onClick={() => {
                buzz(10)
                onChange(value === n ? null : n)
              }}
            >
              <motion.span className="block" animate={value === n ? { scale: [1, 1.28, 0.94, 1], rotate: [0, -8, 6, 0] } : { scale: 1, rotate: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
                <Spoon filled={filled} width={27} />
              </motion.span>
            </button>
          )
        })}
      </div>
      <p className={cx('text-sm', value ? 'font-extrabold text-rose-ink' : 'font-bold text-ink-soft')} aria-live="polite">
        {value ? t.review.levels[value - 1] : hint}
      </p>
    </div>
  )
}

/** A score to read: five little spoons. */
export function SmallSpoons({ value, className }: { value: number; className?: string }) {
  const t = useT()
  return (
    <span role="img" aria-label={t.review.spoon(value)} className={cx('inline-flex shrink-0 gap-[3px]', className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Spoon key={n} filled={n <= value} width={13} />
      ))}
    </span>
  )
}

// ------------------------------------------------------------------- faces --

const HOLD_MS = 480

interface FacePickerProps {
  value: Reaction | null
  onChange: (value: Reaction) => void
  /** A face was held down: time for the extra reactions. */
  onHold?: (value: Reaction) => void
  labels?: Partial<Record<string, string>>
}

/**
 * The six faces. A tap picks one; holding one down picks it and asks for the extras,
 * the way a long press opens the reactions under a post.
 */
export function FacePicker({ value, onChange, onHold, labels }: FacePickerProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  const cancel = () => {
    clearTimeout(timer.current)
    start.current = null
  }
  useEffect(() => cancel, [])

  function faceUnder(target: EventTarget): Reaction | null {
    const button = (target as HTMLElement).closest?.('[role="radio"]')
    const group = button?.closest('[role="radiogroup"]')
    if (!button || !group) return null
    const index = Array.from(group.querySelectorAll('[role="radio"]')).indexOf(button)
    return index >= 0 && index < 6 ? ((index + 1) as Reaction) : null
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    held.current = false
    const face = onHold ? faceUnder(event.target) : null
    if (face === null) return
    start.current = { x: event.clientX, y: event.clientY }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      held.current = true
      buzz([14, 40, 22])
      onHold?.(face)
    }, HOLD_MS)
  }

  // A finger that wanders is scrolling, not holding.
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancel()
  }

  // The tap that ends a hold must not count as a second tap on the face.
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!held.current) return
    held.current = false
    event.stopPropagation()
    event.preventDefault()
  }

  return (
    <div
      className="touch-manipulation select-none [-webkit-touch-callout:none]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClickCapture={onClickCapture}
      onContextMenu={noTouchMenu}
    >
      <ReactionBar value={value} onChange={onChange} labels={labels} />
    </div>
  )
}

interface ExtrasTrayProps {
  open: boolean
  label: string
  selected: ExtraReaction[]
  onToggle: (extra: ExtraReaction) => void
  labelFor: (extra: ExtraReaction) => string
}

/** The extra one-off reactions. Any number of them can be on. */
export function ExtrasTray({ open, label, selected, onToggle, labelFor }: ExtrasTrayProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="overflow-hidden">
          <div role="group" aria-label={label} data-testid="extras" className="flex flex-wrap justify-center gap-2 px-0.5 pb-3 pt-1">
            {EXTRA_REACTIONS.map((extra) => (
              <Chip
                key={extra}
                selected={selected.includes(extra)}
                className="px-3"
                onClick={() => {
                  buzz(8)
                  onToggle(extra)
                }}
              >
                <span aria-hidden className="text-base leading-none">
                  {EXTRA_EMOJI[extra]}
                </span>
                {labelFor(extra)}
              </Chip>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Extra reactions to read: little labels with their emoji. */
export function ExtraTags({ extras, labelFor, className }: { extras: ExtraReaction[]; labelFor: (extra: ExtraReaction) => string; className?: string }) {
  if (extras.length === 0) return null
  return (
    <ul className={cx('flex flex-wrap gap-1.5', className)}>
      {extras.map((extra) => (
        <li key={extra} className="inline-flex items-center gap-1 rounded-full bg-blush px-2.5 py-1 text-xs font-extrabold">
          <span aria-hidden className="leading-none">
            {EXTRA_EMOJI[extra]}
          </span>
          {labelFor(extra)}
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------------ photos --

interface ProofPolaroidProps {
  photo: ProofPhoto
  alt: string
  caption: string
  /** CSS width of the whole polaroid. */
  width: string
  tilt?: number
  tape?: 'rose' | 'sage' | 'butter' | false
  developing?: boolean
  variant?: 'thumb' | 'full'
  /** A line under the polaroid, for example the course it shows. */
  label?: string
  onOpen?: () => void
  openLabel?: string
  onRemove?: () => void
  removeLabel?: string
  children?: ReactNode
}

/** One proof photo as a polaroid. It can be tapped to look closer and, while allowed, taken down. */
export function ProofPolaroid({ photo, alt, caption, width, tilt = -2, tape = 'rose', developing, variant = 'thumb', label, onOpen, openLabel, onRemove, removeLabel, children }: ProofPolaroidProps) {
  return (
    <div className="relative shrink-0" style={{ width }} data-testid="proof-photo" data-source={photo.source}>
      <Polaroid caption={caption} source={photo.source} tilt={tilt} tape={tape} developing={developing}>
        <PhotoImg photoId={photo.photoId} variant={variant} alt={alt} className="size-full" />
      </Polaroid>
      {onOpen && <button type="button" aria-label={openLabel} className="absolute inset-0 rounded-paper" onClick={onOpen} />}
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove} className="absolute -right-3.5 -top-3.5 z-20 grid size-11 place-items-center rounded-full">
          <span className="grid size-8 place-items-center rounded-full border-2 border-ground bg-ink text-ground">
            <Icon name="close" size={15} />
          </span>
        </button>
      )}
      {children}
      {label && <p className="mt-2.5 line-clamp-2 text-center text-xs font-extrabold leading-tight">{label}</p>}
    </div>
  )
}

export interface ViewedPhoto {
  photoId: ID
  alt: string
  caption?: string
}

/** The photo, large. Pass null to close; the picture stays in place while the sheet slides away. */
export function PhotoViewer({ photo, onClose }: { photo: ViewedPhoto | null; onClose: () => void }) {
  const c = useCopy(reviewCopy)
  const [last, setLast] = useState(photo)
  if (photo && photo !== last) setLast(photo)
  const shown = photo ?? last
  return (
    <Sheet open={photo !== null} onClose={onClose} title={c.proof.viewerTitle}>
      {shown && (
        <div className="rounded-paper bg-[#fffefa] p-2.5 shadow-paper">
          <PhotoImg photoId={shown.photoId} variant="full" alt={shown.alt} className="min-h-48 w-full rounded-[2px]" />
          {shown.caption && <p className="pt-2 text-center font-script text-2xl leading-tight text-[#4a3833]">{shown.caption}</p>}
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------- confetti --

const HEART = 'M24 40C10 30 6 22 7 16c1-6 6-9 11-8 3 .5 5 2.5 6 5 1-2.5 3-4.5 6-5 5-1 10 2 11 8 1 6-3 14-17 24Z'
const CONFETTI_TONES = ['var(--color-art-cherry)', 'var(--color-art-rose)', 'var(--color-art-gold)', 'var(--color-art-blush)', 'var(--color-art-sage)']

/** Hearts and sprinkles bursting out from the middle of their box, once. Nothing at all for people who asked for less motion. */
export function HeartConfetti({ pieces = 26 }: { pieces?: number }) {
  const still = useReducedMotion()
  if (still) return null
  return (
    <span aria-hidden data-testid="confetti" className="pointer-events-none absolute left-1/2 top-1/2 block size-0">
      {Array.from({ length: pieces }, (_, i) => {
        // A steady scatter: every piece gets its own direction, reach and spin.
        const angle = (i / pieces) * Math.PI * 2 + ((i * 37) % 10) / 10
        const reach = 90 + ((i * 53) % 90)
        const x = Math.cos(angle) * reach
        const y = Math.sin(angle) * reach * 0.8 - 40
        const heart = i % 3 !== 2
        const size = heart ? 14 + ((i * 7) % 12) : 9
        const tone = CONFETTI_TONES[i % CONFETTI_TONES.length]
        return (
          <motion.span
            key={i}
            className="absolute left-0 top-0 block"
            initial={{ x: 0, y: 0, scale: 0.2, opacity: 0, rotate: 0 }}
            animate={{ x: [0, x, x * 1.08], y: [0, y, y + 150], scale: [0.2, 1, 0.9], opacity: [0, 1, 0], rotate: [0, (i % 2 ? 1 : -1) * 70, (i % 2 ? 1 : -1) * 160] }}
            transition={{ duration: 1.7 + (i % 5) * 0.12, delay: 0.3 + (i % 6) * 0.03, times: [0, 0.35, 1], ease: 'easeOut' }}
          >
            {heart ? (
              <svg width={size} height={size} viewBox="0 0 48 48" style={{ marginLeft: -size / 2, marginTop: -size / 2 }}>
                <path d={HEART} fill={tone} />
              </svg>
            ) : (
              <span className="block rounded-full" style={{ width: size, height: 4, marginLeft: -size / 2, background: tone }} />
            )}
          </motion.span>
        )
      })}
    </span>
  )
}
