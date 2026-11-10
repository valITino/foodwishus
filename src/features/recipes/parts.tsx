// Small building blocks shared by the Recipe Book screens. They are made from the
// design system's tokens and follow its components (see "Wants to move to shared").

import { useLayoutEffect, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { Button, cx, IconButton, Sheet } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'

// -------------------------------------------------------------- line icons --

const paths = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  up: <path d="M5.5 14.5 12 8l6.5 6.5" />,
  down: <path d="M5.5 9.5 12 16l6.5-6.5" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />,
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </g>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 4.5-4.5 3 3 2.5-2.5 4 4" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  play: <path d="M8.5 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  reset: <path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4h4" />,
  list: (
    <>
      <path d="M10 7h9.5M10 12h9.5M10 17h9.5" />
      <path d="m4 6.8 1.3 1.3L7.5 5.8M4 11.8l1.3 1.3 2.2-2.3M4 16.8l1.3 1.3 2.2-2.3" />
    </>
  ),
  bell: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2ZM10 20.5a2 2 0 0 0 4 0" />,
  bellOff: <path d="M18 14.5V11a6 6 0 0 0-9.3-5M6.4 8.6A6 6 0 0 0 6 11v5.5l-1.5 2H16M10 20.5a2 2 0 0 0 4 0M4 4l16 16" />,
  sort: <path d="M4 7h16M4 12h11M4 17h6" />,
} as const

export type LineIconName = keyof typeof paths

/** Line icons this feature needs on top of the shared set, drawn the same way. */
export function LineIcon({ name, size = 22, className }: { name: LineIconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name]}
    </svg>
  )
}

interface RoundButtonProps {
  label: string
  onClick?: () => void
  children: ReactNode
  tone?: 'plain' | 'paper'
  disabled?: boolean
  pressed?: boolean
  className?: string
}

/** An icon button like the shared IconButton, for icons that are not in the shared set. */
export function RoundButton({ label, onClick, children, tone = 'plain', disabled, pressed, className }: RoundButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'grid size-11 shrink-0 place-items-center rounded-full text-ink transition-transform duration-100 active:scale-90 disabled:opacity-35',
        tone === 'paper' && 'border-[1.5px] border-line-strong bg-surface',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ fields --

/** How the shared Field looks, without a width, for inputs that sit inside a row. */
export const fieldLook =
  'rounded-field border-[1.5px] border-line-strong bg-surface text-base font-semibold text-ink placeholder:text-ink-soft placeholder:font-medium focus:border-rose-ink focus:outline-none focus:ring-3 focus:ring-rose/40'

/** The same box the shared Field draws, for inputs that need a different frame around them. */
export const fieldBox = `w-full px-4 ${fieldLook}`

interface SearchFieldProps {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  clearLabel: string
  autoFocus?: boolean
}

export function SearchField({ label, placeholder, value, onChange, clearLabel, autoFocus }: SearchFieldProps) {
  return (
    <div className="relative">
      <LineIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(fieldBox, 'min-h-13 pl-12 pr-12 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && <IconButton icon="close" label={clearLabel} onClick={() => onChange('')} className="absolute right-1 top-1/2 -translate-y-1/2" />}
    </div>
  )
}

// ------------------------------------------------------------------ layout --

/** A page that was opened from a scrolled list starts at its top. */
export function useScrollTop(): void {
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])
}

/**
 * Like the shared PageHeader, but the back button asks first (for forms with unsaved
 * changes), and it can carry a second row that stays in view with it.
 */
export function FormHeader({ title, onBack, action, children }: { title: string; onBack: () => void; action?: ReactNode; children?: ReactNode }) {
  const t = useT()
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ground">
      <div className="app-column flex min-h-14 items-center gap-1 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="back" label={t.common.back} onClick={onBack} />
        <h1 className="min-w-0 flex-1 truncate text-lg">{title}</h1>
        {action}
      </div>
      {children}
    </header>
  )
}

/** The bar that keeps a page's main button within reach of the thumb. */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground">
      <div className="app-column flex items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{children}</div>
    </div>
  )
}

/** A titled part of a page. The title is a real heading, so screen readers can jump between parts. */
export function Section({ id, title, aside, children, className }: { id: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx('scroll-mt-32', className)}>
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <h2 id={`${id}-title`} className="text-lg">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** The small unit next to a big figure: "min", "kcal". */
export function Unit({ children }: { children: ReactNode }) {
  return <span className="font-sans text-xs font-bold text-ink-soft">{children}</span>
}

/** Minutes as a figure with small units: "45 min", "1 h 15 min". Goes inside a Stat. */
export function DurationFigure({ minutes }: { minutes: number }) {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return (
    <>
      {hours > 0 && (
        <>
          {hours}
          <Unit>{rest > 0 ? ' h ' : ' h'}</Unit>
        </>
      )}
      {(rest > 0 || hours === 0) && (
        <>
          {rest}
          <Unit> min</Unit>
        </>
      )}
    </>
  )
}

/** A small fact with its icon: total time, calories. */
export function Fact({ icon, children }: { icon: 'clock' | 'flame'; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon name={icon} size={15} />
      {children}
    </span>
  )
}

interface ConfirmSheetProps {
  open: boolean
  title: string
  children: ReactNode
  confirm: string
  onConfirm: () => void
  /** A gentler way out, offered next to the main one. */
  other?: { label: string; onClick: () => void }
  /** Leave out the "Cancel" button when one of the two answers already means "never mind". */
  cancel?: boolean
  onClose: () => void
}

/** A question before something that cannot be taken back. */
export function ConfirmSheet({ open, title, children, confirm, onConfirm, other, cancel = true, onClose }: ConfirmSheetProps) {
  const t = useT()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-col gap-3 pb-1">
          <Button block onClick={onConfirm}>
            {confirm}
          </Button>
          {other && (
            <Button block variant="secondary" onClick={other.onClick}>
              {other.label}
            </Button>
          )}
          {cancel && (
            <Button block variant="quiet" onClick={onClose}>
              {t.actions.cancel}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2 text-sm text-ink-soft">{children}</div>
    </Sheet>
  )
}
