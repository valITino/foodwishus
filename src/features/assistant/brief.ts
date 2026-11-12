// The kitchen in a few hundred lines of text: what the phone tells Fork with every
// question. Pure functions, so every line can be tested. No names of people, no notes,
// no photos. A dish is named by a ref ("D12") that only holds for one request: the app
// turns refs back into dishes the moment the answer arrives.

import type { KitchenBrief } from '../../data/backend'
import type { BasketItem, Day, Dish, ID, Menu, PantryItem, Review, Serving } from '../../data/types'
import { eatenDay } from '../../lib/stats'
import { normalize, formatIngredient } from '../recipes/logic'
import { pantryLines, weekday } from '../basket/logic'

export interface KitchenParts {
  servings: readonly Serving[]
  dishes: readonly Dish[]
  menus: readonly Menu[]
  pantry: readonly PantryItem[]
  basket: readonly BasketItem[]
  reviews: readonly Review[]
}

export interface Brief {
  kitchen: KitchenBrief
  /** Which dish a ref stands for, in this brief. */
  dishOf: Map<string, ID>
  refOf: Map<ID, string>
}

/** How much goes along at most. The function cuts at the same numbers. */
export const BRIEF_LIMITS = { dishes: 250, plan: 40, wishes: 40, eaten: 30, eatenDays: 60, pantry: 200, basket: 100, recipes: 4 }

const SLOT_RANK = { breakfast: 0, lunch: 1, dinner: 2, dessert: 3 } as const
const mean = (numbers: number[]): number | null => (numbers.length > 0 ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10 : null)

/** The kitchen as lines. `meId` decides who "you" is in "you cook". */
export function kitchenBrief(parts: KitchenParts, meId: ID, today: Day, calories: boolean): Brief {
  const dishes = parts.dishes.filter((dish) => !dish.deletedAt && !dish.archived).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).slice(0, BRIEF_LIMITS.dishes)
  const refOf = new Map(dishes.map((dish, index) => [dish.id, `D${index + 1}`]))
  const dishOf = new Map(dishes.map((dish, index) => [`D${index + 1}`, dish.id]))
  const menus = new Map(parts.menus.filter((menu) => !menu.deletedAt).map((menu) => [menu.id, menu]))
  const servings = parts.servings.filter((serving) => !serving.deletedAt)
  const reviews = parts.reviews.filter((review) => !review.deletedAt && review.overall !== null)

  const liked = (list: Review[]): string => {
    const score = mean(list.map((review) => review.overall as number))
    return score === null ? '' : `liked ${score} of 5`
  }
  /** "D12 Rüeblisuppe", or the menu's name with its courses. */
  const named = (serving: Pick<Serving, 'dishId' | 'menuId'>): string | null => {
    if (serving.dishId) {
      const ref = refOf.get(serving.dishId)
      const dish = dishes.find((entry) => entry.id === serving.dishId)
      return ref && dish ? `${ref} ${dish.name}` : null
    }
    const menu = serving.menuId ? menus.get(serving.menuId) : undefined
    if (!menu) return null
    const courses = menu.courses.map((course) => refOf.get(course.dishId)).filter(Boolean)
    return `the menu "${menu.name}"${courses.length > 0 ? ` (${courses.join(', ')})` : ''}`
  }
  const cook = (serving: Serving): string => ((serving.cookedBy ?? serving.proposedBy) === meId ? 'you cook' : 'your partner cooks')

  const eatenServings = servings.filter((serving) => serving.status === 'eaten')
  const dishLines = dishes.map((dish) => {
    const minutes = (dish.recipe.prepMinutes ?? 0) + (dish.recipe.cookMinutes ?? 0)
    const facts = [dish.course as string]
    if (minutes > 0) facts.push(`${minutes} min`)
    if (dish.effort) facts.push(dish.effort)
    if (calories && dish.nutrition.kcalPerServing) facts.push(`${dish.nutrition.kcalPerServing} kcal`)
    if (dish.tags.length > 0) facts.push(`tags: ${dish.tags.slice(0, 6).join(', ')}`)
    const times = eatenServings.filter((serving) => serving.dishId === dish.id || (serving.menuId && menus.get(serving.menuId)?.courses.some((course) => course.dishId === dish.id)))
    const days = times.map((serving) => eatenDay(serving)).filter((day): day is Day => day !== null).sort()
    const history = [times.length === 0 ? 'never eaten' : `eaten ${times.length} ${times.length === 1 ? 'time' : 'times'}`]
    if (days.length > 0) history.push(`last ${days[days.length - 1]}`)
    const verdict = liked(reviews.filter((review) => review.dishId === dish.id))
    if (verdict) history.push(verdict)
    return `${refOf.get(dish.id)} | ${dish.name} | ${facts.join(', ')} | ${history.join(', ')}`
  })
  const menuLines = [...menus.values()].filter((menu) => !menu.archived && menu.courses.length > 0).map((menu) => `Menu "${menu.name}": ${menu.courses.map((course) => refOf.get(course.dishId)).filter(Boolean).join(', ')}`)

  const plan = servings
    .filter((serving) => (serving.status === 'planned' || serving.status === 'served') && serving.plannedDate !== null && serving.plannedDate >= today)
    .sort((a, b) => (a.plannedDate as string).localeCompare(b.plannedDate as string) || SLOT_RANK[a.plannedSlot ?? 'dinner'] - SLOT_RANK[b.plannedSlot ?? 'dinner'])
    .flatMap((serving) => {
      const name = named(serving)
      return name ? [`${serving.plannedDate} (${weekday(serving.plannedDate as string)}), ${serving.plannedSlot ?? 'dinner'}: ${name}, ${cook(serving)}`] : []
    })

  const wishes = servings
    .filter((serving) => serving.status === 'wishlist')
    .flatMap((serving) => {
      const name = named(serving)
      if (!name) return []
      const facts = [serving.craving === null ? 'no hearts yet' : `${serving.craving} of 5 hearts`, cook(serving)]
      const good = serving.suggestedDays.filter((day) => day >= today).sort()
      if (good.length > 0) facts.push(`good days: ${good.slice(0, 6).join(', ')}`)
      return [`${name}, ${facts.join(', ')}`]
    })

  const eaten = eatenServings
    .map((serving) => ({ serving, day: eatenDay(serving) }))
    .filter((entry): entry is { serving: Serving; day: Day } => entry.day !== null)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, BRIEF_LIMITS.eaten)
    .flatMap(({ serving, day }) => {
      const name = named(serving)
      if (!name) return []
      const verdict = liked(reviews.filter((review) => review.servingId === serving.id))
      return [`${day}${serving.plannedSlot ? `, ${serving.plannedSlot}` : ''}: ${name}${verdict ? `, ${verdict}` : ''}`]
    })

  const basket = parts.basket.filter((item) => !item.deletedAt && item.state === 'open').map((item) => (item.amount ? `${item.name}: ${item.amount}` : item.name))

  return {
    dishOf,
    refOf,
    kitchen: {
      today,
      weekday: weekday(today),
      calories,
      dishes: [...dishLines, ...menuLines].slice(0, BRIEF_LIMITS.dishes),
      plan: plan.slice(0, BRIEF_LIMITS.plan),
      wishes: wishes.slice(0, BRIEF_LIMITS.wishes),
      eaten,
      pantry: pantryLines(parts.pantry).slice(0, BRIEF_LIMITS.pantry),
      basket: basket.slice(0, BRIEF_LIMITS.basket),
    },
  }
}

