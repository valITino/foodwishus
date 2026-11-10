// The numbers behind the Cockpit. Pure functions over the kitchen's rows: no database,
// no clock (today is passed in), so every definition can be tested exactly.
//
// Vocabulary:
//   meal   one eaten serving
//   plate  one dish eaten at one meal. A dish serving has one plate, a menu one per course.
//
// The definitions follow docs/SPEC.md, section 5 ("Stat definitions").

import type { Course, Criterion, Day, Dish, ID, Menu, Reaction, Review, Score5, Serving, Slot } from '../../data/types'
import { addDays, diffDays, toDay, weekOf, weekdayIndex, zurichHour } from '../dates'

export interface KitchenData {
  dishes: Dish[]
  menus: Menu[]
  servings: Serving[]
  reviews: Review[]
  criteria: Criterion[]
}

export interface Plate {
  servingId: ID
  dishId: ID
  /** Undefined when the dish has been deleted since. */
  dish: Dish | undefined
  review: Review | null
  overall: Score5 | null
  reaction: Reaction | null
  /** Portions eaten, 1 when nobody said. */
  portions: number
  /** kcal per serving × portions. Null means unknown, never 0. */
  kcal: number | null
}

export interface Meal {
  serving: Serving
  /** The Zurich day it was eaten on. */
  day: Day
  plates: Plate[]
}

/** A mean always travels with how many values went into it. */
export interface Mean {
  mean: number
  n: number
}

export function mean(values: number[]): Mean | null {
  if (values.length === 0) return null
  return { mean: values.reduce((sum, v) => sum + v, 0) / values.length, n: values.length }
}

const alive = <T extends { deletedAt: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt)

/** The Zurich day a meal was eaten on, or null when it has not been eaten. */
export function eatenDay(serving: Pick<Serving, 'status' | 'eatenAt' | 'plannedDate'>): Day | null {
  if (serving.status !== 'eaten') return null
  return serving.eatenAt ? toDay(serving.eatenAt) : serving.plannedDate
}

// -------------------------------------------------------------------- meals --

/** Every eaten meal with its plates, oldest first. */
export function eatenMeals(data: KitchenData): Meal[] {
  const dishes = new Map(alive(data.dishes).map((d) => [d.id, d]))
  const menus = new Map(data.menus.map((m) => [m.id, m]))
  const reviewsByServing = new Map<ID, Review[]>()
  for (const review of alive(data.reviews)) {
    const list = reviewsByServing.get(review.servingId) ?? []
    list.push(review)
    reviewsByServing.set(review.servingId, list)
  }

  const meals: Meal[] = []
  for (const serving of alive(data.servings)) {
    const day = eatenDay(serving)
    if (!day) continue
    const reviews = reviewsByServing.get(serving.id) ?? []

    // Which dishes were on the table: the dish itself, or the menu's courses. Reviews of
    // other dishes count too, so a menu that was changed afterwards keeps its history.
    const dishIds: ID[] = []
    if (serving.dishId) dishIds.push(serving.dishId)
    const menu = serving.menuId ? menus.get(serving.menuId) : undefined
    for (const course of [...(menu?.courses ?? [])].sort((a, b) => a.order - b.order)) dishIds.push(course.dishId)
    for (const review of reviews) if (review.dishId) dishIds.push(review.dishId)

    const plates = [...new Set(dishIds)].map((dishId): Plate => {
      const dish = dishes.get(dishId)
      const review = pickReview(reviews.filter((r) => r.dishId === dishId), serving.cookedBy)
      const portions = review?.portionsEaten ?? 1
      const perServing = dish?.nutrition.kcalPerServing
      return {
        servingId: serving.id,
        dishId,
        dish,
        review,
        overall: review?.overall ?? null,
        reaction: review?.reaction ?? null,
        portions,
        kcal: typeof perServing === 'number' ? perServing * portions : null,
      }
    })
    meals.push({ serving, day, plates })
  }
  return meals.sort((a, b) => a.day.localeCompare(b.day) || (a.serving.eatenAt ?? '').localeCompare(b.serving.eatenAt ?? ''))
}

