// What the other one did, for the bell on Today. Nothing here is stored in the cloud:
// every phone works its own news out from the changes a sync brings in. A change made
// on this phone never arrives that way, so it never becomes news for whoever made it.
//
// This file is the thinking only (no database, no React), so every rule is unit-tested.

import type { Day, Dish, ID, ISO, Member, Menu, Review, Serving, Slot, SyncTable, TableRows } from './types'

export type NewsKind =
  | 'proposed' // a new wish
  | 'planned' // a wish (or a new meal) got its day
  | 'moved' // a planned meal got another day or meal of the day
  | 'unplanned' // off the calendar, back on the wishlist
  | 'served' // on the table
  | 'eaten' // proof and verdict handed in
  | 'answered' // the cook answered the verdict
  | 'skipped'
  | 'removed'
  | 'hearts' // the eater said how much they want it
  | 'note' // a note was written or changed
  | 'cook' // somebody else cooks after all
  | 'dish' // a new dish in the recipe book
  | 'dishes' // several at once (an import): one line instead of thirty
  | 'menu'
  | 'joined' // the partner took their seat

export interface NewsFacts {
  /** The name at that moment, for when the dish is renamed or gone later. */
  name?: string
  day?: Day
  slot?: Slot | null
  hearts?: number
  reason?: string | null
  /** Who cooks from now on. */
  cookId?: ID
  /** True when the cook wrote words, false when it is only a face. */
  hasReply?: boolean
  /** How many, for the kinds that stand for several things. */
  count?: number
}

/** One line of news, before it is stored. */
export interface NewsDraft {
  kind: NewsKind
  /** When it happened: the row's own time, so news from three offline days sorts right. */
  at: ISO
  /** Who did it, when the change itself says so. Null when either of the two could have. */
  actorId: ID | null
  servingId?: ID
  dishId?: ID
  menuId?: ID
  facts: NewsFacts
}

/** One line of news as the phone keeps it. */
export interface NewsItem extends NewsDraft {
  id?: number
  /** Null until the list has been opened. */
  seenAt: ISO | null
}

type Row<T extends SyncTable> = TableRows[T]

const gone = (row: { deletedAt: ISO | null } | undefined): boolean => !row || row.deletedAt !== null

const cookOf = (serving: Pick<Serving, 'cookedBy' | 'proposedBy'>): ID | null => serving.cookedBy ?? serving.proposedBy

function servingNews(before: Serving | undefined, after: Serving, members: readonly Pick<Member, 'id'>[]): NewsDraft[] {
  const base = { at: after.updatedAt, servingId: after.id, ...(after.dishId ? { dishId: after.dishId } : {}), ...(after.menuId ? { menuId: after.menuId } : {}) }
  const cook = cookOf(after)
  // The eater is whoever is not the cook. Alone in the kitchen there is nobody else.
  const eater = members.find((member) => member.id !== cook)?.id ?? null
  const planned = { day: after.plannedDate ?? undefined, slot: after.plannedSlot }

  if (gone(before)) {
    if (after.deletedAt) return []
    if (after.status === 'wishlist') return [{ ...base, kind: 'proposed', actorId: after.proposedBy, facts: {} }]
    if (after.status === 'planned') return [{ ...base, kind: 'planned', actorId: after.proposedBy, facts: planned }]
    if (after.status === 'served') return [{ ...base, kind: 'served', actorId: cook, facts: {} }]
    // Eaten or skipped at first sight: old history arriving (a backup), not something that just happened.
    return []
  }
  const was = before as Serving
  if (after.deletedAt) return was.status === 'eaten' || was.status === 'skipped' ? [] : [{ ...base, kind: 'removed', actorId: null, facts: {} }]

  const news: NewsDraft[] = []
  if (was.status !== after.status) {
    if (after.status === 'planned' && (was.status === 'wishlist' || was.status === 'skipped')) news.push({ ...base, kind: 'planned', actorId: null, facts: planned })
    else if (after.status === 'wishlist' && was.status === 'planned') news.push({ ...base, kind: 'unplanned', actorId: null, facts: {} })
    else if (after.status === 'served' && was.status !== 'eaten') news.push({ ...base, kind: 'served', actorId: cook, facts: {} })
    else if (after.status === 'eaten') news.push({ ...base, kind: 'eaten', actorId: eater, facts: {} })
    else if (after.status === 'skipped') news.push({ ...base, kind: 'skipped', actorId: null, facts: { reason: after.skippedReason } })
  } else if (after.status === 'planned' && (was.plannedDate !== after.plannedDate || was.plannedSlot !== after.plannedSlot)) {
    news.push({ ...base, kind: 'moved', actorId: null, facts: planned })
  }

  const open = after.status === 'wishlist' || after.status === 'planned'
  if (cookOf(was) !== cook && cook) news.push({ ...base, kind: 'cook', actorId: null, facts: { cookId: cook } })
  // Hearts that were cleared because the cook changed are not news of their own.
  else if (open && after.craving !== null && was.craving !== after.craving) news.push({ ...base, kind: 'hearts', actorId: eater, facts: { hearts: after.craving } })
  if (open && after.note && was.note !== after.note) news.push({ ...base, kind: 'note', actorId: after.proposedBy, facts: {} })
  return news
}

