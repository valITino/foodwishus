// The list behind the bell: what the other one did, newest first. Opening it is
// looking at it, so nothing in it counts as new afterwards.

import { useEffect, useState } from 'react'
import { navigate } from '../../app/router'
import { markNewsSeen } from '../../data/actions'
import { newsLink, type NewsItem } from '../../data/news'
import { useNews } from '../../data/queries'
import { useCopy, useLang } from '../../i18n'
import { formatTime, toDay } from '../../lib/dates'
import { Avatar, Card, cx, EmptyState, PageHeader, Screen } from '../../ui/components'
import { Icon, type IconName } from '../../ui/deco/Icon'
import { planningCopy } from '../planning/copy'
import { cookOf } from '../planning/logic'
import { useKitchen, useWhen, type Kitchen } from '../planning/shared'
import { newsCopy } from './copy'
import { newsLine, readerEats, type NewsContext } from './logic'

/** A small picture for a line nobody is named in. */
const KIND_ICON: Partial<Record<NewsItem['kind'], IconName>> = { planned: 'calendar', moved: 'calendar', unplanned: 'wishlist', served: 'today', eaten: 'check', skipped: 'close', removed: 'close', dish: 'book', dishes: 'book', menu: 'book', cook: 'today' }

function contextOf(kitchen: Kitchen, when: ReturnType<typeof useWhen>, goneName: string): NewsContext {
  const servings = new Map(kitchen.servings.map((serving) => [serving.id, serving]))
  return {
    meId: kitchen.meId,
    nameOf: (memberId) => kitchen.members.find((member) => member.id === memberId)?.name ?? '',
    mealName: (item) => (item.menuId ? kitchen.menus.get(item.menuId)?.name : item.dishId ? kitchen.dishes.get(item.dishId)?.name : undefined) ?? null,
    cookOf: (servingId) => {
      const serving = servings.get(servingId)
      return serving ? cookOf(serving) : null
    },
    when: (day, slot) => when.atInline(day, slot),
    goneName,
  }
}

export function NewsScreen() {
  const lang = useLang()
  const c = useCopy(newsCopy)
  const goneName = useCopy(planningCopy).shared.goneDish
  const kitchen = useKitchen()
  const news = useNews()
  const when = useWhen(kitchen?.today ?? toDay(new Date()))
  // What was new when the list opened, or arrives while it is open, keeps its mark for
  // as long as the person stays. Looking at the list is seeing it.
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    const unseen = (news ?? []).filter((item) => item.seenAt === null).flatMap((item) => (item.id === undefined ? [] : [item.id]))
    if (unseen.length === 0) return
    setFresh((before) => new Set([...before, ...unseen]))
    void markNewsSeen()
  }, [news])

  if (!kitchen || !news) {
    return (
      <Screen>
        <PageHeader title={c.title} backTo="/" />
      </Screen>
    )
  }

  const ctx = contextOf(kitchen, when, goneName)

  return (
    <Screen>
      <PageHeader title={c.title} backTo="/" />
      <main className="app-column px-4 pt-4">
        {news.length === 0 ? (
          <EmptyState title={c.emptyTitle} body={c.emptyBody} />
        ) : (
          <Card pad={false} className="overflow-hidden">
            <ul data-testid="news">
              {news.map((item) => {
                const actor = kitchen.members.find((member) => member.id === (item.kind === 'answered' && item.servingId ? ctx.cookOf(item.servingId) : item.actorId))
                const link = newsLink(item, readerEats(item, ctx))
                const isFresh = item.seenAt === null || (item.id !== undefined && fresh.has(item.id))
                const body = (
                  <>
                    {actor ? (
                      <Avatar avatar={actor.avatar} color={actor.color} accessory={actor.accessory} size={40} />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blush">
                        <Icon name={KIND_ICON[item.kind] ?? 'today'} size={20} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-sm leading-snug [overflow-wrap:anywhere]', isFresh ? 'font-extrabold' : 'font-semibold')}>{newsLine(item, ctx, c.lines)}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-soft">
                        {isFresh && <span className="rounded-full bg-cherry px-1.5 text-2xs font-extrabold leading-4.5 text-on-cherry">{c.fresh}</span>}
                        {c.at(when.day(toDay(item.at)), formatTime(item.at, lang))}
                      </span>
                    </span>
                  </>
                )
                return (
                  <li key={item.id} className="border-b border-line last:border-b-0" data-testid="news-line" data-kind={item.kind}>
                    {link ? (
                      <button type="button" onClick={() => navigate(link)} className="flex min-h-16 w-full items-center gap-3 p-3 text-left">
                        {body}
                      </button>
                    ) : (
                      <div className="flex min-h-16 items-center gap-3 p-3">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </main>
    </Screen>
  )
}
