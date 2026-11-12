// The basket (the shared shopping list) and the pantry: the rules, free of screens and
// of the database, so each one is unit-tested. Amounts are kept as written ("500 g",
// "half a pack"): a shopping list is read by people, and the helper reads words too.

import { covers, nameWords, sameThing, type Line } from '../../data/basket'
import type { BasketItem, Day, Dish, ID, Ingredient, Menu, PantryItem, Serving } from '../../data/types'
import { formatAmount, formatIngredient, parseIngredientLine, type Lang } from '../recipes/logic'

export { adding, covers, groupBasket, intoPantry, sameThing, sortPantry, stocking, type Adding, type BasketGroups, type Line } from '../../data/basket'


const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * What a typed line means, whichever way round it was typed:
 * "2 l milk" and "Milk 2 l" → Milk, 2 l. "Butter" → Butter. Null for an empty line.
 */
export function parseLine(input: string, lang: Lang): Line | null {
  const text = input.replace(/\s+/g, ' ').replace(/^[-*•]\s*/, '').trim()
  if (!text) return null
  // The shopping-list way round: the thing first, how much after it.
  const tail = /^(\D.*?)[,:]?\s+(\d+(?:[.,]\d+)?(?:\s?[\p{L}.]{1,12})?)$/u.exec(text)
  if (tail && !/\d/.test(tail[1])) return { name: capital(tail[1].trim()).slice(0, 80), amount: tail[2].trim().slice(0, 40) }
  const parsed = parseIngredientLine(text)
  if (!parsed) return null
  if (parsed.quantity === undefined) return { name: capital(parsed.name).slice(0, 80), amount: null }
  const { amount, name } = formatIngredient(parsed, 1, lang)
  return { name: capital(name).slice(0, 80), amount: amount.slice(0, 40) || null }
}

/** Several lines at once (pasted, or dictated with commas): one thing per line or per comma. */
export function parseLines(input: string, lang: Lang): Line[] {
  return input
    .split(/\r?\n|;|,(?!\d)/)
    .map((part) => parseLine(part, lang))
    .filter((line): line is Line => line !== null)
}

// ------------------------------------------------- what the plan asks for --

export interface PlannedMeal {
  servingId: ID
  day: Day
  dishId: ID
  dishName: string
  ingredients: Ingredient[]
}

/** The meals with a day in the window, each course of a menu on its own, in the order they come. */
export function plannedMeals(servings: readonly Serving[], dishes: readonly Dish[], menus: readonly Menu[], from: Day, to: Day): PlannedMeal[] {
  const dishById = new Map(dishes.filter((dish) => !dish.deletedAt).map((dish) => [dish.id, dish]))
  const menuById = new Map(menus.filter((menu) => !menu.deletedAt).map((menu) => [menu.id, menu]))
  const meals: PlannedMeal[] = []
  for (const serving of [...servings].sort((a, b) => ((a.plannedDate ?? '') < (b.plannedDate ?? '') ? -1 : 1))) {
    if (serving.deletedAt || serving.status !== 'planned' || !serving.plannedDate || serving.plannedDate < from || serving.plannedDate > to) continue
    const ids = serving.dishId ? [serving.dishId] : serving.menuId ? [...(menuById.get(serving.menuId)?.courses ?? [])].sort((a, b) => a.order - b.order).map((course) => course.dishId) : []
    for (const id of ids) {
      const dish = dishById.get(id)
      if (dish) meals.push({ servingId: serving.id, day: serving.plannedDate, dishId: dish.id, dishName: dish.name, ingredients: dish.recipe.ingredients ?? [] })
    }
  }
  return meals
}

/** What nobody writes on a shopping list: it is simply there. */
const SEASONING = new Set(['salz', 'salt', 'pfeffer', 'pepper'])
const WATER = new Set(['wasser', 'water'])
const LITTLE_WORDS = new Set(['and', 'und', 'or', 'oder', 'of', 'for', 'the', 'fur', 'das', 'die', 'der', 'zum', 'a', 'some', 'etwas', 'plenty', 'viel', 'black', 'schwarzer', 'schwarz', 'freshly', 'frisch', 'ground', 'gemahlener', 'gemahlen', 'sea', 'meer', 'lukewarm', 'lauwarmes', 'warm', 'warmes', 'cold', 'kaltes', 'hot', 'heisses', 'boiling', 'kochendes'])

/**
 * Salt, pepper and water, however the recipe puts it: "salt and pepper", "plenty of
 * black pepper", "160 ml lukewarm water", "salt for the pasta water".
 */