/** The Taster's verdict: a review by someone other than the cook, the newest if there are several. */
function pickReview(reviews: Review[], cookedBy: ID | null): Review | null {
  if (reviews.length === 0) return null
  const byTaster = reviews.filter((r) => r.reviewerId !== cookedBy)
  const pool = byTaster.length > 0 ? byTaster : reviews
  return [...pool].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

/** How the whole meal was rated: the mean over its plates. Null when nothing was rated. */
export function mealOverall(meal: Meal): number | null {
  return mean(meal.plates.flatMap((p) => (p.overall === null ? [] : [p.overall])))?.mean ?? null
}

/** Calories of the whole meal. Unknown as soon as one plate is unknown: never guess, never 0. */
export function mealKcal(meal: Meal): number | null {
  if (meal.plates.length === 0 || meal.plates.some((p) => p.kcal === null)) return null
  return meal.plates.reduce((sum, p) => sum + (p.kcal as number), 0)
}

// ------------------------------------------------------------------ filters --

export interface StatsFilter {
  /** First and last day, both included. */
  from?: Day
  to?: Day
  dishIds?: ID[]
  menuId?: ID
  courses?: Course[]
  tags?: string[]
  cookedBy?: ID
  /** Overall rating, both ends included. Unrated plates do not match. */
  overall?: [number, number]
  reactions?: Reaction[]
  /** kcal per serving, both ends included. Dishes without calories do not match. */
  kcalPerServing?: [number, number]
}

export type RangePreset = 'week' | 'month' | 'quarter' | 'year' | 'all'

/** Date ranges for the filter bar. "week" is Monday to Sunday, "quarter" the last three calendar months. */
export function rangeFor(preset: RangePreset, today: Day): Pick<StatsFilter, 'from' | 'to'> {
  switch (preset) {
    case 'week': {
      const week = weekOf(today)
      return { from: week[0], to: week[6] }
    }
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today }
    case 'quarter':
      return { from: monthsBefore(today, 3), to: today }
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
    case 'all':
      return {}
  }
}

/** The same day of the month, that many months earlier (the last day when that month is shorter). */
function monthsBefore(day: Day, months: number): Day {
  const [year, month, date] = day.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 - months, 1))
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(date, daysInMonth))
  return first.toISOString().slice(0, 10)
}

const inDays = (day: Day, filter: StatsFilter) => (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to)

function plateMatches(plate: Plate, filter: StatsFilter): boolean {
  if (filter.dishIds?.length && !filter.dishIds.includes(plate.dishId)) return false
  if (filter.courses?.length && !(plate.dish && filter.courses.includes(plate.dish.course))) return false
  if (filter.tags?.length && !(plate.dish && plate.dish.tags.some((t) => filter.tags?.includes(t)))) return false
  if (filter.overall && !(plate.overall !== null && plate.overall >= filter.overall[0] && plate.overall <= filter.overall[1])) return false
  if (filter.reactions?.length && !(plate.reaction !== null && filter.reactions.includes(plate.reaction))) return false
  if (filter.kcalPerServing) {
    const kcal = plate.dish?.nutrition.kcalPerServing
    if (typeof kcal !== 'number' || kcal < filter.kcalPerServing[0] || kcal > filter.kcalPerServing[1]) return false
  }
  return true
}

/** Meals that match, each with only its matching plates. A meal with no matching plate is left out. */
export function filterMeals(meals: Meal[], filter: StatsFilter): Meal[] {
  const out: Meal[] = []
  for (const meal of meals) {
    if (!inDays(meal.day, filter)) continue
    if (filter.cookedBy && meal.serving.cookedBy !== filter.cookedBy) continue
    if (filter.menuId && meal.serving.menuId !== filter.menuId) continue
    const plates = meal.plates.filter((p) => plateMatches(p, filter))
    if (plates.length > 0) out.push({ ...meal, plates })
  }
  return out
}

const platesOf = (meals: Meal[]): (Plate & { day: Day })[] => meals.flatMap((m) => m.plates.map((p) => ({ ...p, day: m.day })))

// ----------------------------------------------------------------- per dish --

