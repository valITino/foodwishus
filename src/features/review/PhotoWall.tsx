// The photo wall: every proof photo as a polaroid, newest first. A tap opens the meal.

import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '../../app/router'
import { useReviews } from '../../data/queries'
import { useCopy, useLang, useT } from '../../i18n'
import { formatDay, toDay } from '../../lib/dates'
import { Button, Card, EmptyState, PageHeader, PhotoImg, Polaroid, REACTION_EMOJI, Screen } from '../../ui/components'
import { planningCopy } from '../planning/copy'
import { onTheTable } from '../planning/logic'
import { useKitchen, useMealInfo } from '../planning/shared'
import { reviewCopy } from './copy'
import { canJudge, mealVerdicts, tiltOf, verdictDishIds, wallPhotos, type WallPhoto } from './logic'
import { verdictCovered } from './TodayParts'

/** How many polaroids go up at a time. More follow while scrolling. */
const BATCH = 24
const TAPES = ['rose', 'sage', 'butter'] as const

export function PhotoWallScreen() {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const goneDish = useCopy(planningCopy).shared.goneDish
  const kitchen = useKitchen()
  const reviews = useReviews()
  const mealInfo = useMealInfo()
  const [shown, setShown] = useState(BATCH)
  const more = useRef<HTMLDivElement>(null)

  const photos = useMemo(() => (kitchen ? wallPhotos(kitchen.servings) : []), [kitchen])
  const rest = photos.length - shown

  // Reaching the end of the wall hangs up the next batch. The button does the same by hand.
  useEffect(() => {
    const end = more.current
    if (!end || rest <= 0 || typeof IntersectionObserver === 'undefined') return
    const watcher = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setShown((n) => n + BATCH), { rootMargin: '400px' })
    watcher.observe(end)
    return () => watcher.disconnect()
  }, [rest])

  if (!kitchen || !reviews) {
    return (
      <Screen>
        <PageHeader title={c.wall.title} backTo="/" />
      </Screen>
    )
  }

  // Month by month, like pages of an album.
  const months: { month: string; photos: WallPhoto[] }[] = []
  for (const photo of photos.slice(0, shown)) {
    const month = toDay(photo.takenAt).slice(0, 7)
    const last = months[months.length - 1]
    if (last?.month === month) last.photos.push(photo)
    else months.push({ month, photos: [photo] })
  }

  const waiting = onTheTable(kitchen.servings).find((serving) => canJudge(serving, kitchen.meId, kitchen.partner !== null))

  return (
    <Screen>
      <PageHeader title={c.wall.title} backTo="/" />
      <main className="app-column px-4 pt-4">
        {photos.length === 0 ? (
          <Card pad={false} data-testid="wall-empty">
            <EmptyState
              title={c.wall.emptyTitle}
              body={c.wall.emptyBody}
              action={waiting ? <Button onClick={() => navigate(`/review/${waiting.id}`)}>{t.actions.takeProof}</Button> : <Button onClick={() => navigate('/wishlist')}>{c.wall.emptyAction}</Button>}
            />
          </Card>
        ) : (
          <div data-testid="wall">
            {months.map(({ month, photos: list }) => (
              <section key={month} aria-labelledby={`wall-${month}`} className="pb-8">
                <h2 id={`wall-${month}`} className="mb-5 px-1 pt-1 text-lg first-letter:uppercase">
                  {formatDay(`${month}-01`, lang, 'month')}
                </h2>
                <ul className="grid grid-cols-2 gap-x-5 gap-y-8 px-1.5">
                  {list.map((photo, index) => {
                    const meal = mealInfo(photo.serving, kitchen)
                    const name = photo.courseDishId ? (kitchen.dishes.get(photo.courseDishId)?.name ?? goneDish) : meal.name
                    const day = toDay(photo.takenAt)
                    // The face stays hidden from a cook who has not guessed yet.
                    const verdicts = verdictCovered(photo.serving, kitchen, reviews) ? [] : mealVerdicts(photo.serving, verdictDishIds(photo.serving, kitchen.menus), reviews)
                    const face = (photo.courseDishId ? verdicts.find((verdict) => verdict.dishId === photo.courseDishId) : verdicts[0])?.review?.reaction ?? null
                    return (
                      <li key={photo.photoId} className="relative" data-testid="wall-photo">
                        <div className="relative">
                          <Polaroid caption={formatDay(day, lang, 'date-short')} source={photo.source === 'gallery' ? 'gallery' : undefined} tilt={tiltOf(photo.photoId, 2.5)} tape={TAPES[index % TAPES.length]}>
                            <PhotoImg photoId={photo.photoId} alt="" className="size-full" />
                          </Polaroid>
                          {face !== null && (
                            <span aria-hidden className="absolute -right-2 bottom-10 grid size-9 place-items-center rounded-full bg-[#fffefa] text-xl leading-none shadow-paper">
                              {REACTION_EMOJI[face]}
                            </span>
                          )}
                        </div>
                        <p className="mt-2.5 line-clamp-2 text-center text-xs font-extrabold leading-tight">{name}</p>
                        <button type="button" aria-label={c.wall.open(name, formatDay(day, lang, 'full'))} className="absolute inset-0 rounded-paper" onClick={() => navigate(`/serving/${photo.serving.id}`)} />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {rest > 0 && (
              <div ref={more} className="flex justify-center pb-6">
                <Button variant="secondary" onClick={() => setShown((n) => n + BATCH)}>
                  {c.wall.more}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </Screen>
  )
}