/** A whole recipe as text, starting with its ref. No empty lines: one recipe is one block. */
export function wholeRecipe(dish: Dish, ref: string, lang: 'en' | 'de', calories: boolean): string {
  const lines = [`${ref} | ${dish.name} | ${dish.recipe.servings ?? 0} servings`]
  if (dish.description) lines.push(dish.description.replace(/\s+/g, ' ').trim())
  const ingredients = (dish.recipe.ingredients ?? []).filter((ingredient) => ingredient.name.trim())
  lines.push('Ingredients:')
  if (ingredients.length === 0) lines.push('- (none written down)')
  for (const ingredient of ingredients) {
    const { amount, name } = formatIngredient(ingredient, 1, lang)
    lines.push(`- ${amount ? `${amount} ` : ''}${name}`)
  }
  const steps = (dish.recipe.steps ?? []).filter((step) => step.text.trim())
  lines.push('Steps:')
  if (steps.length === 0) lines.push('- (none written down)')
  for (const step of steps) lines.push(`- ${step.text.replace(/\s+/g, ' ').trim()}`)
  if (dish.recipe.notes?.trim()) lines.push(`Notes: ${dish.recipe.notes.replace(/\s+/g, ' ').trim()}`)
  const n = dish.nutrition
  if (calories && n.kcalPerServing) lines.push(`Per serving${n.isEstimate ? ' (an estimate)' : ''}: ${n.kcalPerServing} kcal${n.proteinG ? `, ${n.proteinG} g protein` : ''}${n.carbsG ? `, ${n.carbsG} g carbs` : ''}${n.fatG ? `, ${n.fatG} g fat` : ''}`)
  return lines.join('\n')
}

/**
 * The dishes a question names, the longest names first: their recipes go along at once,
 * so Fork does not have to ask for them. "Rösti" inside "Rösti mit Spiegelei" counts once,
 * for the longer one.
 */
export function namedIn(question: string, dishes: readonly Pick<Dish, 'id' | 'name'>[], limit = 2): ID[] {
  let rest = ` ${normalize(question)} `
  const found: ID[] = []
  for (const dish of [...dishes].sort((a, b) => b.name.length - a.name.length)) {
    const name = normalize(dish.name).trim()
    if (name.length < 3 || !rest.includes(name)) continue
    found.push(dish.id)
    rest = rest.split(name).join(' ')
    if (found.length >= limit) break
  }
  return found
}