export interface DishStats {
  dishId: ID
  /** Number of eaten servings this dish was part of. */
  timesEaten: number
  /** Mean overall rating across its eaten servings. Always show n. */
  average: Mean | null
  /** Mean reaction, 1 (kitchen disaster) to 6 (super delicious). */
  reaction: Mean | null
  /** Mean per criterion, wherever it was rated. */
  criteria: Record<ID, Mean>
  wouldEatAgain: { yes: number; n: number }
  lastEaten: Day
}

export function dishStats(meals: Meal[]): Map<ID, DishStats> {
  const groups = new Map<ID, (Plate & { day: Day })[]>()
  for (const plate of platesOf(meals)) groups.set(plate.dishId, [...(groups.get(plate.dishId) ?? []), plate])

  const stats = new Map<ID, DishStats>()
  for (const [dishId, plates] of groups) {
    const scores = new Map<ID, number[]>()
    for (const plate of plates) {
      for (const [criterionId, score] of Object.entries(plate.review?.scores ?? {})) scores.set(criterionId, [...(scores.get(criterionId) ?? []), score])
    }
    const said = plates.flatMap((p) => (typeof p.review?.wouldEatAgain === 'boolean' ? [p.review.wouldEatAgain] : []))
    stats.set(dishId, {
      dishId,
      timesEaten: new Set(plates.map((p) => p.servingId)).size,
      average: mean(plates.flatMap((p) => (p.overall === null ? [] : [p.overall]))),
      reaction: mean(plates.flatMap((p) => (p.reaction === null ? [] : [p.reaction]))),
      criteria: Object.fromEntries([...scores].map(([id, values]) => [id, mean(values) as Mean])),
      wouldEatAgain: { yes: said.filter(Boolean).length, n: said.length },
      lastEaten: plates.map((p) => p.day).sort().at(-1) as Day,
    })
  }
  return stats
}

/** Best first: higher average, then more servings, then eaten more recently. */
const byRating = (a: DishStats, b: DishStats) =>
  (b.average?.mean ?? 0) - (a.average?.mean ?? 0) || b.timesEaten - a.timesEaten || b.lastEaten.localeCompare(a.lastEaten)

/** The highest dish average among dishes rated at least twice. */
export function bestRated(stats: Map<ID, DishStats>, minServings = 2): DishStats | null {
  return [...stats.values()].filter((s) => s.average !== null && s.average.n >= minServings).sort(byRating)[0] ?? null
}

/** Eaten most often. Ties go to the one eaten more recently. */
export function mostEaten(stats: Map<ID, DishStats>): DishStats | null {
  return [...stats.values()].sort((a, b) => b.timesEaten - a.timesEaten || b.lastEaten.localeCompare(a.lastEaten))[0] ?? null
}

/** The top dishes for the Hall of Fame. Dishes rated at least twice come first. */
export function hallOfFame(stats: Map<ID, DishStats>, limit = 5): DishStats[] {
  const rated = [...stats.values()].filter((s) => s.average !== null)
  const proven = rated.filter((s) => (s.average as Mean).n >= 2).sort(byRating)
  const hopefuls = rated.filter((s) => (s.average as Mean).n < 2).sort(byRating)
  return [...proven, ...hopefuls].slice(0, limit)
}

/** Times eaten per dish, most first. */
export function timesEatenTop(stats: Map<ID, DishStats>, limit = 10): DishStats[] {
  return [...stats.values()].sort((a, b) => b.timesEaten - a.timesEaten || b.lastEaten.localeCompare(a.lastEaten)).slice(0, limit)
}

// ------------------------------------------------------------------ streaks --

/**
 * Days in a row with at least one eaten meal, counted back from today. A day that is
 * not over yet does not break the streak: without a meal today, it runs up to yesterday.
 */
export function currentStreak(servings: Pick<Serving, 'status' | 'eatenAt' | 'plannedDate'>[], today: Day): number {
  const days = eatenDays(servings)
  let day = days.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(day)) {
    streak += 1
    day = addDays(day, -1)
  }
  return streak
}

/** The longest run of days in a row with at least one eaten meal, ever. */
export function longestStreak(servings: Pick<Serving, 'status' | 'eatenAt' | 'plannedDate'>[]): number {
  const days = [...eatenDays(servings)].sort()
  let best = 0
  let run = 0
  let previous: Day | null = null
  for (const day of days) {
    run = previous !== null && diffDays(previous, day) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }
  return best
}

