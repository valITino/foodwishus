// Read hooks. Every screen reads through these: they return undefined while loading,
// then live data that updates by itself when either phone changes something.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './app'
import { META } from './db'
import type { Criterion, Dish, Household, ID, Member, Menu, Review, Serving } from './types'

const alive = <T extends { deletedAt: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt)

/** Wishlist order: fractional index, compared as plain strings; id breaks ties. */
export function byPriority(a: Serving, b: Serving): number {
  if (a.priority !== b.priority) return a.priority < b.priority ? -1 : 1
  return a.id < b.id ? -1 : 1
}

export function useHousehold(): Household | undefined {
  return useLiveQuery(async () => (await db.households.toArray()).find((h) => !h.deletedAt), [])
}

export function useMembers(): Member[] | undefined {
  return useLiveQuery(async () => alive(await db.members.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [])
}

/** The other person in the kitchen, or null while you are still alone. */
export function usePartner(): Member | null | undefined {
  return useLiveQuery(async () => {
    const mine = await db.getMeta<ID>(META.memberId)
    return alive(await db.members.toArray()).find((m) => m.id !== mine) ?? null
  }, [])
}

export function useDishes(options: { includeArchived?: boolean } = {}): Dish[] | undefined {
  const { includeArchived = false } = options
  return useLiveQuery(
    async () => alive(await db.dishes.toArray()).filter((d) => includeArchived || !d.archived),
    [includeArchived],
  )
}

/** undefined while loading, null when there is no such dish. */
export function useDish(id: ID | undefined): Dish | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const dish = await db.dishes.get(id)
    return dish && !dish.deletedAt ? dish : null
  }, [id])
}

export function useMenus(options: { includeArchived?: boolean } = {}): Menu[] | undefined {
  const { includeArchived = false } = options
  return useLiveQuery(
    async () => alive(await db.menus.toArray()).filter((m) => includeArchived || !m.archived),
    [includeArchived],
  )
}

export function useMenu(id: ID | undefined): Menu | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const menu = await db.menus.get(id)
    return menu && !menu.deletedAt ? menu : null
  }, [id])
}

/** All servings that are not deleted, in wishlist order. */
export function useServings(): Serving[] | undefined {
  return useLiveQuery(async () => alive(await db.servings.toArray()).sort(byPriority), [])
}

export function useServing(id: ID | undefined): Serving | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const serving = await db.servings.get(id)
    return serving && !serving.deletedAt ? serving : null
  }, [id])
}

export function useReviews(): Review[] | undefined {
  return useLiveQuery(async () => alive(await db.reviews.toArray()), [])
}

export function useCriteria(): Criterion[] | undefined {
  return useLiveQuery(async () => alive(await db.criteria.toArray()).sort((a, b) => a.sortOrder - b.sortOrder), [])
}
