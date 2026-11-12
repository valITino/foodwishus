// The app's way to the kitchen's helper (the Edge Function "ai"). Screens call these;
// they never talk to the backend themselves. The helper needs a connection, so nothing
// here is queued: it answers now or says why not.

import { backend, db, isDemo } from './app'
import { BackendError, type HelperFailure, type HelperRequest, type PantryNotesResult, type RecipeFromLinkResult, type ResultOf, type ShoppingCheck, type ShoppingCheckResult } from './backend'
import type { BasketItem, Dish, Menu, PantryItem, Serving } from './types'

/** Why a link could not be read. The helper's own words, plus two only the app knows. */
export type ReadProblem = HelperFailure | 'offline' | 'demo'

export class ReadError extends Error {
  constructor(readonly code: ReadProblem) {
    super(code)
    this.name = 'ReadError'
  }
}

export interface ReadOptions {
  lang: 'en' | 'de'
  translate: boolean
  metric: boolean
  photo: boolean
}

const KNOWN: readonly HelperFailure[] = ['bad_request', 'not_signed_in', 'not_member', 'limit', 'bad_link', 'blocked', 'unreachable', 'too_big', 'not_a_page', 'not_a_recipe', 'helper_off', 'helper_down']

/** What went wrong, in one of the words the screens have a sentence for. */
export function readProblem(error: unknown): ReadProblem {
  if (error instanceof ReadError) return error.code
  if (!(error instanceof BackendError)) return 'helper_down'
  if (error.kind === 'network') return 'offline'
  if (error.kind === 'auth') return 'not_signed_in'
  return KNOWN.find((code) => code === error.code) ?? 'helper_down'
}

/** The tags the kitchen uses most, so the helper reuses them instead of inventing near-twins. */
export function mostUsedTags(dishes: { tags: string[]; deletedAt?: string | null }[], limit = 30): string[] {
  const counts = new Map<string, number>()
  for (const dish of dishes) if (!dish.deletedAt) for (const tag of dish.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag)
}

/** One question to the helper. Rejects with a ReadError that says, in one word, why not. */
async function ask<R extends HelperRequest>(request: R): Promise<ResultOf<R>> {
  // The demo kitchen lives on this phone only: there is no kitchen in the cloud to ask for it.
  if (isDemo) throw new ReadError('demo')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ReadError('offline')
  try {
    return await backend.askHelper(request)
  } catch (error) {
    throw new ReadError(readProblem(error))
  }
}

/** Have a recipe page read. Rejects with a ReadError. */
export async function readRecipe(link: string, options: ReadOptions): Promise<RecipeFromLinkResult> {
  if (isDemo) throw new ReadError('demo')
  const knownTags = mostUsedTags(await db.dishes.toArray())
  return ask({ job: 'recipe-from-link', link, ...options, knownTags })
}

/** Have Fork compare the planned meals with the pantry. Rejects with a ReadError. */
export function checkShopping(request: Omit<ShoppingCheck, 'job'>): Promise<ShoppingCheckResult> {
  return ask({ job: 'shopping-check', ...request })
}

/** Have Fork turn a sentence about what is at home into pantry lines. Rejects with a ReadError. */
export async function sortPantryNotes(text: string, lang: 'en' | 'de'): Promise<PantryNotesResult> {
  if (isDemo) throw new ReadError('demo')
  const known = (await db.pantry.toArray()).filter((item) => !item.deletedAt).map((item) => item.name)
  return ask({ job: 'pantry-notes', lang, text, known })
}

/** The kitchen as it is on this phone right now, for working out what the plan asks for. */
export interface KitchenNow {
  servings: Serving[]
  dishes: Dish[]
  menus: Menu[]
  pantry: PantryItem[]
  basket: BasketItem[]
}

export async function kitchenNow(): Promise<KitchenNow> {
  const [servings, dishes, menus, pantry, basket] = await Promise.all([db.servings.toArray(), db.dishes.toArray(), db.menus.toArray(), db.pantry.toArray(), db.basket.toArray()])
  const alive = <T extends { deletedAt: string | null }>(rows: T[]): T[] => rows.filter((row) => !row.deletedAt)
  return { servings: alive(servings), dishes: alive(dishes), menus: alive(menus), pantry: alive(pantry), basket: alive(basket) }
}
