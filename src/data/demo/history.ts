// Builds every row of the demo kitchen in memory: recipe cards, menus, three months of
// meals with their reviews, the coming week and the wishlist. Nothing here touches the
// database, so the same function serves the app and the tests.
//
// The stories (which dish, how it was rated, what was said) are written in story.ts.
// This file decides the calendar: which days had a breakfast, a dinner, a dessert.

import { generateKeyBetween } from 'fractional-indexing'
import type { Lang } from '../../i18n'
import { addDays, weekdayIndex } from '../../lib/dates'
import {
  newId,
  type Criterion,
  type Day,
  type Dish,
  type ExtraReaction,
  type ID,
  type ISO,
  type Menu,
  type PhotoSource,
  type Reaction,
  type Review,
  type Score5,
  type Serving,
  type Slot,
} from '../types'
import { hm, zurichIso } from './clock'
import { recipeOf, say, TAGS, type Both, type DemoMenu, type DishKey } from './content'
import { makeRng, type Rng } from './random'
import { DEMO_DISHES } from './recipes'
import {
  CHIPS,
  COMING_UP,
  CRITERIA,
  MENUS,
  SKIPS,
  SPARE_COMMENTS,
  SPARE_NOTES,
  SPARE_REPLIES,
  STORIES,
  TONIGHT,
  WISHLIST,
  type ChipKey,
  type CriterionKey,
  type Occasion,
  type Visit,
  type Wish,
} from './story'

/** How many days of history, ending yesterday. Thirteen weeks. */
export const HISTORY_DAYS = 91
/** The streak that is running when the demo opens: yesterday and the three days before. */
export const CURRENT_STREAK = 4
/** The kitchen was started a while before the first meal in the history. */
export const KITCHEN_AGE_DAYS = 140

const LUNCHES = 9
/** Dishes that are too alike to follow each other closely. */
const RICH: Partial<Record<DishKey, string>> = { fondue: 'cheese', raclette: 'cheese', chaeschuechli: 'cheese', kaesesouffle: 'cheese' }
/** Recipes that joined later: written at most this many days before their first proposal. */
const NEW_CARDS: Partial<Record<DishKey, number>> = { kaesesouffle: 1, raclette: 6, chaeschuechli: 8, greencurry: 5 }
/** A week, some time ago, in which there was a proper dinner every single day. */
const GOOD_WEEK = { from: 40, to: 46 }

export interface DemoKitchen {
  householdId: ID
  chefId: ID
  tasterId: ID
}

/** A picture that still has to be painted. See photos.ts. */
export interface PhotoJob {
  photoId: ID
  householdId: ID
  kind: 'proof' | 'cover'
  art: DishKey
  /** Makes every photo of the same dish a little different. */
  seed: number
  light: 'morning' | 'day' | 'evening'
  source: PhotoSource
  takenAt: ISO
  createdBy: ID
  servingId?: ID
  dishId?: ID
  disaster?: boolean
}

export interface DemoRows {
  dishes: Dish[]
  menus: Menu[]
  servings: Serving[]
  reviews: Review[]
  photoJobs: PhotoJob[]
  /** Which recipe card is which, for tests and tools. */
  dishIds: Record<DishKey, ID>
}

export interface BuildInput {
  kitchen: DemoKitchen
  /** The kitchen's review criteria, in the order of CRITERIA in story.ts. */
  criteria: Criterion[]
  today: Day
  lang: Lang
}

interface Meal {
  /** Position in the history: 0 is the oldest day. */
  index: number
  day: Day
  weekday: number
  slot: Slot
  dish: DishKey
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))
const score = (value: number): Score5 => clamp(Math.round(value), 1, 5) as Score5

/** Pick `count` items, likelier ones first, never the same one twice. */
function sample<T>(rng: Rng, items: readonly T[], weight: (item: T) => number, count: number): T[] {
  return items
    .map((item) => {
      const w = weight(item)
      return { item, key: w === Infinity ? 2 : w <= 0 ? -1 : rng() ** (1 / w) }
    })
    .filter((entry) => entry.key >= 0)
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((entry) => entry.item)
}

