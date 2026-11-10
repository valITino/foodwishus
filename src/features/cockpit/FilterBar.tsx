// The filter bar: one filter for every number on the page. It sticks to the top,
// folds away, and shows what is active as chips that can be taken off one by one.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePref } from '../../data/prefs'
import type { Course, Reaction } from '../../data/types'
import { useT } from '../../i18n'
import { formatDay } from '../../lib/dates'
import { Button, Chip, cx, Field, REACTION_EMOJI } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { TextButton } from './charts/base'
import { activeChips, chipKey, inRange, KCAL_BUCKETS, pickRange, RANGE_CHOICES, toggled, withoutChip, type CockpitFilter, type FilterChip } from './filter'
import { resetFilter, setFilter } from './filterStore'
import { PickSheet, SelectButton, Thumb, type PickOption, type SectionProps } from './parts'

function SlidersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </svg>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title}>
      <p className="px-4 text-xs font-extrabold">
        {title}
        {hint && <span className="ml-2 font-bold text-ink-soft">{hint}</span>}
      </p>
      {children}
    </div>
  )
}

/** A row of chips that scrolls sideways instead of wrapping into a wall. */
function ChipRow({ children }: { children: ReactNode }) {
  return <div className="fw-scroll flex gap-2 overflow-x-auto px-4 pb-1 pt-2">{children}</div>
}

/** What a chip says, in the current language. */
export function useChipLabel({ kitchen, w }: Pick<SectionProps, 'kitchen' | 'w'>, filter: CockpitFilter): (chip: FilterChip) => string {
  const t = useT()
  const c = w.c.filter
  return (chip) => {
    switch (chip.kind) {
      case 'range': {
        if (filter.range !== 'custom') return c.ranges[filter.range]
        const from = filter.from ? formatDay(filter.from, w.lang, 'date-short') : null
        const to = filter.to ? formatDay(filter.to, w.lang, 'date-short') : null
        return from && to ? c.customBoth(from, to) : from ? c.customFrom(from) : to ? c.customTo(to) : c.customOpen
      }
      case 'dish':
        return w.dishName(chip.id)
      case 'menu':
        return kitchen.menus.get(chip.id)?.name ?? c.menu
      case 'course':
        return t.courses[chip.course]
      case 'tag':
        return chip.tag
      case 'cook':
        return c.cookedBy(w.memberName(chip.id))
      case 'overall':
        return c.ratingRange(chip.range[0], chip.range[1])
      case 'reaction':
        return `${REACTION_EMOJI[chip.reaction]} ${w.reactionName(chip.reaction)}`
      case 'kcal': {
        const below = KCAL_BUCKETS[chip.range[1]].below
        return c.kcalRange(c.kcalSpan(KCAL_BUCKETS[chip.range[0]].from, below === Infinity ? null : below))
      }
    }
  }
}