function eatenDays(servings: Pick<Serving, 'status' | 'eatenAt' | 'plannedDate'>[]): Set<Day> {
  const days = new Set<Day>()
  for (const serving of servings) {
    const day = eatenDay(serving)
    if (day) days.add(day)
  }
  return days
}

// --------------------------------------------------------------------- KPIs --

/** The most common reaction. Ties go to the higher score. */
export function mostCommonReaction(meals: Meal[]): { reaction: Reaction; count: number } | null {
  const counts = reactionCounts(meals)
  let best: { reaction: Reaction; count: number } | null = null
  for (let reaction = 1; reaction <= 6; reaction++) {
    const count = counts[reaction - 1]
    if (count > 0 && (!best || count >= best.count)) best = { reaction: reaction as Reaction, count }
  }
  return best
}

/** How many times each reaction was given: index 0 is "kitchen disaster", index 5 "super delicious". */
export function reactionCounts(meals: Meal[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0]
  for (const plate of platesOf(meals)) if (plate.reaction !== null) counts[plate.reaction - 1] += 1
  return counts
}

/**
 * Skipped / (eaten + skipped) within the filter. "Eaten" is the same count the other
 * tiles show. A skipped meal belongs to the day it was planned for, or else to the day
 * it was skipped, and matches a dish filter when any of its dishes does. A skipped meal
 * has no verdict, so with a rating or reaction filter the rate cannot be told: null.
 */
export function skipRate(data: KitchenData, filter: StatsFilter = {}): { rate: number; skipped: number; eaten: number } | null {
  if (filter.overall || filter.reactions?.length) return null
  const dishes = new Map(alive(data.dishes).map((d) => [d.id, d]))
  const menus = new Map(data.menus.map((m) => [m.id, m]))
  const dishFilter = Boolean(filter.dishIds?.length || filter.courses?.length || filter.tags?.length || filter.kcalPerServing)

  let skipped = 0
  for (const serving of alive(data.servings)) {
    if (serving.status !== 'skipped') continue
    if (!inDays(serving.plannedDate ?? toDay(serving.updatedAt), filter)) continue
    if (filter.cookedBy && serving.cookedBy !== filter.cookedBy) continue
    if (filter.menuId && serving.menuId !== filter.menuId) continue
    if (dishFilter) {
      const dishIds = serving.dishId ? [serving.dishId] : (menus.get(serving.menuId ?? '')?.courses ?? []).map((c) => c.dishId)
      const blank = { servingId: serving.id, review: null, overall: null, reaction: null, portions: 1, kcal: null }
      if (!dishIds.some((dishId) => plateMatches({ ...blank, dishId, dish: dishes.get(dishId) }, filter))) continue
    }
    skipped += 1
  }
  const eaten = filterMeals(eatenMeals(data), filter).length
  return skipped + eaten === 0 ? null : { rate: skipped / (skipped + eaten), skipped, eaten }
}

/** Days between proposing a meal and eating it. */
export function daysToEat(meals: Meal[]): Mean | null {
  return mean(meals.map((m) => Math.max(0, diffDays(toDay(m.serving.proposedAt), m.day))))
}

export interface CalorieTotal {
  /** Sum over the meals whose calories are known. */
  kcal: number
  /** Meals with known calories. */
  known: number
  /** Meals whose calories are unknown. They are left out, never counted as 0. */
  unknown: number
}

export function caloriesEaten(meals: Meal[]): CalorieTotal {
  const total: CalorieTotal = { kcal: 0, known: 0, unknown: 0 }
  for (const meal of meals) {
    const kcal = mealKcal(meal)
    if (kcal === null) total.unknown += 1
    else {
      total.kcal += kcal
      total.known += 1
    }
  }
  return total
}

/** Calories eaten / eaten servings with known calories. */
export function averageCaloriesPerMeal(meals: Meal[]): Mean | null {
  const total = caloriesEaten(meals)
  return total.known === 0 ? null : { mean: total.kcal / total.known, n: total.known }
}