export function buildDemoRows({ kitchen, criteria, today, lang }: BuildInput): DemoRows {
  const { householdId, chefId, tasterId } = kitchen
  const root = makeRng('foodwishus-demo').fork(today)
  const text = (both: Both): string => say(both, lang)
  const dayAt = (index: number): Day => addDays(today, index - HISTORY_DAYS)
  const ago = (index: number): number => HISTORY_DAYS - index
  const allDays = Array.from({ length: HISTORY_DAYS }, (_, index) => index)
  /** The day before the streak: nothing was eaten. */
  const gap = HISTORY_DAYS - CURRENT_STREAK - 1
  const isWeekend = (index: number): boolean => weekdayIndex(dayAt(index)) >= 5

  const dishIds = Object.fromEntries(DEMO_DISHES.map((dish) => [dish.key, newId()])) as Record<DishKey, ID>
  const menuIds = Object.fromEntries(MENUS.map((menu) => [menu.key, newId()])) as Record<DemoMenu['key'], ID>

  // ------------------------------------------------------------ calendar --

  const countOf = (occasion: Occasion): number =>
    Object.values(STORIES).reduce((sum, story) => sum + (story.at === occasion ? story.visits.length : 0), 0)

  const pickDays = root.fork('days')
  const inStreak = (index: number): boolean => ago(index) <= CURRENT_STREAK
  const inGoodWeek = (index: number): boolean => ago(index) >= GOOD_WEEK.from && ago(index) <= GOOD_WEEK.to

  const dinnerDays = sample(
    pickDays,
    allDays,
    (index) => {
      if (index === gap) return 0
      if (inStreak(index) || inGoodWeek(index)) return Infinity
      return [1, 1, 1, 1, 1.4, 1.3, 1.5][weekdayIndex(dayAt(index))]
    },
    countOf('meal') - LUNCHES,
  )
  const lunchDays = sample(pickDays, allDays, (index) => (index === gap ? 0 : [0.5, 0.5, 0.5, 0.5, 0.5, 5, 3.5][weekdayIndex(dayAt(index))]), LUNCHES)
  const breakfastDays = sample(pickDays, allDays, (index) => (index === gap ? 0 : [0.3, 0.3, 0.3, 0.3, 0.3, 6, 9][weekdayIndex(dayAt(index))]), countOf('breakfast'))
  const withMeal = new Set([...dinnerDays, ...lunchDays])
  const treatDays = sample(pickDays, [...withMeal], (index) => (isWeekend(index) ? 3 : 1), countOf('treat'))

  /** Spread each dish's visits over the months, then hand them out to the open slots in order. */
  function seat(occasion: Occasion, slots: { index: number; slot: Slot }[]): Meal[] {
    const rng = root.fork(`seat-${occasion}`)
    slots.sort((a, b) => a.index - b.index || (a.slot === 'lunch' ? -1 : 1))
    const tokens: { dish: DishKey; at: number }[] = []
    for (const dish of DEMO_DISHES) {
      const story = STORIES[dish.key]
      if (!story || story.at !== occasion) continue
      const [from, to] = story.season ?? [0, 1]
      story.visits.forEach((_, visit) => tokens.push({ dish: dish.key, at: from + ((to - from) * (visit + rng.between(0.15, 0.85))) / story.visits.length }))
    }
    tokens.sort((a, b) => a.at - b.at)
    const meals: Meal[] = slots.map((slot, i) => ({ ...slot, day: dayAt(slot.index), weekday: weekdayIndex(dayAt(slot.index)), dish: tokens[i].dish }))

    const suits = (dish: DishKey, meal: Meal): boolean => {
      const prefers = STORIES[dish]?.prefers
      if (prefers === 'lunch') return meal.slot === 'lunch'
      if (prefers === 'weekday') return meal.weekday < 5
      if (prefers === 'sunday') return meal.weekday === 6
      if (prefers === 'weekend-evening') return meal.slot === 'dinner' && (meal.weekday === 4 || meal.weekday === 5)
      return true
    }
    // Not the same dish within a few days, and not cheese on cheese on cheese.
    const tooClose = (dish: DishKey, at: number, ignore: number): boolean =>
      meals.some((other, j) => {
        if (j === at || j === ignore) return false
        const apart = Math.abs(other.index - meals[at].index)
        return (other.dish === dish && apart < 5) || (RICH[dish] !== undefined && RICH[dish] === RICH[other.dish] && apart < 3)
      })
    const swap = (a: number, b: number): void => {
      ;[meals[a].dish, meals[b].dish] = [meals[b].dish, meals[a].dish]
    }
    const nearby = (i: number, reach: number): number[] =>
      Array.from({ length: reach * 2 }, (_, n) => i + (n % 2 ? -1 : 1) * (Math.floor(n / 2) + 1)).filter((j) => j >= 0 && j < meals.length)

    // Soup at lunch, the roast on Sunday, fondue on a weekend evening.
    meals.forEach((meal, i) => {
      if (suits(meal.dish, meal)) return
      const better = nearby(i, 7).find((j) => suits(meal.dish, meals[j]) && (!STORIES[meals[j].dish]?.prefers || !suits(meals[j].dish, meals[j])))
      if (better !== undefined) swap(i, better)
    })
    meals.forEach((meal, i) => {
      if (!tooClose(meal.dish, i, -1)) return
      const calmer = nearby(i, 10).find((j) => meals[j].dish !== meal.dish && !tooClose(meal.dish, j, i) && !tooClose(meals[j].dish, i, j))
      if (calmer !== undefined) swap(i, calmer)
    })
    return meals
  }

  const meals = [
    ...seat('meal', [...dinnerDays.map((index) => ({ index, slot: 'dinner' as Slot })), ...lunchDays.map((index) => ({ index, slot: 'lunch' as Slot }))]),
    ...seat('breakfast', breakfastDays.map((index) => ({ index, slot: 'breakfast' as Slot }))),
    ...seat('treat', treatDays.map((index) => ({ index, slot: 'dessert' as Slot }))),
  ]

  // -------------------------------------------------------------- clocks --

  const clock = root.fork('clock')
  const SLOT_ORDER: Slot[] = ['breakfast', 'lunch', 'dinner', 'dessert']
  meals.sort((a, b) => a.index - b.index || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
  const dinnerTime = new Map<number, number>()

  function eatenMinutes(meal: Meal): number {
    const weekend = meal.weekday >= 5
    if (meal.slot === 'breakfast') return weekend ? clock.between(hm(8, 40), hm(10, 50)) : clock.between(hm(6, 50), hm(7, 55))
    if (meal.slot === 'lunch') return clock.between(hm(12, 5), hm(13, 30))
    if (meal.slot === 'dinner') {
      const at = meal.weekday === 4 || meal.weekday === 5 ? clock.between(hm(19, 10), hm(21, 10)) : meal.weekday === 6 ? clock.between(hm(18, 10), hm(19, 50)) : clock.between(hm(18, 40), hm(20, 25))
      dinnerTime.set(meal.index, at)
      return at
    }
    // Dessert follows dinner; otherwise it is an afternoon treat.
    const dinner = dinnerTime.get(meal.index)
    const afterDinner = clock.chance(0.65)
    const afternoon = clock.between(hm(15, 5), hm(16, 45))
    return dinner !== undefined && afterDinner ? Math.min(dinner + clock.between(45, 80), hm(22, 20)) : afternoon
  }

  /** A moment on that day, never past 23:55, so nothing in the history lies in the future. */
  const sameDay = (day: Day, minutes: number): ISO => zurichIso(day, Math.min(minutes, hm(23, 55)))

  /** How long a proposal waited before it was eaten. Most are quick, a few linger. */
  const waitDays = (rng: Rng): number =>
    rng.weighted([
      [0, 2],
      [1, 4],
      [2, 4],
      [3, 3],
      [rng.int(4, 7), 5],
      [rng.int(8, 14), 3],
      [rng.int(15, 24), 1],
    ])

  // ------------------------------------------------------------- servings --

  const servings: Serving[] = []
  const reviews: Review[] = []
  const photoJobs: PhotoJob[] = []
  const firstProposal = new Map<DishKey, ISO>()
  const visitCount = new Map<DishKey, number>()
  const criterionId = Object.fromEntries(CRITERIA.map(([key], order) => [key, criteria[order]?.id])) as Record<CriterionKey, ID | undefined>
  const activeIds = new Set(criteria.filter((c) => c.active && !c.deletedAt).map((c) => c.id))

  const blank = (at: ISO) => ({ id: newId(), householdId, createdAt: at, updatedAt: at, deletedAt: null })

  function remember(dish: DishKey, proposedAt: ISO): void {
    const known = firstProposal.get(dish)
    if (!known || proposedAt < known) firstProposal.set(dish, proposedAt)
  }

  for (const meal of meals) {
    const story = STORIES[meal.dish]
    if (!story) continue
    const nth = visitCount.get(meal.dish) ?? 0
    visitCount.set(meal.dish, nth + 1)
    const visit: Visit = story.visits[nth]
    const rng = root.fork(`visit-${meal.dish}-${nth}`)

    const cook = visit.leoCooks ? tasterId : chefId
    const reviewer = visit.leoCooks ? chefId : tasterId
    const proposer = visit.leoCooks || visit.leoAsked ? tasterId : chefId

    const eatenMin = eatenMinutes(meal)
    const eatenAt = zurichIso(meal.day, eatenMin)
    const servedAt = zurichIso(meal.day, eatenMin - rng.between(1.5, 8))
    const wait = Math.max(waitDays(rng), meal.slot === 'breakfast' ? 1 : 0)
    const proposedAt = wait === 0 ? zurichIso(meal.day, rng.between(hm(7, 15), Math.max(hm(7, 30), eatenMin - 90))) : zurichIso(addDays(meal.day, -wait), rng.between(hm(8, 30), hm(21, 30)))
    remember(meal.dish, proposedAt)

    const overall = visit.o
    const craving = visit.craving ?? score(overall + rng.weighted([[0, 6], [-1, 2], [1, 1.5], [-2, 0.5]]))
    const note = visit.note ? text(visit.note) : proposer === chefId && rng.chance(0.14) ? text(rng.pick(SPARE_NOTES)) : null

    const serving: Serving = {
      ...blank(proposedAt),
      updatedAt: eatenAt,
      dishId: dishIds[meal.dish],
      menuId: null,
      proposedBy: proposer,
      cookedBy: cook,
      proposedAt,
      note,
      suggestedDays: wait > 0 && rng.chance(0.25) ? [meal.day] : [],
      craving,
      priority: '',
      status: 'eaten',
      plannedDate: meal.day,
      plannedSlot: meal.slot,
      servedAt,
      eatenAt,
      skippedReason: null,
      proofPhotos: [],
    }
    servings.push(serving)

    // The review: his verdict, sometimes with her answer.
    const reaction: Reaction =
      visit.reaction ??
      (overall === 5 ? rng.weighted<Reaction>([[6, 7], [5, 3]]) : overall === 4 ? rng.weighted<Reaction>([[5, 7], [4, 3]]) : overall === 3 ? rng.weighted<Reaction>([[4, 5], [3, 5]]) : overall === 2 ? 2 : 1)
    const scores: Record<ID, Score5> = {}
    for (const [key] of CRITERIA) {
      const id = criterionId[key]
      if (!id || !activeIds.has(id)) continue
      const nudge = (story.bias?.[key] ?? 0) + (visit.bias?.[key] ?? 0)
      const noise = key === 'taste' ? rng.weighted([[0, 8], [-1, 1], [1, 1]]) : rng.weighted([[0, 5], [-1, 2.5], [1, 2.5]])
      scores[id] = score(overall + nudge + noise)
    }
    const small = story.at === 'treat'
    const portionsEaten =
      visit.portions ??
      (overall <= 2
        ? 0.5
        : small
          ? 1
          : overall === 5
            ? rng.weighted([[1, 6], [1.5, 3], [2, 1]])
            : overall === 4
              ? rng.weighted([[1, 8], [1.5, 2]])
              : rng.weighted([[1, 8], [0.5, 2]]))
    const spare = overall >= 5 ? SPARE_COMMENTS.high : SPARE_COMMENTS.mid
    const comment = visit.say ? text(visit.say) : overall >= 3 && rng.chance(0.15) ? text(rng.pick(spare)) : null
    // Quick chips are tapped instead of writing, so a written comment rarely comes with a random one.
    const chipKeys: ChipKey[] =
      visit.chips ??
      (visit.say || !rng.chance(0.45)
        ? []
        : overall === 5
          ? rng.pick<ChipKey[]>([['perfect'], ['keeper'], ['perfect', 'keeper']])
          : overall === 4
            ? rng.pick<ChipKey[]>([['perfect'], ['keeper'], ['moreSalt']])
            : overall === 3
              ? ['moreSalt']
              : [])
    const extraReactions: ExtraReaction[] =
      visit.extra ??
      (!rng.chance(0.25)
        ? []
        : overall === 5
          ? rng.pick<ExtraReaction[]>([['love'], ['fire'], ['chef-queen'], ['love', 'again'], ['again']])
          : overall === 4
            ? rng.pick<ExtraReaction[]>([['love'], ['again'], ['fire']])
            : overall === 3
              ? ['needs-salt']
              : [])
    const reviewMin = eatenMin + (rng.chance(0.8) ? rng.between(1, 12) : rng.between(20, 95))
    const reviewedAt = sameDay(meal.day, Math.min(reviewMin, hm(23, 40)))
    const chefReply = visit.reply ? text(visit.reply) : comment && overall === 5 && rng.chance(0.3) ? text(rng.pick(SPARE_REPLIES)) : null
    const reacted = chefReply !== null || rng.chance(0.35)
    const chefReaction = reacted ? (clamp(reaction + rng.weighted([[0, 5], [-1, 2], [1, 2]]), 1, 6) as Reaction) : null
    const chefExtraReactions: ExtraReaction[] = reacted && overall >= 4 && rng.chance(0.4) ? [rng.pick<ExtraReaction>(['love', 'love', 'again', 'fire'])] : []
    const chefSelfRating = visit.self ?? (rng.chance(0.5) ? score(overall + rng.weighted([[0, 5], [-1, 4], [1, 1.5]])) : null)
    const repliedAt = reacted ? sameDay(meal.day, Math.min(reviewMin, hm(23, 40)) + rng.between(3, 150)) : reviewedAt

    reviews.push({
      ...blank(reviewedAt),
      updatedAt: repliedAt,
      servingId: serving.id,
      dishId: serving.dishId,
      reviewerId: reviewer,
      reaction,
      extraReactions,
      overall,
      scores,
      portionsEaten,
      wouldEatAgain: visit.again ?? (overall >= 4 ? true : overall === 3 ? rng.chance(0.7) : false),
      comment,
      chips: chipKeys.map((key) => text(CHIPS[key])),
      chefSelfRating,
      chefReaction,
      chefExtraReactions,
      chefReply,
      sealedAt: new Date(Date.parse(reviewedAt) + 24 * 3600 * 1000).toISOString(),
    })

    photoJobs.push({
      photoId: newId(),
      householdId,
      kind: 'proof',
      art: meal.dish,
      seed: rng.int(1, 2 ** 30),
      light: meal.slot === 'breakfast' ? 'morning' : eatenMin >= hm(17, 30) ? 'evening' : 'day',
      source: rng.chance(0.13) ? 'gallery' : 'camera',
      takenAt: eatenAt,
      createdBy: reviewer,
      servingId: serving.id,
      ...(visit.disaster ? { disaster: true } : {}),
    })
  }

  // Meals that were planned and then did not happen.
  const skipRng = root.fork('skips')
  const taken = new Set(meals.map((meal) => `${meal.index}/${meal.slot}`))
  const usedSkipDays = new Set<number>()
  SKIPS.forEach((skip, n) => {
    const [from, to] = skip.when ?? [0, 1]
    const free = allDays.filter(
      (index) =>
        ago(index) > CURRENT_STREAK + 2 &&
        index >= from * HISTORY_DAYS &&
        index <= to * HISTORY_DAYS &&
        !taken.has(`${index}/${skip.slot}`) &&
        !usedSkipDays.has(index) &&
        (skip.slot !== 'breakfast' || isWeekend(index)) &&
        (!skip.menu || [4, 5].includes(weekdayIndex(dayAt(index)))),
    )
    // The first skip explains the gap before the current streak.
    const index = n === 0 ? gap : skipRng.pick(free)
    usedSkipDays.add(index)
    const day = dayAt(index)
    const proposedAt = zurichIso(addDays(day, -skipRng.int(1, skip.unplanned ? 30 : 6)), skipRng.between(hm(9), hm(21)))
    const skippedAt = skip.unplanned ? zurichIso(day, skipRng.between(hm(10), hm(20))) : zurichIso(day, skip.slot === 'breakfast' ? skipRng.between(hm(9, 30), hm(11)) : skipRng.between(hm(16, 30), hm(19, 30)))
    if (skip.dish) remember(skip.dish, proposedAt)
    servings.push({
      ...blank(proposedAt),
      updatedAt: skippedAt,
      dishId: skip.dish ? dishIds[skip.dish] : null,
      menuId: skip.menu ? menuIds[skip.menu] : null,
      proposedBy: chefId,
      cookedBy: chefId,
      proposedAt,
      note: null,
      suggestedDays: [],
      craving: skip.craving ?? null,
      priority: '',
      status: 'skipped',
      plannedDate: skip.unplanned ? null : day,
      plannedSlot: skip.unplanned ? null : skip.slot,
      servedAt: null,
      eatenAt: null,
      skippedReason: text(skip.reason),
      proofPhotos: [],
    })
  })

  // Wishlist order is the order things were put on the list, until he drags them.
  servings.sort((a, b) => (a.proposedAt < b.proposedAt ? -1 : a.proposedAt > b.proposedAt ? 1 : 0))

  // Tonight, the coming week and the wishlist.
  const openRng = root.fork('open')
  function open(wish: Wish, daysAgo: number, planned?: { day: Day; slot: Slot }): void {
    const proposedDay = addDays(today, -daysAgo)
    const proposedMin = openRng.between(hm(8, 30), hm(21))
    const proposedAt = zurichIso(proposedDay, proposedMin)
    // He looked at it a little later: set hearts, picked a day.
    const touchedAt = wish.craving || planned ? sameDay(proposedDay, proposedMin + openRng.between(10, 160)) : proposedAt
    if (wish.dish) remember(wish.dish, proposedAt)
    const weekend = wish.weekend ? [8, 9, 10, 11, 12, 13, 14].map((n) => addDays(today, n)).filter((day) => weekdayIndex(day) >= 5) : []
    servings.push({
      ...blank(proposedAt),
      updatedAt: touchedAt,
      dishId: wish.dish ? dishIds[wish.dish] : null,
      menuId: wish.menu ? menuIds[wish.menu] : null,
      proposedBy: wish.leoAsked ? tasterId : chefId,
      cookedBy: chefId,
      proposedAt,
      note: wish.note ? text(wish.note) : null,
      suggestedDays: planned ? [] : weekend,
      craving: wish.craving ?? null,
      priority: '',
      status: planned ? 'planned' : 'wishlist',
      plannedDate: planned?.day ?? null,
      plannedSlot: planned?.slot ?? null,
      servedAt: null,
      eatenAt: null,
      skippedReason: null,
      proofPhotos: [],
    })
  }

  open(TONIGHT, 3, { day: today, slot: 'dinner' })
  const week = [1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, n))
  const weekdays = week.filter((day) => weekdayIndex(day) <= 3)
  const landsOn: Record<(typeof COMING_UP)[number]['on'], Day | undefined> = {
    'first-weekday': weekdays[0],
    'last-weekday': weekdays[weekdays.length - 1],
    friday: week.find((day) => weekdayIndex(day) === 4),
    saturday: week.find((day) => weekdayIndex(day) === 5),
    sunday: week.find((day) => weekdayIndex(day) === 6),
  }
  COMING_UP.map((plan) => ({ plan, day: landsOn[plan.on] as Day }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .forEach(({ plan, day }) => open(plan, openRng.int(1, 5), { day, slot: plan.slot }))
  WISHLIST.forEach((wish, n) => open(wish, wish.craving ? openRng.int(2, 12) : Math.max(1, 3 - (n % 3))))

  let last: string | null = null
  for (const serving of servings) {
    last = generateKeyBetween(last, null)
    serving.priority = last
  }

  // --------------------------------------------------------- recipe cards --

  const cardRng = root.fork('cards')
  const kitchenStart = addDays(today, -KITCHEN_AGE_DAYS + 1)
  const dishes: Dish[] = DEMO_DISHES.map((dish) => {
    // Most recipe cards were typed in during the kitchen's first two weeks. A few are
    // newer: they were written just before they were first proposed.
    const first = firstProposal.get(dish.key)
    const daysBefore = NEW_CARDS[dish.key]
    const cardDay = first && daysBefore ? addDays(first.slice(0, 10), -cardRng.int(1, daysBefore)) : addDays(kitchenStart, cardRng.int(0, 13))
    const createdAt = zurichIso(cardDay, cardRng.between(hm(9), hm(22)))
    const by = dish.by === 'taster' ? tasterId : chefId
    const row: Dish = {
      ...blank(createdAt),
      id: dishIds[dish.key],
      name: text(dish.name),
      description: text(dish.description),
      course: dish.course,
      tags: dish.tags.map((tag) => text(TAGS[tag])),
      effort: dish.effort,
      recipe: recipeOf(dish, lang),
      nutrition: { ...dish.nutrition },
      coverPhotoId: null,
      icon: dish.icon,
      createdBy: by,
      archived: false,
    }
    if (dish.cover) {
      photoJobs.push({
        photoId: newId(),
        householdId,
        kind: 'cover',
        art: dish.key,
        seed: cardRng.int(1, 2 ** 30),
        light: 'day',
        source: 'gallery',
        takenAt: createdAt,
        createdBy: by,
        dishId: row.id,
      })
    }
    return row
  })

  // Menus are put together from cards that already exist.
  const menus: Menu[] = MENUS.map((menu, n) => ({
    ...blank(zurichIso(addDays(kitchenStart, 15 + n * 2), hm(20, 10 + n * 7))),
    id: menuIds[menu.key],
    name: text(menu.name),
    description: text(menu.description),
    courses: menu.courses.map((dish, order) => ({ dishId: dishIds[dish], order })),
    createdBy: chefId,
    archived: false,
  }))

  // Covers first (the recipe book is one tap away), then proof photos from newest to oldest.
  photoJobs.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'cover' ? -1 : 1) : a.takenAt > b.takenAt ? -1 : 1))

  return { dishes, menus, servings, reviews, photoJobs, dishIds }
}
