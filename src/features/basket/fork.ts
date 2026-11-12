// Fork checks the plan: what do the planned meals of the next days ask for that is
// neither at home nor on the basket? With a pantry and the helper within reach, the AI
// does the comparing (amounts, other names for the same thing, what was used up since a
// note). Without, Fork compares names himself. Either way the result is a list of
// suggestions on the basket for the two of them to decide about.

import { noteForkChecked, suggestForBasket } from '../../data/actions'
import { checkShopping, kitchenNow, ReadError, type KitchenNow, type ReadProblem } from '../../data/helper'
import type { Day } from '../../data/types'
import { addDays, toDay, today } from '../../lib/dates'
import type { Lang } from '../recipes/logic'
import { mealLines, needs, pantryLines, plannedMeals, weekday, type Need, type PlannedMeal } from './logic'

/** How far ahead Fork looks, today included. */
export const CHECK_DAYS = 7
/** How far back cooked meals count as "has probably used things up". */
const COOKED_DAYS = 10

export type CheckOutcome =
  | { kind: 'no_meals' }
  | {
      kind: 'checked'
      /** How many suggestions are on the basket now. */
      count: number
      /** fork: the helper compared. names: Fork compared names himself. */
      by: 'fork' | 'names'
      /** Why it was only names, when it was. */
      why: ReadProblem | 'emptyPantry' | null
      /** Something Fork wants said about the check. */
      note: string | null
    }

/** What was cooked lately, as meals with their day, for the helper to reckon with. */
export function cookedMeals(kitchen: Pick<KitchenNow, 'servings' | 'dishes' | 'menus'>, since: Day): PlannedMeal[] {
  const done = kitchen.servings
    .filter((serving) => (serving.status === 'served' || serving.status === 'eaten') && (serving.servedAt ?? serving.eatenAt))
    .map((serving) => ({ ...serving, status: 'planned' as const, plannedDate: toDay((serving.servedAt ?? serving.eatenAt) as string) }))
  return plannedMeals(done, kitchen.dishes, kitchen.menus, since, today())
}

/** What decides whether a check is due again: the planned meals of the window, and nothing else. */
export function planSignature(meals: readonly PlannedMeal[]): string {
  return meals.map((meal) => `${meal.day}/${meal.dishId}`).join(',')
}

export interface CheckWords {
  /** The reason on a suggestion made by comparing names: "For Rösti on Friday." */
  reason: (need: Need) => string
}

/** Run the check and put its suggestions on the basket. Never throws for a helper that cannot be reached: it falls back. */
export async function checkPlan(lang: Lang, words: CheckWords, kitchen?: KitchenNow): Promise<CheckOutcome> {
  const now = kitchen ?? (await kitchenNow())
  const from = today()
  const meals = plannedMeals(now.servings, now.dishes, now.menus, from, addDays(from, CHECK_DAYS - 1))
  // Checked is checked, by whichever phone and whatever comes of it: nobody asks about this plan again.
  await noteForkChecked(planSignature(meals))
  if (meals.length === 0) return { kind: 'no_meals' }

  const byNames = async (why: ReadProblem | 'emptyPantry'): Promise<CheckOutcome> => {
    const found = needs(meals, now.pantry, now.basket, lang)
    const count = await suggestForBasket(found.map((need) => ({ name: need.name, amount: need.amount, reason: words.reason(need), dishId: need.dishId, source: 'dish' })))
    return { kind: 'checked', count, by: 'names', why, note: null }
  }

  // With nothing noted there is nothing to compare: every ingredient is "missing", and no helper is needed to say so.
  if (now.pantry.length === 0) return byNames('emptyPantry')

  try {
    const answer = await checkShopping({
      lang,
      today: from,
      weekday: weekday(from),
      meals: mealLines(meals, lang),
      cooked: mealLines(cookedMeals(now, addDays(from, -COOKED_DAYS)), lang),
      pantry: pantryLines(now.pantry),
      // Only what is really on the list. Earlier suggestions are replaced by this check, so they must not hide what is missing.
      basket: now.basket.filter((item) => item.state === 'open').map((item) => (item.amount ? `${item.name} (${item.amount})` : item.name)),
    })
    const count = await suggestForBasket(answer.items.map((item) => ({ name: item.name, amount: item.amount, reason: item.reason, source: 'fork' })))
    return { kind: 'checked', count, by: 'fork', why: null, note: answer.note || null }
  } catch (error) {
    if (!(error instanceof ReadError)) throw error
    return byNames(error.code)
  }
}