export interface Kpis {
  mealsEaten: number
  averageOverall: Mean | null
  bestRated: DishStats | null
  mostEaten: DishStats | null
  /** As of today, whatever the filter says. */
  currentStreak: number
  longestStreak: number
  skipRate: { rate: number; skipped: number; eaten: number } | null
  daysToEat: Mean | null
  /** Wishes waiting right now, whatever the date range says. */
  openWishlist: number
  /** This week (Monday to Sunday), whatever the date range says. */
  caloriesThisWeek: CalorieTotal
  mostCommonReaction: { reaction: Reaction; count: number } | null
}

export function kpis(data: KitchenData, filter: StatsFilter, today: Day): Kpis {
  const all = eatenMeals(data)
  const meals = filterMeals(all, filter)
  const stats = dishStats(meals)
  return {
    mealsEaten: meals.length,
    averageOverall: mean(platesOf(meals).flatMap((p) => (p.overall === null ? [] : [p.overall]))),
    bestRated: bestRated(stats),
    mostEaten: mostEaten(stats),
    currentStreak: currentStreak(data.servings.filter((s) => !s.deletedAt), today),
    longestStreak: longestStreak(data.servings.filter((s) => !s.deletedAt)),
    skipRate: skipRate(data, filter),
    daysToEat: daysToEat(meals),
    openWishlist: alive(data.servings).filter((s) => s.status === 'wishlist').length,
    caloriesThisWeek: caloriesEaten(filterMeals(all, rangeFor('week', today))),
    mostCommonReaction: mostCommonReaction(meals),
  }
}

// ------------------------------------------------------------------- charts --

/** One point per rated plate, oldest first. scores holds each criterion that was rated. */
export function ratingsOverTime(meals: Meal[]): { day: Day; dishId: ID; servingId: ID; overall: Score5; scores: Record<ID, Score5> }[] {
  return platesOf(meals).flatMap((p) => (p.overall === null ? [] : [{ day: p.day, dishId: p.dishId, servingId: p.servingId, overall: p.overall, scores: p.review?.scores ?? {} }]))
}

/**
 * Mean per criterion, for all plates or one dish: the radar chart. A criterion shows
 * when it is asked today, or when it is switched off but was rated in these meals
 * (history stays). The list is the same with and without a dish, so shapes line up.
 */
