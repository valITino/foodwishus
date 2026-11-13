// Pieces the planning screens share: the kitchen as one object, what a serving shows,
// day words, and a few small controls that do not exist in the design system yet.

import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { useMe } from '../../data/hooks'
import { useDishes, useMembers, useMenus, usePartner, useServings } from '../../data/queries'
import type { Day, Dish, ID, Member, Menu, Serving, Slot } from '../../data/types'
import { useCopy, useLang, useT, type Lang } from '../../i18n'
import { diffDays, formatDay, today } from '../../lib/dates'
import { Chip, cx, DishThumb, Field } from '../../ui/components'
import { Heart } from '../../ui/deco/Deco'
import { planningCopy } from './copy'
import { daysBeyond, linkedDay, nextDays, pastDay, pastDays, SLOTS, STRIP_DAYS, tapDay } from './logic'

// ----------------------------------------------------------------- kitchen --

export interface Kitchen {
  meId: ID
  me: Member | undefined
  partner: Member | null
  members: Member[]
  /** Every serving that is not deleted, in wishlist order. */
  servings: Serving[]
  dishes: Map<ID, Dish>
  menus: Map<ID, Menu>
  today: Day
}

/** Today in Zurich. Rolls over by itself when the app stays open past midnight. */
export function useToday(): Day {
  const [day, setDay] = useState(today)
  useEffect(() => {
    const check = () => setDay(today())
    const timer = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return day
}

/** Everything the planning screens read, or undefined while the phone is still loading it. */
export function useKitchen(): Kitchen | undefined {
  const me = useMe()
  const members = useMembers()
  const partner = usePartner()
  const servings = useServings()
  // Archived dishes stay readable: a meal on the wishlist may still point at one.
  const dishes = useDishes({ includeArchived: true })
  const menus = useMenus({ includeArchived: true })
  const todayDay = useToday()

  return useMemo(() => {
    if (!me || !members || partner === undefined || !servings || !dishes || !menus) return undefined
    return {
      meId: me.memberId,
      me: members.find((m) => m.id === me.memberId) ?? me.member,
      partner,
      members,
      servings,
      dishes: new Map(dishes.map((d) => [d.id, d])),
      menus: new Map(menus.map((m) => [m.id, m])),
      today: todayDay,
    }
  }, [me, members, partner, servings, dishes, menus, todayDay])
}

export function nameOf(kitchen: Pick<Kitchen, 'members'>, memberId: ID | null): string {
  return kitchen.members.find((m) => m.id === memberId)?.name ?? ''
}

// ------------------------------------------------------------ meal details --

export interface MealInfo {
  name: string
  kind: 'dish' | 'menu' | 'gone'
  /** The dish itself, or the first course of a menu: the picture comes from here. */
  dish: Dish | null
  menu: Menu | null
  /** A menu's dishes in serving order. Empty for a single dish. */
  courses: Dish[]
  /** Where the recipe or the menu lives, when it still exists. */
  link: string | null
}

export function mealInfo(serving: Pick<Serving, 'dishId' | 'menuId'>, kitchen: Pick<Kitchen, 'dishes' | 'menus'>, goneName: string): MealInfo {
  const menu = serving.menuId ? kitchen.menus.get(serving.menuId) : undefined
  if (menu) {
    const courses = [...menu.courses]
      .sort((a, b) => a.order - b.order)
      .map((course) => kitchen.dishes.get(course.dishId))
      .filter((dish): dish is Dish => Boolean(dish))
    return { name: menu.name, kind: 'menu', dish: courses[0] ?? null, menu, courses, link: `/menus/${menu.id}` }
  }
  const dish = serving.dishId ? kitchen.dishes.get(serving.dishId) : undefined
  if (dish) return { name: dish.name, kind: 'dish', dish, menu: null, courses: [], link: `/recipes/${dish.id}` }
  return { name: goneName, kind: 'gone', dish: null, menu: null, courses: [], link: null }
}

/** Hook form of mealInfo, with the fallback name in the right language. */
export function useMealInfo(): (serving: Pick<Serving, 'dishId' | 'menuId'>, kitchen: Pick<Kitchen, 'dishes' | 'menus'>) => MealInfo {
  const gone = useCopy(planningCopy).shared.goneDish
  return (serving, kitchen) => mealInfo(serving, kitchen, gone)
}

/** The picture of a meal. A menu shows its first course with a second plate peeking out. */
export function MealThumb({ info, seed, size = 56, className }: { info: MealInfo; seed: ID; size?: number; className?: string }) {
  const dish = info.dish ?? { id: info.menu?.id ?? seed, name: info.name, coverPhotoId: null, icon: info.kind === 'menu' ? 'flower' : null }
  if (info.kind !== 'menu') return <DishThumb dish={dish} size={size} className={className} />
  return (
    <span className={cx('relative block shrink-0', className)} style={{ width: size, height: size }}>
      <span aria-hidden className="absolute inset-0 translate-x-[3px] rotate-6 rounded-2xl border border-line bg-blush" />
      <DishThumb dish={dish} size={size} className="relative" />
    </span>
  )
}

// --------------------------------------------------------------- day words --

interface DayLabels {
  today: string
  tomorrow: string
  yesterday: string
}

/**
 * A day in words. "short" keeps it brief for tags and toasts ("Thursday", "19 Nov"),
 * "long" always names the date once it is more than a day away ("Thursday 19 November").
 */
export function dayWords(day: Day, todayDay: Day, lang: Lang, labels: DayLabels, style: 'short' | 'long' = 'short'): string {
  const delta = diffDays(todayDay, day)
  if (delta === 0) return labels.today
  if (delta === 1) return labels.tomorrow
  if (delta === -1) return labels.yesterday
  if (style === 'long') return formatDay(day, lang, 'full')
  return delta > 1 && delta < 7 ? formatDay(day, lang, 'weekday') : formatDay(day, lang, 'date-short')
}

/** Day and slot words in the current language. */
export function useWhen(todayDay: Day) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(planningCopy).shared
  return useMemo(() => {
    const start = { today: t.common.today, tomorrow: t.common.tomorrow, yesterday: t.common.yesterday }
    return {
      /** For the start of a line: "Tomorrow", "Thursday". */
      day: (day: Day, style: 'short' | 'long' = 'short') => dayWords(day, todayDay, lang, start, style),
      /** For the middle of a sentence: "tomorrow", "Thursday". */
      dayInline: (day: Day, style: 'short' | 'long' = 'short') => dayWords(day, todayDay, lang, c.dayInline, style),
      /** "Thursday, dinner" */
      at: (day: Day, slot: Slot | null, style: 'short' | 'long' = 'short') => {
        const words = dayWords(day, todayDay, lang, start, style)
        return slot ? c.when(words, c.slotInline[slot]) : words
      },
      /** "thursday, dinner" for sentences: "Planned for tomorrow, dinner". */
      atInline: (day: Day, slot: Slot | null, style: 'short' | 'long' = 'short') => {
        const words = dayWords(day, todayDay, lang, c.dayInline, style)
        return slot ? c.when(words, c.slotInline[slot]) : words
      },
    }
  }, [t, lang, c, todayDay])
}

// ---------------------------------------------------------------- controls --

/** Six dots: "grab me". Missing from the shared icon set. */
export function GripIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {[6.5, 12, 17.5].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />))}
    </svg>
  )
}

