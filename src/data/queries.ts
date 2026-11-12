// Read hooks. Every screen reads through these: they return undefined while loading,
// then live data that updates by itself when either phone changes something.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './app'
import { META } from './db'
import { NEWS_KEEP, type NewsItem } from './news'
import { describeRefused, type RefusedChange } from './refused'
import { MAX_UPLOAD_ATTEMPTS } from './sync'
import type { Criterion, Dish, Household, ID, ISO, Member, Menu, Review, Serving } from './types'

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

/** The order criteria are asked in. Two phones can hand out the same number; the older criterion then goes first. */
export function byCriterionOrder(a: Criterion, b: Criterion): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Every criterion that is not deleted, switched off ones too, in their order. */
export function useCriteria(): Criterion[] | undefined {
  return useLiveQuery(async () => alive(await db.criteria.toArray()).sort(byCriterionOrder), [])
}

/** How many reviews hold a score for each criterion. A criterion that was never rated is not in the map. */
export function useCriterionUse(): Map<ID, number> | undefined {
  return useLiveQuery(async () => {
    const use = new Map<ID, number>()
    for (const review of alive(await db.reviews.toArray())) for (const id of Object.keys(review.scores)) use.set(id, (use.get(id) ?? 0) + 1)
    return use
  }, [])
}

/** Changes the cloud refused and that wait for a decision on the Sync page, oldest first. */
export function useRefusedChanges(): RefusedChange[] | undefined {
  return useLiveQuery(async () => {
    const letters = await db.deadLetters.orderBy('seq').toArray()
    if (letters.length === 0) return []
    const [dishes, menus, servings, reviews, criteria] = await Promise.all([db.dishes.toArray(), db.menus.toArray(), db.servings.toArray(), db.reviews.toArray(), db.criteria.toArray()])
    const byId = <T extends { id: ID }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]))
    const kitchen = { dishes: byId(dishes), menus: byId(menus), servings: byId(servings), reviews: byId(reviews), criteria: byId(criteria) }
    return letters.map((letter) => describeRefused(letter, kitchen))
  }, [])
}

/** Photos the cloud refused so often that they wait for "Try again". */
export function useStuckUploads(): number | undefined {
  return useLiveQuery(async () => (await db.blobs.where('pending').equals(1).toArray()).filter((entry) => entry.attempts >= MAX_UPLOAD_ATTEMPTS).length, [])
}

/** When this device last saved a backup, or null. */
export function useLastBackupAt(): ISO | null | undefined {
  return useLiveQuery(async () => (await db.getMeta<ISO>(META.lastBackupAt)) ?? null, [])
}

// -------------------------------------------------------------------- news --

/** What the other one did, newest first (see news.ts). */
export function useNews(): NewsItem[] | undefined {
  return useLiveQuery(async () => (await db.news.toArray()).sort((a, b) => (a.at === b.at ? (b.id ?? 0) - (a.id ?? 0) : a.at < b.at ? 1 : -1)).slice(0, NEWS_KEEP), [])
}

/** How many lines of news nobody has looked at yet. */
export function useUnseenNews(): number | undefined {
  return useLiveQuery(() => db.news.filter((item) => item.seenAt === null).count(), [])
}
