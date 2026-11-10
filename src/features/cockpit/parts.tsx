// Small pieces the Cockpit's screens share. Built from the design system's tokens and
// components, like the pieces in the other features.

import { useMemo, useState, type ReactNode } from 'react'
import { navigate } from '../../app/router'
import type { Dish, ID } from '../../data/types'
import { useT } from '../../i18n'
import { Button, cx, DishThumb, Field, Sheet } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import type { Kitchen, Selection, Words } from './data'

/** What every part of the Cockpit is handed. */
export interface SectionProps {
  kitchen: Kitchen
  sel: Selection
  w: Words
}

/** The dish in numbers. */
export const openDish = (id: ID): void => navigate(`/cockpit/dish/${id}`)

/** A group of charts gets a real heading, so screen readers can jump between groups. */
export function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`group-${id}`} className="flex flex-col gap-4">
      <h2 id={`group-${id}`} className="px-1 text-xl">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** A dish's picture for lists. A dish that is gone gets a plain plate. */
export function Thumb({ dish, id, size = 40 }: { dish: Dish | undefined; id: ID; size?: number }) {
  return <DishThumb dish={dish ?? { id, name: '', coverPhotoId: null, icon: null }} size={size} className="rounded-xl" />
}

/** Dishes as small buttons that lead to their numbers. A long list is cut short. */
export function DishLinks({ ids, w, extra, limit = 6 }: { ids: ID[]; w: Words; extra?: (id: ID) => string; limit?: number }) {
  const unique = [...new Set(ids)]
  const shown = unique.slice(0, limit)
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-3" data-testid="dish-links">
      {shown.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => openDish(id)}
          aria-label={w.c.shared.openDish(w.dishName(id))}
          className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-line-strong bg-surface px-3 text-xs font-bold"
        >
          <span className="truncate">{w.dishName(id)}</span>
          {extra && <span className="tabular shrink-0 font-extrabold text-ink-soft">{extra(id)}</span>}
        </button>
      ))}
      {unique.length > shown.length && <span className="text-xs font-bold text-ink-soft">+{unique.length - shown.length}</span>}
    </div>
  )
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-ink-soft">
      <path d="M6 9.5 12 15.5 18 9.5" />
    </svg>
  )
}

/** A field that opens a list to choose from: the label on top, the choice underneath. */
export function SelectButton({ label, value, onClick, lead, className }: { label: string; value: string; onClick: () => void; lead?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${label}: ${value}`}
      onClick={onClick}
      className={cx('flex min-h-13 min-w-0 items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-1.5 text-left', className)}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block text-2xs font-extrabold text-ink-soft">{label}</span>
        <span className="block truncate text-sm font-bold">{value}</span>
      </span>
      <Chevron />
    </button>
  )
}

export interface PickOption {
  id: string
  label: string
  /** A smaller second line. */
  note?: string
  lead?: ReactNode
}

interface PickSheetProps {
  open: boolean
  onClose: () => void
  title: string
  options: PickOption[]
  /** The ids that are picked. */
  value: string[]
  /** One choice closes the sheet; several stay open until "Done". */
  multiple?: boolean
  onChange: (value: string[]) => void
  /** Offered above a long list. */
  searchLabel?: string
  emptyText?: string
}

/** A list to choose from, in a bottom sheet. */
export function PickSheet({ open, onClose, title, options, value, multiple = false, onChange, searchLabel, emptyText }: PickSheetProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options
  }, [options, query])
  const close = () => {
    setQuery('')
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      footer={
        multiple ? (
          <Button block variant="secondary" onClick={close}>
            {t.actions.done}
          </Button>
        ) : undefined
      }
    >
      {searchLabel && options.length > 8 && <Field label={searchLabel} type="search" enterKeyHint="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-2" />}
      <div role={multiple ? 'group' : 'radiogroup'} aria-label={title} className="flex flex-col pb-2">
        {found.map((option) => {
          const on = value.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={on}
              onClick={() => {
                if (multiple) onChange(on ? value.filter((id) => id !== option.id) : [...value, option.id])
                else {
                  onChange([option.id])
                  close()
                }
              }}
              className="flex min-h-14 items-center gap-3 border-b border-line py-1.5 text-left last:border-b-0"
            >
              {option.lead}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">{option.label}</span>
                {option.note && <span className="block text-xs text-ink-soft">{option.note}</span>}
              </span>
              <span className={cx('grid size-7 shrink-0 place-items-center rounded-full', on ? 'bg-ink text-ground' : 'border-[1.5px] border-line-strong')} aria-hidden>
                {on && <Icon name="check" size={16} />}
              </span>
            </button>
          )
        })}
        {found.length === 0 && emptyText && <p className="py-4 text-sm text-ink-soft">{emptyText}</p>}
      </div>
    </Sheet>
  )
}
