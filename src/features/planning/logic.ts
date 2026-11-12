// The thinking behind Today, the Wishlist and Our Week, kept free of React and of the
// database so every rule can be unit-tested. Functions that take "servings" expect them
// in wishlist order, the way useServings() returns them.

import { currentStreak, eatenDay } from '../../lib/stats'
import type { Course, Day, ID, Member, Serving, Slot } from '../../data/types'
import { addDays, toDay, weekOf, zurichHour } from '../../lib/dates'
import { normalize } from '../recipes/logic'

export const SLOTS: readonly Slot[] = ['breakfast', 'lunch', 'dinner', 'dessert']

const slotRank = (slot: Slot | null): number => (slot ? SLOTS.indexOf(slot) : SLOTS.length)

// ---------------------------------------------------------------- greeting --

export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'

/** Which greeting fits the hour of the day (0 to 23, Zurich time). */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'night'
}

// ------------------------------------------------------------------- roles --

export type MealRole = 'cook' | 'taster'

/** Who cooks this meal. Old rows without a cook fall back to whoever proposed it. */
export function cookOf(serving: Pick<Serving, 'cookedBy' | 'proposedBy'>): ID | null {
  return serving.cookedBy ?? serving.proposedBy
}

/** Roles belong to each meal: you either cook it, or you are its Taster. */
export function roleIn(serving: Pick<Serving, 'cookedBy' | 'proposedBy'>, memberId: ID): MealRole {
  return cookOf(serving) === memberId ? 'cook' : 'taster'
}

/**
 * Who cooks a new proposal unless told otherwise: the Chef of the two. When both (or
 * neither) call themselves Chef, it is whoever proposes.
 */
export function defaultCook(me: Pick<Member, 'id' | 'defaultRole'>, partner: Pick<Member, 'id' | 'defaultRole'> | null | undefined): ID {
  if (partner && me.defaultRole === 'taster' && partner.defaultRole === 'chef') return partner.id
  return me.id
}

// ------------------------------------------------------------------- today --

/** Still ahead of us: on the wishlist or on the calendar. */
export function isOpen(serving: Serving): boolean {
  return serving.status === 'wishlist' || serving.status === 'planned'
}

function byWhen(a: Serving, b: Serving): number {
  const dayA = a.plannedDate ?? ''
  const dayB = b.plannedDate ?? ''
  if (dayA !== dayB) return dayA < dayB ? -1 : 1
  return slotRank(a.plannedSlot) - slotRank(b.plannedSlot)
}

/** Meals that are on the table and wait for their proof, the longest wait first. */
export function onTheTable(servings: Serving[]): Serving[] {
  return servings
    .filter((s) => s.status === 'served')
    .sort((a, b) => {
      const at = a.servedAt ?? ''
      const bt = b.servedAt ?? ''
      return at === bt ? 0 : at < bt ? -1 : 1
    })
}

/** What is planned for one day and not served yet, breakfast first. */
export function plannedFor(servings: Serving[], day: Day): Serving[] {
  return servings.filter((s) => s.status === 'planned' && s.plannedDate === day).sort(byWhen)
}

/**
 * The queue on Today: planned meals by date (today's are left out, they are the hero),
 * then the wishlist in its own order.
 */
export function upNext(servings: Serving[], todayDay: Day, limit = 3): Serving[] {
  const planned = servings.filter((s) => s.status === 'planned' && s.plannedDate !== null && s.plannedDate !== todayDay).sort(byWhen)
  const wishes = servings.filter((s) => s.status === 'wishlist' || (s.status === 'planned' && s.plannedDate === null))
  return [...planned, ...wishes].slice(0, limit)
}

/** Meals eaten in the week (Monday to Sunday) that contains the given day. */
export function eatenInWeek(servings: Serving[], day: Day): number {
  const week = new Set(weekOf(day))
  return servings.filter((s) => {
    const eaten = eatenDay(s)
    return eaten !== null && week.has(eaten)
  }).length
}

// Streaks and eaten days are defined once, with the Cockpit's other numbers.
export { currentStreak, eatenDay }

// ---------------------------------------------------------------- wishlist --

export type WishFilter = 'all' | 'unrated' | 'planned'

/** The cards on the wishlist board, in wishlist order. */
export function wishlistCards(servings: Serving[], filter: WishFilter = 'all'): Serving[] {
  return servings.filter((s) => {
    if (!isOpen(s)) return false
    if (filter === 'unrated') return s.craving === null
    if (filter === 'planned') return s.status === 'planned'
    return true
  })
}

/** Skipped servings, the most recently skipped first. */
export function skippedServings(servings: Serving[]): Serving[] {
  return servings.filter((s) => s.status === 'skipped').sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1))
}

export interface Placement {
  /** The visible cards in their new order. */
  order: ID[]
  /** The neighbours to hand to moveServing. Null means the very top or the very bottom. */
  beforeId: ID | null
  afterId: ID | null
}