/**
 * A quiet action that lines up with the text around it. (The design system's quiet
 * Button keeps its pill padding, which pushes a left-aligned link out of line.)
 */
export function TextAction({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex min-h-11 items-center rounded-md text-left text-sm font-extrabold text-rose-ink underline decoration-transparent decoration-2 underline-offset-4 active:decoration-current disabled:opacity-45',
        className,
      )}
      {...rest}
    />
  )
}

/** A note written by hand for the other person, in its embroidered box. */
export function NoteBox({ label, note, className }: { label: string; note: string; className?: string }) {
  return (
    <div className={cx('rounded-card bg-blush px-5 py-4 stitched', className)}>
      <p className="text-2xs font-extrabold text-ink-soft">{label}</p>
      <p className="mt-0.5 break-words font-script text-[1.6rem] leading-tight text-rose-ink">{note}</p>
    </div>
  )
}

interface DayStripProps {
  label: string
  days: Day[]
  selected: Day[]
  onToggle: (day: Day) => void
  today: Day
  /** Days that carry a little heart, for example the days somebody suggested. */
  marked?: Day[]
  markLabel?: string
}

/** A row of days to tap, scrolling sideways when they do not fit. */
export function DayStrip({ label, days, selected, onToggle, today: todayDay, marked = [], markLabel }: DayStripProps) {
  const t = useT()
  const lang = useLang()
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-2">
      {days.map((day) => {
        const on = selected.includes(day)
        const mark = marked.includes(day)
        return (
          <button
            key={day}
            type="button"
            data-day={day}
            aria-pressed={on}
            aria-label={`${formatDay(day, lang, 'full')}${mark && markLabel ? `, ${markLabel}` : ''}`}
            onClick={() => onToggle(day)}
            className={cx(
              'relative flex min-h-15 w-13 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-150',
              on ? 'bg-ink text-ground' : 'border-[1.5px] border-line-strong bg-surface text-ink',
            )}
          >
            <span className={cx('text-2xs font-extrabold leading-none', !on && 'text-ink-soft')}>{day === todayDay ? t.common.today : formatDay(day, lang, 'weekday-short')}</span>
            <span className="font-display text-lg font-bold leading-none font-soft tabular">{Number(day.slice(8))}</span>
            {mark && <Heart size={18} className="absolute -right-1.5 -top-2" />}
          </button>
        )
      })}
    </div>
  )
}

interface DayChoiceProps {
  label: string
  /** The label of the date field for any day after the ones to tap. */
  laterLabel: string
  today: Day
  chosen: Day[]
  onChange: (days: Day[]) => void
  /** Several days are welcome (good days for a wish). Without it exactly one is wanted (the day a meal is planned for). */
  many?: boolean
  /** Days that carry a little heart, for example the days somebody suggested. */
  marked?: Day[]
  markLabel?: string
  /** A line under the days to tap, for example who suggested the marked ones. */
  note?: ReactNode
}

