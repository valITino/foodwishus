// A few lines for the bell in the demo kitchen, so it shows what it is for. The demo
// has no second phone and no sync, so these are picked from its own story: what Mia
// did lately, read through Leo's eyes.

import type { NewsItem } from '../news'
import type { Review, Serving } from '../types'
import type { DemoKitchen } from './history'

const newest = <T extends { updatedAt: string }>(rows: T[]): T[] => [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

/** Up to five lines, oldest first. The two newest are still unread. */
export function demoNews(rows: { servings: Serving[]; reviews: Review[] }, kitchen: DemoKitchen): NewsItem[] {
  const hers = rows.servings.filter((serving) => !serving.deletedAt && serving.proposedBy === kitchen.chefId)
  const of = (serving: Serving) => ({ servingId: serving.id, ...(serving.dishId ? { dishId: serving.dishId } : {}), ...(serving.menuId ? { menuId: serving.menuId } : {}) })

  const answer = newest(rows.reviews.filter((review) => !review.deletedAt && review.reviewerId === kitchen.tasterId && review.chefReply !== null))[0]
  const planned = newest(hers.filter((serving) => serving.status === 'planned' && serving.plannedDate !== null)).slice(0, 2)
  const wishes = newest(hers.filter((serving) => serving.status === 'wishlist')).slice(0, 2)

  const lines: NewsItem[] = [
    ...(answer ? [{ kind: 'answered' as const, at: answer.updatedAt, actorId: null, servingId: answer.servingId, ...(answer.dishId ? { dishId: answer.dishId } : {}), facts: { hasReply: true }, seenAt: null }] : []),
    ...planned.map((serving) => ({ kind: 'planned' as const, at: serving.updatedAt, actorId: kitchen.chefId, ...of(serving), facts: { day: serving.plannedDate ?? undefined, slot: serving.plannedSlot }, seenAt: null })),
    ...wishes.map((serving) => ({ kind: 'proposed' as const, at: serving.updatedAt, actorId: kitchen.chefId, ...of(serving), facts: {}, seenAt: null })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))

  return lines.map((line, index) => ({ ...line, seenAt: index >= lines.length - 2 ? null : line.at }))
}
