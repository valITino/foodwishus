// Changes the cloud refused, said in a way a person can act on: what kind of thing it
// was, what it is called, and whether it was new, an edit or a removal. The Sync page
// turns this into words; the sync engine holds the two ways out ("Try again", "Discard").

import type { DeadLetter } from './db'
import type { Criterion, Dish, ID, ISO, Menu, Review, Serving, SyncTable } from './types'

export type RefusedThing = 'dish' | 'menu' | 'meal' | 'review' | 'criterion' | 'photo' | 'profile' | 'kitchen' | 'basket' | 'pantry'

export interface RefusedChange {
  /** Its number in the list of refused changes: what "Try again" and "Discard" ask for. */
  seq: number
  thing: RefusedThing
  /** new: it never reached the cloud. change: an edit. removal: a delete. */
  what: 'new' | 'change' | 'removal'
  /** The name of the dish, menu or criterion it is about, when one is known. */
  name: string | null
  failedAt: ISO
}

/** The rows a refused change can be about, as far as this device has them. */
export interface RefusedLookup {
  dishes: Map<ID, Pick<Dish, 'name'>>
  menus: Map<ID, Pick<Menu, 'name'>>
  servings: Map<ID, Pick<Serving, 'dishId' | 'menuId'>>
  reviews: Map<ID, Pick<Review, 'dishId' | 'servingId'>>
  criteria: Map<ID, Pick<Criterion, 'label'>>
}

const THINGS: Record<SyncTable, RefusedThing> = {
  households: 'kitchen',
  members: 'profile',
  criteria: 'criterion',
  dishes: 'dish',
  menus: 'menu',
  servings: 'meal',
  reviews: 'review',
  photos: 'photo',
  basket: 'basket',
  pantry: 'pantry',
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
const id = (value: unknown): ID | null => (typeof value === 'string' ? value : null)

export function describeRefused(letter: DeadLetter, kitchen: RefusedLookup): RefusedChange {
  const { table, rowId, data } = letter
  const mealName = (dishId: ID | null, menuId: ID | null): string | null => (dishId ? kitchen.dishes.get(dishId)?.name : menuId ? kitchen.menus.get(menuId)?.name : null) ?? null

  let name: string | null = null
  if (table === 'dishes') name = kitchen.dishes.get(rowId)?.name ?? text(data.name)
  else if (table === 'menus') name = kitchen.menus.get(rowId)?.name ?? text(data.name)
  else if (table === 'criteria') name = kitchen.criteria.get(rowId)?.label ?? text(data.label)
  else if (table === 'basket' || table === 'pantry') name = text(data.name)
  else if (table === 'servings') {
    const serving = kitchen.servings.get(rowId)
    name = mealName(serving?.dishId ?? id(data.dishId), serving?.menuId ?? id(data.menuId))
  } else if (table === 'reviews') {
    const review = kitchen.reviews.get(rowId)
    const dishId = review?.dishId ?? id(data.dishId)
    name = dishId ? (kitchen.dishes.get(dishId)?.name ?? null) : null
    if (!name) {
      const serving = kitchen.servings.get(review?.servingId ?? id(data.servingId) ?? '')
      name = serving ? mealName(serving.dishId, serving.menuId) : null
    }
  }

  const what = letter.kind === 'put' ? 'new' : typeof data.deletedAt === 'string' ? 'removal' : 'change'
  return { seq: letter.seq as number, thing: THINGS[table], what, name, failedAt: letter.failedAt }
}