/**
 * Where a dragged card lands. "visible" is the list on screen (it may be filtered),
 * "all" is every serving in wishlist order. The card is placed right next to the card
 * it was dropped on, so hidden cards in between keep their places.
 * Returns null when nothing moves.
 */
export function placeAfterDrag(visible: ID[], all: ID[], activeId: ID, overId: ID): Placement | null {
  const from = visible.indexOf(activeId)
  const to = visible.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return null
  const order = [...visible]
  order.splice(from, 1)
  order.splice(to, 0, activeId)
  const rest = all.filter((id) => id !== activeId)
  if (to < from) {
    // Dragged up: sit directly above the card it was dropped on.
    const afterId = order[to + 1]
    const at = rest.indexOf(afterId)
    return { order, beforeId: at > 0 ? rest[at - 1] : null, afterId }
  }
  // Dragged down: sit directly below the card it was dropped on.
  const beforeId = order[to - 1]
  const at = rest.indexOf(beforeId)
  return { order, beforeId, afterId: at >= 0 && at + 1 < rest.length ? rest[at + 1] : null }
}

// ---------------------------------------------------------------- planning --

export function nextDays(from: Day, count: number): Day[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i))
}

/** How many days there are to tap. Any later day is typed into the date field next to them. */
export const STRIP_DAYS = 14

/** Days that lie after the last day of the strip, earliest first, without doubles. */
export function daysBeyond(days: Day[], strip: Day[]): Day[] {
  const last = strip[strip.length - 1] ?? ''
  return [...new Set(days)].filter((day) => day > last).sort()
}

/**
 * A day was tapped. Where one day is wanted it becomes the choice; where several are
 * welcome it joins the others, or leaves them when it was chosen already.
 */
export function tapDay(chosen: Day[], day: Day, many: boolean): Day[] {
  if (!many) return [day]
  return chosen.includes(day) ? chosen.filter((other) => other !== day) : [...chosen, day].sort()
}

/** Suggested days that are still ahead (today counts), earliest first, without doubles. */
export function upcomingDays(days: Day[], todayDay: Day): Day[] {
  return [...new Set(days)].filter((day) => day >= todayDay).sort()
}

/** A sensible first guess for the slot: breakfast dishes in the morning, sweets as dessert. */
export function defaultSlot(course: Course | null | undefined): Slot {
  if (course === 'breakfast') return 'breakfast'
  if (course === 'dessert' || course === 'snack') return 'dessert'
  return 'dinner'
}

/** The slot a meal most likely belonged to, judged by the hour it was eaten. */
export function slotForHour(hour: number): Slot {
  if (hour < 5) return 'dessert'
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 17) return 'dessert'
  if (hour < 22) return 'dinner'
  return 'dessert'
}

/** The planned day has come, or slipped by: now "Served" is the thing to do. */
export function isDue(serving: Serving, todayDay: Day): boolean {
  return serving.status === 'planned' && serving.plannedDate !== null && serving.plannedDate <= todayDay
}

/** The cook may tap "Served" on the planned day, or later if the day slipped by. */
export function canServe(serving: Serving, memberId: ID, todayDay: Day): boolean {
  return isDue(serving, todayDay) && roleIn(serving, memberId) === 'cook'
}

/**
 * Plans change: the cook may also serve a meal that is planned for another day, or one
 * that is only a wish. It then counts for the day it really came to the table.
 */
export function canServeEarly(serving: Serving, memberId: ID, todayDay: Day): boolean {
  return isOpen(serving) && !isDue(serving, todayDay) && roleIn(serving, memberId) === 'cook'
}

/**
 * What "Served" at the end of cook mode stands for. The meal of this dish that is already
 * on its way with this cook: one that is due first, then the next planned one, then a
 * wish. 'new' when the dish is on nobody's list. Null when it is only on the list as
 * something the partner cooks: then serving is theirs to tap.
 */
export function mealToServe(servings: Serving[], dishId: ID, memberId: ID, todayDay: Day): Serving | 'new' | null {
  const open = servings.filter((s) => isOpen(s) && s.dishId === dishId)
  if (open.length === 0) return 'new'
  const mine = open.filter((s) => roleIn(s, memberId) === 'cook')
  const due = mine.filter((s) => isDue(s, todayDay)).sort((a, b) => byWhen(b, a))
  const later = mine.filter((s) => s.status === 'planned' && !isDue(s, todayDay)).sort(byWhen)
  const wishes = mine.filter((s) => s.status === 'wishlist')
  return due[0] ?? later[0] ?? wishes[0] ?? null
}

/** The slot for a meal that is decided right now: the next main meal of the day. */
export function slotForNow(hour: number): Slot {
  if (hour < 10) return 'breakfast'
  if (hour < 14) return 'lunch'
  return 'dinner'
}

// ------------------------------------------------------------ meal choices --

export interface MealChoices<D, M> {
  /** Meals that are already on their way: wishes first (those hoped for on this day on top), then meals planned for another moment. */
  open: Serving[]
  /** The recipe book, for a meal nobody wished for first, or for a second helping of one that is planned already. */
  dishes: D[]
  menus: M[]
}