/**
 * Any day from today on: the next two weeks to tap, and a date field for every day
 * after them. Later days that are chosen or marked show as chips between the two, so
 * nothing that was picked is out of sight.
 */
export function DayChoice({ label, laterLabel, today: todayDay, chosen, onChange, many = false, marked = [], markLabel, note }: DayChoiceProps) {
  const lang = useLang()
  const c = useCopy(planningCopy).shared
  const strip = nextDays(todayDay, STRIP_DAYS)
  const later = daysBeyond(many ? [...chosen, ...marked] : marked, strip)
  const tap = (day: Day) => onChange(tapDay(chosen, day, many))
  const year = todayDay.slice(0, 4)
  const words = (day: Day) => (day.startsWith(year) ? formatDay(day, lang, 'full') : `${formatDay(day, lang, 'full')} ${day.slice(0, 4)}`)
  // One day: the field shows the later day that is chosen. Several: it only ever adds, and empties itself.
  const typed = !many && chosen[0] && !strip.includes(chosen[0]) ? chosen[0] : ''

  return (
    <div>
      <DayStrip label={label} days={strip} selected={chosen} today={todayDay} marked={marked} markLabel={markLabel} onToggle={tap} />
      {note}
      {later.length > 0 && (
        <div role="group" aria-label={c.laterDays} className="mt-2 flex flex-wrap gap-2" data-testid="later-days">
          {later.map((day) => {
            const mark = marked.includes(day)
            return (
              <Chip key={day} selected={chosen.includes(day)} onClick={() => tap(day)}>
                {mark && <Heart size={16} />}
                <span data-day={day}>{words(day)}</span>
                {mark && markLabel && <span className="sr-only">, {markLabel}</span>}
              </Chip>
            )
          })}
        </div>
      )}
      <Field
        className="mt-3"
        type="date"
        label={laterLabel}
        min={todayDay}
        value={typed}
        onChange={(event) => {
          const picked = linkedDay(event.target.value, todayDay)
          if (many) {
            if (picked && !chosen.includes(picked)) onChange(tapDay(chosen, picked, true))
          } else if (picked) onChange([picked])
          else if (!event.target.value) onChange([])
        }}
      />
    </div>
  )
}

interface PastDayChoiceProps {
  label: string
  /** The words that bring out the date field, and its label: for any day before the ones to tap. */
  earlierLabel: string
  today: Day
  chosen: Day
  onChange: (day: Day) => void
}

/**
 * Today or any day before it: two weeks to tap, the newest first, and a date field for
 * every day before them. The field stays put away until somebody asks for it.
 */
export function PastDayChoice({ label, earlierLabel, today: todayDay, chosen, onChange }: PastDayChoiceProps) {
  const strip = pastDays(todayDay, STRIP_DAYS)
  const [asked, setAsked] = useState(false)
  const earlier = !strip.includes(chosen)
  return (
    <div>
      <DayStrip label={label} days={strip} selected={[chosen]} today={todayDay} onToggle={onChange} />
      {asked || earlier ? (
        <Field
          className="mt-2"
          type="date"
          label={earlierLabel}
          max={todayDay}
          value={earlier ? chosen : ''}
          onChange={(event) => {
            const picked = pastDay(event.target.value, todayDay)
            if (picked) onChange(picked)
          }}
        />
      ) : (
        <TextAction aria-expanded={false} onClick={() => setAsked(true)}>
          {earlierLabel}
        </TextAction>
      )}
    </div>
  )
}

/** Breakfast, lunch, dinner, dessert: exactly one. */
export function SlotChips({ label, value, onChange }: { label: string; value: Slot; onChange: (slot: Slot) => void }) {
  const t = useT()
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {SLOTS.map((slot) => (
        <Chip key={slot} selected={value === slot} onClick={() => onChange(slot)}>
          {t.slots[slot]}
        </Chip>
      ))}
    </div>
  )
}

/** Keeps the main button of a form within thumb reach. Give the page's main area pb-24 to clear it. */
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground">
      <div className="app-column px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{children}</div>
    </div>
  )
}

// -------------------------------------------------------------------- drag --

/**
 * A long press on a photo would open Android's image menu right when a card should
 * lift. Keep the menu for the mouse, drop it for fingers.
 */
export function noTouchMenu(event: MouseEvent<HTMLElement>): void {
  if ((event.nativeEvent as PointerEvent).pointerType !== 'mouse') event.preventDefault()
}

/** How long a finger rests on a card before it lifts. Short enough to feel direct, long enough to scroll past. */
const HOLD_MS = 220

/**
 * Drag sensors for lists on a phone: a mouse drags after a few pixels, a finger after
 * a short hold (so scrolling still works), and the keyboard when a getter is given.
 */
export function useDragSensors(keyboard?: KeyboardCoordinateGetter) {
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: 8 } })
  const keys = useSensor(KeyboardSensor, { coordinateGetter: keyboard })
  return useSensors(mouse, touch, keyboard ? keys : null)
}