export function criteriaProfile(meals: Meal[], criteria: Criterion[], dishId?: ID): { criterionId: ID; label: string; icon: string; value: Mean | null }[] {
  const everyPlate = platesOf(meals)
  const rated = new Set(everyPlate.flatMap((p) => Object.keys(p.review?.scores ?? {})))
  const plates = everyPlate.filter((p) => !dishId || p.dishId === dishId)
  return alive(criteria)
    .filter((c) => c.active || rated.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((c) => ({
      criterionId: c.id,
      label: c.label,
      icon: c.icon,
      value: mean(plates.flatMap((p) => (typeof p.review?.scores[c.id] === 'number' ? [p.review.scores[c.id]] : []))),
    }))
}

/**
 * Craving against how it really was. Accuracy is 1 − mean(|craving − overall|) / 4,
 * over meals that have both.
 */
export function cravingVsReality(meals: Meal[]): { points: { servingId: ID; craving: Score5; overall: number }[]; accuracy: number | null } {
  const points = meals.flatMap((m) => {
    const overall = mealOverall(m)
    return m.serving.craving === null || overall === null ? [] : [{ servingId: m.serving.id, craving: m.serving.craving, overall }]
  })
  const miss = mean(points.map((p) => Math.abs(p.craving - p.overall)))
  return { points, accuracy: miss ? 1 - miss.mean / 4 : null }
}

/** How many plates per course, most first: the donut. */
export function courseMix(meals: Meal[]): { course: Course; count: number }[] {
  const counts = new Map<Course, number>()
  for (const plate of platesOf(meals)) if (plate.dish) counts.set(plate.dish.course, (counts.get(plate.dish.course) ?? 0) + 1)
  return [...counts].map(([course, count]) => ({ course, count })).sort((a, b) => b.count - a.count || a.course.localeCompare(b.course))
}

/** How many plates per tag, most first. */
export function tagMix(meals: Meal[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const plate of platesOf(meals)) for (const tag of plate.dish?.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** Meals per day: the calendar of little hearts. */
export function mealCalendar(meals: Meal[]): Map<Day, number> {
  const days = new Map<Day, number>()
  for (const meal of meals) days.set(meal.day, (days.get(meal.day) ?? 0) + 1)
  return days
}

export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'dessert']

export interface EatingTimes {
  /** [weekday 0 = Monday … 6][slot in SLOTS order] */
  byWeekdayAndSlot: number[][]
  /** [weekday 0 = Monday … 6][hour 0 … 23], from eatenAt in Zurich. */
  byWeekdayAndHour: number[][]
  /** For each meal with both: the slot it was planned for and the hour it was really eaten. */
  plannedVsActual: { servingId: ID; slot: Slot; hour: number }[]
}

export function eatingTimes(meals: Meal[]): EatingTimes {
  const byWeekdayAndSlot = Array.from({ length: 7 }, () => SLOTS.map(() => 0))
  const byWeekdayAndHour = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  const plannedVsActual: EatingTimes['plannedVsActual'] = []
  for (const meal of meals) {
    const weekday = weekdayIndex(meal.day)
    const slot = meal.serving.plannedSlot
    if (slot) byWeekdayAndSlot[weekday][SLOTS.indexOf(slot)] += 1
    if (meal.serving.eatenAt) {
      const hour = zurichHour(meal.serving.eatenAt)
      byWeekdayAndHour[weekday][hour] += 1
      if (slot) plannedVsActual.push({ servingId: meal.serving.id, slot, hour })
    }
  }
  return { byWeekdayAndSlot, byWeekdayAndHour, plannedVsActual }
}

export interface CalorieCharts {
  perDay: { day: Day; kcal: number }[]
  /** weekStart is the Monday. */
  perWeek: { weekStart: Day; kcal: number }[]
  perMealBySlot: Partial<Record<Slot, Mean>>
  total: CalorieTotal
}

export function calorieCharts(meals: Meal[]): CalorieCharts {
  const perDay = new Map<Day, number>()
  const perWeek = new Map<Day, number>()
  const bySlot = new Map<Slot, number[]>()
  for (const meal of meals) {
    const kcal = mealKcal(meal)
    if (kcal === null) continue
    perDay.set(meal.day, (perDay.get(meal.day) ?? 0) + kcal)
    const monday = weekOf(meal.day)[0]
    perWeek.set(monday, (perWeek.get(monday) ?? 0) + kcal)
    if (meal.serving.plannedSlot) bySlot.set(meal.serving.plannedSlot, [...(bySlot.get(meal.serving.plannedSlot) ?? []), kcal])
  }
  return {
    perDay: [...perDay].map(([day, kcal]) => ({ day, kcal })).sort((a, b) => a.day.localeCompare(b.day)),
    perWeek: [...perWeek].map(([weekStart, kcal]) => ({ weekStart, kcal })).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    perMealBySlot: Object.fromEntries([...bySlot].map(([slot, values]) => [slot, mean(values) as Mean])),
    total: caloriesEaten(meals),
  }
}

/** Per dish with both a rating and calories: taste against kcal per serving. */
export function tasteVsCalories(meals: Meal[]): { dishId: ID; kcalPerServing: number; average: Mean }[] {
  const dishes = new Map(platesOf(meals).flatMap((p) => (p.dish ? [[p.dishId, p.dish] as const] : [])))
  return [...dishStats(meals).values()].flatMap((s) => {
    const kcal = dishes.get(s.dishId)?.nutrition.kcalPerServing
    return s.average && typeof kcal === 'number' ? [{ dishId: s.dishId, kcalPerServing: kcal, average: s.average }] : []
  })
}

/** Prep plus cooking time. Null when the recipe gives neither. */
export function totalMinutes(dish: Pick<Dish, 'recipe'>): number | null {
  const { prepMinutes, cookMinutes } = dish.recipe
  if (typeof prepMinutes !== 'number' && typeof cookMinutes !== 'number') return null
  return (prepMinutes ?? 0) + (cookMinutes ?? 0)
}

/** Per dish with a known recipe time: effort against rating and reaction. */
export function effortVsLove(meals: Meal[]): { dishId: ID; minutes: number; average: Mean | null; reaction: Mean | null }[] {
  const dishes = new Map(platesOf(meals).flatMap((p) => (p.dish ? [[p.dishId, p.dish] as const] : [])))
  return [...dishStats(meals).values()].flatMap((s) => {
    const dish = dishes.get(s.dishId)
    const minutes = dish ? totalMinutes(dish) : null
    return minutes === null || (!s.average && !s.reaction) ? [] : [{ dishId: s.dishId, minutes, average: s.average, reaction: s.reaction }]
  })
}

/** Mean reaction per month ("2026-11"), oldest first. */
export function reactionTrend(meals: Meal[]): { month: string; value: Mean }[] {
  const months = new Map<string, number[]>()
  for (const plate of platesOf(meals)) {
    if (plate.reaction === null) continue
    const month = plate.day.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), plate.reaction])
  }
  return [...months].map(([month, values]) => ({ month, value: mean(values) as Mean })).sort((a, b) => a.month.localeCompare(b.month))
}