function reviewNews(before: Review | undefined, after: Review): NewsDraft[] {
  if (after.deletedAt || !before) return []
  const face = before.chefReaction === null && after.chefReaction !== null
  const words = before.chefReply === null && after.chefReply !== null
  if (!face && !words) return []
  // Who cooked is on the meal, not on the verdict: the screen looks it up.
  return [{ kind: 'answered', at: after.updatedAt, actorId: null, servingId: after.servingId, ...(after.dishId ? { dishId: after.dishId } : {}), facts: { hasReply: after.chefReply !== null } }]
}

function recipeNews(kind: 'dish' | 'menu', before: Dish | Menu | undefined, after: Dish | Menu): NewsDraft[] {
  if (!gone(before) || after.deletedAt || after.archived) return []
  return [{ kind, at: after.createdAt, actorId: after.createdBy, ...(kind === 'dish' ? { dishId: after.id } : { menuId: after.id }), facts: { name: after.name } }]
}

function memberNews(before: Member | undefined, after: Member): NewsDraft[] {
  if (before || after.deletedAt) return []
  return [{ kind: 'joined', at: after.createdAt, actorId: after.id, facts: { name: after.name } }]
}

/**
 * What one changed row is worth telling. `before` is the row as this phone had it (or
 * nothing), `after` the row as it is once the change is in. `members` are the people of
 * the kitchen, to tell cook from eater.
 */
export function newsFrom<T extends SyncTable>(table: T, before: Row<T> | undefined, after: Row<T>, members: readonly Pick<Member, 'id'>[]): NewsDraft[] {
  switch (table) {
    case 'servings':
      return servingNews(before as Serving | undefined, after as Serving, members)
    case 'reviews':
      return reviewNews(before as Review | undefined, after as Review)
    case 'dishes':
      return recipeNews('dish', before as Dish | undefined, after as Dish)
    case 'menus':
      return recipeNews('menu', before as Menu | undefined, after as Menu)
    case 'members':
      return memberNews(before as Member | undefined, after as Member)
    default:
      return []
  }
}

/** More new dishes than this in one go is an import: one line says how many. */
export const MANY_DISHES = 4

/**
 * Tidy what one sync brought in before it is stored:
 * - what I certainly did myself (on my other device) is not news to me,
 * - a menu's answer sits on every course: one line per meal,
 * - a meal that arrives new and planned comes with its dish: the dish line is dropped
 *   when the meal's line already names it,
 * - many new dishes at once become one line.
 * Oldest first.
 */
export function tidyNews(drafts: readonly NewsDraft[], meId: ID | null): NewsDraft[] {
  let news = drafts.filter((draft) => draft.actorId === null || draft.actorId !== meId)

  const answered = new Set<ID>()
  news = news.filter((draft) => {
    if (draft.kind !== 'answered' || !draft.servingId) return true
    if (answered.has(draft.servingId)) return false
    answered.add(draft.servingId)
    return true
  })

  const mealDishes = new Set(news.filter((draft) => draft.servingId && draft.dishId && (draft.kind === 'proposed' || draft.kind === 'planned' || draft.kind === 'served')).map((draft) => draft.dishId))
  news = news.filter((draft) => !(draft.kind === 'dish' && mealDishes.has(draft.dishId)))

  const dishes = news.filter((draft) => draft.kind === 'dish')
  if (dishes.length > MANY_DISHES) {
    const latest = dishes.reduce((a, b) => (a.at >= b.at ? a : b))
    const actors = new Set(dishes.map((draft) => draft.actorId))
    news = [...news.filter((draft) => draft.kind !== 'dish'), { kind: 'dishes', at: latest.at, actorId: actors.size === 1 ? latest.actorId : null, facts: { count: dishes.length } }]
  }

  return [...news].sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1))
}

/** How much news a phone keeps: the newest lines, and nothing older than this many days. */
export const NEWS_KEEP = 80
export const NEWS_DAYS = 45

/** The ids of the lines that can go, given everything that is stored (any order). */
export function staleNews(items: readonly Pick<NewsItem, 'id' | 'at'>[], now: number = Date.now()): number[] {
  const newestFirst = [...items].sort((a, b) => (a.at === b.at ? (b.id ?? 0) - (a.id ?? 0) : a.at < b.at ? 1 : -1))
  const cutoff = new Date(now - NEWS_DAYS * 24 * 3_600_000).toISOString()
  return newestFirst.filter((item, index) => index >= NEWS_KEEP || item.at < cutoff).flatMap((item) => (item.id === undefined ? [] : [item.id]))
}

/** Where a tap on a line leads. A meal that waits for my proof goes straight to the camera. */
export function newsLink(item: Pick<NewsDraft, 'kind' | 'servingId' | 'dishId' | 'menuId'>, readerEats: boolean): string | null {
  if (item.kind === 'removed') return '/wishlist'
  if (item.servingId) return item.kind === 'served' && readerEats ? `/review/${item.servingId}` : `/serving/${item.servingId}`
  if (item.kind === 'dishes') return '/recipes'
  if (item.dishId) return `/recipes/${item.dishId}`
  if (item.menuId) return `/menus/${item.menuId}`
  return null
}