export function isAlwaysThere(ingredient: Ingredient): boolean {
  const words = nameWords(ingredient.name)
  if (words.length === 0) return false
  if (WATER.has(words[words.length - 1])) return true
  // "2 peppers" are vegetables: a count without a unit is not a seasoning.
  if (ingredient.quantity !== undefined && !ingredient.unit) return false
  if (words.every((word) => SEASONING.has(word) || WATER.has(word) || LITTLE_WORDS.has(word))) return words.some((word) => SEASONING.has(word) || WATER.has(word))
  // "Salt for the pasta water", "Pfeffer aus der Mühle": seasoning without an amount, whatever comes after.
  return ingredient.quantity === undefined && SEASONING.has(words[0])
}

export interface Need extends Line {
  /** The first meal that asks for it. */
  dishId: ID
  dishName: string
  day: Day
  /** How many planned meals ask for it. */
  meals: number
}

/**
 * The ingredients of the planned meals that are neither at home (by name) nor on the
 * basket already. The same thing asked for by two meals is one line; its amounts add up
 * when they are in the same unit, and stand side by side when they are not.
 */
export function needs(meals: readonly PlannedMeal[], pantry: readonly PantryItem[], basket: readonly BasketItem[], lang: Lang): Need[] {
  const atHome = pantry.filter((row) => !row.deletedAt)
  const listed = basket.filter((item) => !item.deletedAt && item.state !== 'bought')
  const found: (Need & { parts: Ingredient[]; askedBy: Set<string> })[] = []
  for (const meal of meals) {
    const asker = `${meal.servingId}/${meal.dishId}`
    for (const ingredient of meal.ingredients) {
      if (!ingredient.name.trim() || isAlwaysThere(ingredient)) continue
      if (atHome.some((row) => covers(row.name, ingredient.name))) continue
      if (listed.some((item) => covers(item.name, ingredient.name))) continue
      const same = found.find((need) => sameThing(need.name, ingredient.name))
      if (same) {
        same.parts.push(ingredient)
        same.askedBy.add(asker)
        continue
      }
      found.push({ name: capital(ingredient.name.split(/[,(]/)[0].trim()), amount: null, dishId: meal.dishId, dishName: meal.dishName, day: meal.day, meals: 1, parts: [ingredient], askedBy: new Set([asker]) })
    }
  }
  return found.map(({ parts, askedBy, ...need }) => ({ ...need, meals: askedBy.size, amount: sumAmounts(parts, lang) }))
}

/** "200 g" and "300 g" are "500 g"; "1 onion" and "200 g" stay "1 + 200 g"; nothing given stays nothing. */
export function sumAmounts(parts: readonly Ingredient[], lang: Lang): string | null {
  const totals = new Map<string, { quantity: number; parts: number }>()
  for (const part of parts) {
    if (part.quantity === undefined) continue
    const unit = (part.unit ?? '').trim()
    const total = totals.get(unit) ?? { quantity: 0, parts: 0 }
    totals.set(unit, { quantity: total.quantity + part.quantity, parts: total.parts + 1 })
  }
  const texts = [...totals.entries()].map(([unit, total]) => {
    // One amount stays as it was written; a sum is rounded the way a kitchen scale would (1200 g is 1.2 kg).
    if (total.parts === 1) return formatIngredient({ quantity: total.quantity, unit: unit || undefined, name: '' }, 1, lang).amount
    const { quantity, unit: shown } = formatAmount(total.quantity, unit || undefined, lang)
    return shown ? `${quantity} ${shown}` : quantity
  })
  return texts.length > 0 ? texts.join(' + ').slice(0, 40) : null
}

// ------------------------------------------------------- words for the helper --

/** The planned meals as lines the helper reads: "Thu 2026-11-12: Rüeblisuppe: 500 g Rüebli; 1 Zwiebel". */
export function mealLines(meals: readonly PlannedMeal[], lang: Lang): string[] {
  return meals.map((meal) => {
    const lines = meal.ingredients.map((ingredient) => {
      const { amount, name } = formatIngredient(ingredient, 1, lang)
      return amount ? `${amount} ${name}` : name
    })
    return `${meal.day}: ${meal.dishName}: ${lines.length > 0 ? lines.join('; ') : '(no ingredients written down)'}`
  })
}

/** The pantry as lines the helper reads, with how old each note is: "Mehl: 1 kg (noted 3 days ago)". */
export function pantryLines(pantry: readonly PantryItem[], now: number = Date.now()): string[] {
  return pantry
    .filter((row) => !row.deletedAt)
    .map((row) => {
      const days = Math.max(0, Math.floor((now - new Date(row.updatedAt).getTime()) / 86_400_000))
      return `${row.name}: ${row.amount ?? 'there, amount not noted'} (noted ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`})`
    })
}