export interface RecipeStats {
  /** Mean prep plus cooking time over the eaten plates whose recipe gives a time. */
  averageMinutes: Mean | null
  /** Ingredients by how many eaten plates they were in, most first. Names are compared without capitals. */
  ingredients: { name: string; count: number }[]
}

export function recipeStats(meals: Meal[], limit = 10): RecipeStats {
  const minutes: number[] = []
  const counts = new Map<string, { name: string; count: number }>()
  for (const plate of platesOf(meals)) {
    if (!plate.dish) continue
    const total = totalMinutes(plate.dish)
    if (total !== null) minutes.push(total)
    const seen = new Set<string>()
    for (const ingredient of plate.dish.recipe.ingredients ?? []) {
      const key = ingredient.name.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      const entry = counts.get(key) ?? { name: ingredient.name.trim(), count: 0 }
      entry.count += 1
      counts.set(key, entry)
    }
  }
  return {
    averageMinutes: mean(minutes),
    ingredients: [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit),
  }
}

// ---------------------------------------------------------------- fun facts --

/** Little truths for the fun-facts strip. The screen puts them into words. */
export type FunFact =
  | { kind: 'mostEaten'; dishId: ID; count: number }
  | { kind: 'streak'; days: number }
  | { kind: 'perfectScores'; count: number }
  | { kind: 'superDelicious'; count: number }
  | { kind: 'favouriteWeekday'; weekday: number; count: number }
  | { kind: 'cravingAccuracy'; percent: number }
  | { kind: 'seconds'; count: number }
  | { kind: 'proofPhotos'; count: number }

export function funFacts(meals: Meal[], servings: Serving[], today: Day): FunFact[] {
  const facts: FunFact[] = []
  const top = mostEaten(dishStats(meals))
  if (top && top.timesEaten >= 3) facts.push({ kind: 'mostEaten', dishId: top.dishId, count: top.timesEaten })

  const streak = currentStreak(servings.filter((s) => !s.deletedAt), today)
  if (streak >= 3) facts.push({ kind: 'streak', days: streak })

  const plates = platesOf(meals)
  const perfect = plates.filter((p) => p.overall === 5).length
  if (perfect > 0) facts.push({ kind: 'perfectScores', count: perfect })
  const delicious = plates.filter((p) => p.reaction === 6).length
  if (delicious > 0) facts.push({ kind: 'superDelicious', count: delicious })

  const weekdays = [0, 0, 0, 0, 0, 0, 0]
  for (const meal of meals) weekdays[weekdayIndex(meal.day)] += 1
  const busiest = Math.max(...weekdays)
  if (meals.length >= 5 && busiest > 0) facts.push({ kind: 'favouriteWeekday', weekday: weekdays.indexOf(busiest), count: busiest })

  const { accuracy, points } = cravingVsReality(meals)
  if (accuracy !== null && points.length >= 5) facts.push({ kind: 'cravingAccuracy', percent: Math.round(accuracy * 100) })

  const seconds = plates.filter((p) => p.portions >= 2).length
  if (seconds > 0) facts.push({ kind: 'seconds', count: seconds })
  const photos = meals.reduce((sum, m) => sum + m.serving.proofPhotos.length, 0)
  if (photos > 0) facts.push({ kind: 'proofPhotos', count: photos })
  return facts
}