export function FilterBar({ kitchen, sel, w }: SectionProps) {
  const t = useT()
  const c = w.c.filter
  const showCalories = usePref('showCalories')
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<'dish' | 'menu' | null>(null)
  const { filter } = sel
  const chips = activeChips(filter, { calories: showCalories })
  const label = useChipLabel({ kitchen, w }, filter)
  const change = (changes: Partial<CockpitFilter>) => setFilter({ ...filter, ...changes })
  const anchor = useRef<HTMLDivElement>(null)

  // Opening the panel brings the bar to the top of the screen, so the whole panel fits
  // underneath it, wherever the page was.
  const toggle = () => {
    if (!open && anchor.current) {
      const banner = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--banner-h')) * 16 || 0
      const top = anchor.current.getBoundingClientRect().top + window.scrollY - banner
      if (window.scrollY < top) window.scrollTo({ top })
    }
    setOpen(!open)
  }

  // The open panel behaves like the sheets: the page behind holds still …
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // … and Escape folds it away (unless a list on top of it is open: Escape closes that first).
  useEffect(() => {
    if (!open || picking !== null) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, picking])

  // What there is to choose from: only things that were actually eaten.
  const choices = useMemo(() => {
    const courses = new Set<Course>()
    const tags = new Map<string, number>()
    const menus = new Set<string>()
    for (const meal of kitchen.all) {
      if (meal.serving.menuId && kitchen.menus.has(meal.serving.menuId)) menus.add(meal.serving.menuId)
      for (const plate of meal.plates) {
        if (!plate.dish) continue
        courses.add(plate.dish.course)
        for (const tag of plate.dish.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1)
      }
    }
    const order: Course[] = ['starter', 'main', 'side', 'dessert', 'breakfast', 'snack', 'drink']
    return {
      courses: order.filter((course) => courses.has(course)),
      tags: [...tags].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag),
      menus: [...menus],
      dishes: [...kitchen.allStats.values()].sort((a, b) => w.dishName(a.dishId).localeCompare(w.dishName(b.dishId), w.lang)),
    }
  }, [kitchen, w])

  const dishOptions: PickOption[] = choices.dishes.map((stats) => ({
    id: stats.dishId,
    label: w.dishName(stats.dishId),
    note: w.c.shared.times(stats.timesEaten),
    lead: <Thumb dish={kitchen.dishes.get(stats.dishId)} id={stats.dishId} />,
  }))
  const menuOptions: PickOption[] = [{ id: '', label: c.anyMenu }, ...choices.menus.map((id) => ({ id, label: kitchen.menus.get(id)?.name ?? c.menu }))]
  const dishValue = filter.dishIds.length === 0 ? c.anyDish : filter.dishIds.length === 1 ? w.dishName(filter.dishIds[0]) : c.dishCount(filter.dishIds.length)

  return (
    <>
      <div ref={anchor} aria-hidden />
      {/* While it is open the panel lies over the tabs, like a sheet: its button sits within thumb reach. */}
      <div className={cx('sticky top-[var(--banner-h,0px)] border-b border-line bg-ground', open ? 'z-50' : 'z-30')} data-testid="filter-bar">
        <div className={cx('app-column flex flex-col', open && 'h-[calc(100dvh-var(--banner-h,0px))]')}>
          <div className="flex min-h-14 shrink-0 items-center gap-2 pl-4 pr-2">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={open ? 'cockpit-filters' : undefined}
              aria-label={chips.length > 0 ? c.buttonActive(chips.length) : c.button}
              onClick={toggle}
              className={cx(
                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-extrabold transition-colors duration-150',
                open ? 'bg-ink text-ground' : 'border-[1.5px] border-line-strong bg-surface text-ink',
              )}
            >
              <SlidersIcon />
              {c.button}
              {chips.length > 0 && (
                <span className={cx('tabular grid min-w-5 place-items-center rounded-full px-1 text-2xs', open ? 'bg-ground text-ink' : 'bg-ink text-ground')} aria-hidden>
                  {chips.length}
                </span>
              )}
            </button>

            <p className="min-w-0 flex-1 truncate text-xs font-bold text-ink-soft" aria-live="polite" data-testid="filter-summary">
              {chips.length === 0 ? c.none : c.matching(sel.meals.length)}
            </p>

            {chips.length > 0 && <TextButton onClick={resetFilter}>{c.reset}</TextButton>}
          </div>

          {/* What is active, each chip removable with one tap. */}
          {chips.length > 0 && (
            <ul className="fw-scroll flex shrink-0 gap-2 overflow-x-auto px-4 pb-2.5" data-testid="filter-chips">
              {chips.map((chip) => (
                <li key={chipKey(chip)} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilter(withoutChip(filter, chip))}
                    aria-label={c.remove(label(chip))}
                    className="inline-flex min-h-11 max-w-64 items-center gap-1.5 rounded-full bg-blush pl-3.5 pr-2.5 text-xs font-bold text-ink"
                    data-testid="filter-chip"
                  >
                    <span className="truncate">{label(chip)}</span>
                    <Icon name="close" size={15} className="shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {open && (
            <div id="cockpit-filters" role="region" aria-label={c.region} className="flex min-h-0 flex-1 flex-col border-t border-line" data-testid="filter-panel">
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pb-4 pt-4" data-testid="filter-groups">
                <Group title={c.when}>
                  <ChipRow>
                    {RANGE_CHOICES.map((range) => (
                      <Chip key={range} selected={filter.range === range} onClick={() => change(range === 'custom' ? { range } : { range, from: null, to: null })}>
                        {c.ranges[range]}
                      </Chip>
                    ))}
                  </ChipRow>
                  {filter.range === 'custom' && (
                    <div className="grid grid-cols-2 gap-3 px-4 pt-2">
                      <Field label={c.from} type="date" value={filter.from ?? ''} max={filter.to ?? kitchen.today} onChange={(e) => change({ from: e.target.value || null })} />
                      <Field label={c.to} type="date" value={filter.to ?? ''} min={filter.from ?? undefined} max={kitchen.today} onChange={(e) => change({ to: e.target.value || null })} />
                    </div>
                  )}
                </Group>

                <div className={cx('grid gap-2 px-4', choices.menus.length > 0 && 'grid-cols-2')}>
                  <SelectButton label={c.dish} value={dishValue} onClick={() => setPicking('dish')} />
                  {choices.menus.length > 0 && <SelectButton label={c.menu} value={filter.menuId ? (kitchen.menus.get(filter.menuId)?.name ?? c.menu) : c.anyMenu} onClick={() => setPicking('menu')} />}
                </div>

                {choices.courses.length > 1 && (
                  <Group title={c.course}>
                    <ChipRow>
                      {choices.courses.map((course) => (
                        <Chip key={course} selected={filter.courses.includes(course)} onClick={() => change({ courses: toggled(filter.courses, course) })}>
                          {t.courses[course]}
                        </Chip>
                      ))}
                    </ChipRow>
                  </Group>
                )}

                {choices.tags.length > 0 && (
                  <Group title={c.tag}>
                    <ChipRow>
                      {choices.tags.map((tag) => (
                        <Chip key={tag} selected={filter.tags.includes(tag)} onClick={() => change({ tags: toggled(filter.tags, tag) })}>
                          {tag}
                        </Chip>
                      ))}
                    </ChipRow>
                  </Group>
                )}

                {kitchen.members.length > 1 && (
                  <Group title={c.cook}>
                    <ChipRow>
                      <Chip selected={filter.cookedBy === null} onClick={() => change({ cookedBy: null })}>
                        {c.anyone}
                      </Chip>
                      {kitchen.members.map((member) => (
                        <Chip key={member.id} selected={filter.cookedBy === member.id} onClick={() => change({ cookedBy: filter.cookedBy === member.id ? null : member.id })}>
                          {member.name}
                        </Chip>
                      ))}
                    </ChipRow>
                  </Group>
                )}

                <Group title={c.rating} hint={c.ratingHint}>
                  <ChipRow>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <Chip key={rating} selected={inRange(filter.overall, rating)} onClick={() => change({ overall: pickRange(filter.overall, rating) })} className="min-w-12 justify-center">
                        <span className="sr-only">{c.rating} </span>
                        {rating}
                      </Chip>
                    ))}
                  </ChipRow>
                </Group>

                <Group title={c.reaction}>
                  <div className="flex justify-between px-3 pt-1">
                    {([1, 2, 3, 4, 5, 6] as Reaction[]).map((reaction) => {
                      const on = filter.reactions.includes(reaction)
                      return (
                        <button
                          key={reaction}
                          type="button"
                          aria-pressed={on}
                          aria-label={w.reactionName(reaction)}
                          onClick={() => change({ reactions: toggled(filter.reactions, reaction) })}
                          className={cx('grid size-12 place-items-center rounded-full text-[1.6rem] leading-none transition-colors duration-150', on ? 'bg-ink' : 'border-[1.5px] border-transparent')}
                        >
                          <span aria-hidden>{REACTION_EMOJI[reaction]}</span>
                        </button>
                      )
                    })}
                  </div>
                </Group>

                {showCalories && (
                  <Group title={c.calories}>
                    <ChipRow>
                      {KCAL_BUCKETS.map((bucket, i) => (
                        <Chip key={bucket.from} selected={inRange(filter.kcal, i)} onClick={() => change({ kcal: pickRange(filter.kcal, i) })}>
                          {c.kcalSpan(bucket.from, bucket.below === Infinity ? null : bucket.below)}
                        </Chip>
                      ))}
                    </ChipRow>
                  </Group>
                )}
              </div>

              {/* The way out stays in view while the choices scroll. */}
              <div className="shrink-0 border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <Button block onClick={() => setOpen(false)} data-testid="filter-done">
                  {c.show(sel.meals.length)}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PickSheet
        open={picking === 'dish'}
        onClose={() => setPicking(null)}
        title={c.pickDishes}
        options={dishOptions}
        value={filter.dishIds}
        multiple
        onChange={(dishIds) => change({ dishIds })}
        searchLabel={c.searchDishes}
        emptyText={c.noDishFound}
      />
      <PickSheet open={picking === 'menu'} onClose={() => setPicking(null)} title={c.pickMenu} options={menuOptions} value={[filter.menuId ?? '']} onChange={([id]) => change({ menuId: id || null })} />
    </>
  )
}