/**
 * What can go into a slot of the calendar. A wish is offered once, as that wish, and
 * not a second time from the recipe book. A meal that is planned for another moment can
 * be moved here, and its recipe stays in the book: the same breakfast on two mornings
 * is two meals. What sits in this very slot already is not offered again.
 */
export function mealChoices<D extends { id: ID; name: string; archived: boolean }, M extends { id: ID; name: string; archived: boolean; courses: unknown[] }>(
  servings: Serving[],
  dishes: D[],
  menus: M[],
  target: { day: Day; slot: Slot },
): MealChoices<D, M> {
  const elsewhere = servings.filter((s) => s.status === 'planned' && !(s.plannedDate === target.day && s.plannedSlot === target.slot)).sort(byWhen)
  const open = [...wishesForDay(servings, target.day), ...elsewhere]
  const here = servings.filter((s) => s.status === 'planned' && s.plannedDate === target.day && s.plannedSlot === target.slot)
  const wishes = servings.filter((s) => s.status === 'wishlist')
  const taken = new Set([...wishes, ...here].flatMap((s) => [s.dishId, s.menuId]))
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return {
    open,
    dishes: dishes.filter((dish) => !dish.archived && !taken.has(dish.id)).sort(byName),
    menus: menus.filter((menu) => !menu.archived && menu.courses.length > 0 && !taken.has(menu.id)).sort(byName),
  }
}

/** True when every word of the search appears in the name. An empty search finds everything. */
export function nameMatches(name: string, query: string): boolean {
  const hay = normalize(name)
  return normalize(query)
    .split(/\s+/)
    .every((word) => hay.includes(word))
}

// ---------------------------------------------------------------- calendar --

export interface CalendarPlace {
  day: Day
  slot: Slot
}

/**
 * Where a serving sits in the calendar: planned meals on their planned day, served and
 * eaten meals on the day it really happened. Wishes and skipped meals have no place.
 */
export function calendarPlace(serving: Serving): CalendarPlace | null {
  if (serving.status === 'planned') {
    return serving.plannedDate ? { day: serving.plannedDate, slot: serving.plannedSlot ?? 'dinner' } : null
  }
  if (serving.status === 'served' || serving.status === 'eaten') {
    const moment = serving.status === 'eaten' ? (serving.eatenAt ?? serving.servedAt) : serving.servedAt
    const day = moment ? toDay(moment) : serving.plannedDate
    if (!day) return null
    return { day, slot: serving.plannedSlot ?? (moment ? slotForHour(zurichHour(moment)) : 'dinner') }
  }
  return null
}

export type DayPlan = Record<Slot, Serving[]>

const emptyDay = (): DayPlan => ({ breakfast: [], lunch: [], dinner: [], dessert: [] })

/** For each of the given days: its meals, sorted into slots. Every day gets an entry. */
export function groupByDayAndSlot(servings: Serving[], days: Day[]): Record<Day, DayPlan> {
  const plan: Record<Day, DayPlan> = {}
  for (const day of days) plan[day] = emptyDay()
  for (const serving of servings) {
    const place = calendarPlace(serving)
    if (place && plan[place.day]) plan[place.day][place.slot].push(serving)
  }
  return plan
}

/** A day's meals in the order they are eaten. */
export function mealsOf(plan: DayPlan): Serving[] {
  return SLOTS.flatMap((slot) => plan[slot])
}

export interface DayMarks {
  /** Planned or on the table: still ahead. */
  open: number
  eaten: number
}

/** The little markers of a day in the month view. */
export function dayMarks(plan: DayPlan): DayMarks {
  const meals = mealsOf(plan)
  const eaten = meals.filter((s) => s.status === 'eaten').length
  return { open: meals.length - eaten, eaten }
}

/** Wishes somebody suggested for exactly this day, in wishlist order. */
export function suggestedFor(servings: Serving[], day: Day): Serving[] {
  return servings.filter((s) => s.status === 'wishlist' && s.suggestedDays.includes(day))
}

/**
 * Wishes offered for an empty slot: the ones somebody suggested for exactly that day
 * come first, the rest follows in wishlist order.
 */
export function wishesForDay(servings: Serving[], day: Day): Serving[] {
  const others = servings.filter((s) => s.status === 'wishlist' && !s.suggestedDays.includes(day))
  return [...suggestedFor(servings, day), ...others]
}

/** A day from a link ("2026-11-12"), if it is a real date that is not over yet. */
export function linkedDay(value: string | null | undefined, todayDay: Day): Day | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return value >= todayDay ? value : null
}

/** The first day of the month before or after the month of the given day. */
export function shiftMonth(day: Day, months: number): Day {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7)) - 1 + months
  const date = new Date(Date.UTC(year, month, 1, 12))
  return date.toISOString().slice(0, 10)
}

export function sameMonth(a: Day, b: Day): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}
