import type { ReactNode } from 'react'
import { back } from '../../app/router'
import { usePhotoUrl } from '../../data/hooks'
import type { Dish, ID } from '../../data/types'
import { useT } from '../../i18n'
import { DecoIcon } from '../deco/registry'
import { cx } from './cx'
import { IconButton } from './Overlay'

/** The page background. Set tabs when the bottom navigation is showing, so content clears it. */
export function Screen({ children, tabs = false, className }: { children: ReactNode; tabs?: boolean; className?: string }) {
  return <div className={cx('gingham min-h-dvh bg-ground', tabs ? 'pb-36' : 'pb-10', className)}>{children}</div>
}

interface PageHeaderProps {
  title: string
  /** Where "back" goes when the page was opened directly, for example "/recipes". */
  backTo?: string
  action?: ReactNode
}

/** The header of every page that is not a main tab: back arrow, title, one optional action. */
export function PageHeader({ title, backTo = '/', action }: PageHeaderProps) {
  const t = useT()
  return (
    <header className="sticky top-[var(--banner-h,0px)] z-30 border-b border-line bg-ground">
      <div className="app-column flex min-h-14 items-center gap-1 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="back" label={t.common.back} onClick={() => back(backTo)} />
        <h1 className="min-w-0 flex-1 truncate text-lg">{title}</h1>
        {action}
      </div>
    </header>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

/** Two to four choices side by side, exactly one selected. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border-[1.5px] border-line-strong bg-surface p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'min-h-11 flex-1 rounded-full px-3 text-xs font-extrabold transition-colors duration-150',
            value === option.value ? 'bg-ink text-ground' : 'text-ink-soft',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A photo stored on this phone. Shows a soft placeholder until the picture has arrived. */
export function PhotoImg({ photoId, variant = 'thumb', alt, className }: { photoId: ID | null | undefined; variant?: 'thumb' | 'full'; alt: string; className?: string }) {
  const url = usePhotoUrl(photoId, variant)
  if (!url) return <div role="img" aria-label={alt} className={cx('animate-pulse bg-blush', className)} />
  return <img src={url} alt={alt} className={cx('object-cover', className)} />
}

const PLATE_TONES = ['bg-[#f6d5dc]', 'bg-[#d5dfcb]', 'bg-[#f8ecc0]', 'bg-[#d3e8f2]']

/** A dish's picture: its cover photo, or its illustrated icon on a pastel plate. */
export function DishThumb({ dish, size = 56, className }: { dish: Pick<Dish, 'id' | 'name' | 'coverPhotoId' | 'icon'>; size?: number; className?: string }) {
  const tone = PLATE_TONES[dish.id.charCodeAt(0) % PLATE_TONES.length]
  return (
    <div
      className={cx('shrink-0 overflow-hidden rounded-2xl', !dish.coverPhotoId && tone, className)}
      style={{ width: size, height: size, ['--color-art-outline' as string]: '#4a3833' }}
    >
      {dish.coverPhotoId ? (
        <PhotoImg photoId={dish.coverPhotoId} alt={dish.name} className="size-full" />
      ) : (
        <div className="grid size-full place-items-center">
          <DecoIcon name={dish.icon} size={size * 0.62} />
        </div>
      )}
    </div>
  )
}
