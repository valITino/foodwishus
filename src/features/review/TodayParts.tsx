// What Today shows about verdicts and photos:
//   EatenToday     today's eaten meals with their seal; for the cook, "The verdict is in"
//   PhotoWallCard  the way to the photo wall

import { navigate } from '../../app/router'
import { useReviews } from '../../data/queries'
import type { Review, Serving } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { diffDays } from '../../lib/dates'
import { Card, PhotoImg, REACTION_EMOJI, Tag } from '../../ui/components'
import { Mascot, WaxSeal } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { planningCopy } from '../planning/copy'
import { eatenDay, roleIn } from '../planning/logic'
import { MealThumb, useMealInfo, useWhen, type Kitchen } from '../planning/shared'
import { reviewCopy } from './copy'
import { awaitsGuess, mealVerdicts, sharedReaction, verdictDishIds, wallPhotos, type Verdict } from './logic'

const verdictsOf = (serving: Serving, kitchen: Kitchen, reviews: Review[]): Verdict[] => mealVerdicts(serving, verdictDishIds(serving, kitchen.menus), reviews)

/** I cooked this and have not guessed yet: the Taster's verdict stays covered wherever it could show. */
export function verdictCovered(serving: Serving, kitchen: Kitchen, reviews: Review[]): boolean {
  return kitchen.partner !== null && roleIn(serving, kitchen.meId) === 'cook' && awaitsGuess(verdictsOf(serving, kitchen, reviews), kitchen.meId)
}

/** The Taster has handed in, and the cook has not looked yet. */
export function verdictWaits(serving: Serving, kitchen: Kitchen, reviews: Review[]): boolean {
  return serving.status === 'eaten' && verdictCovered(serving, kitchen, reviews)
}

/** For the cook: the Taster has handed in. A guess first, then the truth. */
function VerdictIn({ serving, kitchen }: { serving: Serving; kitchen: Kitchen }) {
  const c = useCopy(reviewCopy)
  const when = useWhen(kitchen.today)
  const meal = useMealInfo()(serving, kitchen)
  const open = () => navigate(`/serving/${serving.id}`)
  return (
    <Card tone="paper" raised pad={false} data-testid="verdict-in">
      <div className="flex gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <Tag tone="butter">
            <Icon name="check" size={13} /> {when.at(eatenDay(serving) ?? kitchen.today, serving.plannedSlot)}
          </Tag>
          <h2 className="mt-2 text-xl">{c.today.verdictIn}</h2>
          <p className="mt-1 text-sm text-ink-soft">{c.today.verdictInBody(kitchen.partner?.name ?? '', meal.name)}</p>
        </div>
        <Mascot size={74} mood="love" className="-mr-1 shrink-0" />
      </div>
      <div className="px-4 pb-5">
        <button type="button" onClick={open} className="flex min-h-13 w-full items-center gap-3 rounded-2xl bg-blush px-4 py-2.5 text-left">
          <Icon name="today" size={22} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-extrabold">{c.today.verdictOpen}</span>
            <span className="block text-xs">{c.today.verdictOpenHint}</span>
          </span>
        </button>
      </div>
    </Card>
  )
}

/** How long "The verdict is in" stays on Today when nobody opens it. */
const NEWS_DAYS = 7

/** Today's eaten meals. Each one wears its seal. */
export function EatenToday({ servings, kitchen }: { servings: Serving[]; kitchen: Kitchen }) {
  const t = useT()
  const eatenToday = useCopy(planningCopy).today.eatenToday
  const mealInfo = useMealInfo()
  const reviews = useReviews()
  if (!reviews) return null

  // A verdict she has not opened yet is still news the next morning, and for a week after.
  const news = kitchen.servings
    .filter((serving) => {
      const day = eatenDay(serving)
      return day !== null && diffDays(day, kitchen.today) < NEWS_DAYS && verdictWaits(serving, kitchen, reviews)
    })
    .sort((a, b) => ((a.eatenAt ?? '') < (b.eatenAt ?? '') ? 1 : -1))
  const rest = servings.filter((serving) => !news.includes(serving))

  return (
    <>
      {news.map((serving) => (
        <VerdictIn key={serving.id} serving={serving} kitchen={kitchen} />
      ))}
      {rest.length > 0 && (
        <Card pad={false} className="divide-y divide-line" data-testid="eaten-today">
          {rest.map((serving) => {
            const meal = mealInfo(serving, kitchen)
            const face = sharedReaction(verdictsOf(serving, kitchen, reviews))
            return (
              <button key={serving.id} type="button" onClick={() => navigate(`/serving/${serving.id}`)} className="flex w-full items-center gap-3 p-3 text-left">
                <MealThumb info={meal} seed={serving.id} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-extrabold leading-snug">{meal.name}</span>
                  <span className="block text-xs text-ink-soft">{eatenToday}</span>
                </span>
                {face !== null && (
                  <span aria-hidden className="text-2xl leading-none">
                    {REACTION_EMOJI[face]}
                  </span>
                )}
                <WaxSeal size={44} text={t.review.sealText} label={t.review.sealLabel} className="shrink-0 -rotate-12" />
              </button>
            )
          })}
        </Card>
      )}
    </>
  )
}

const STACK = [
  { left: 0, top: 6, rotate: -9 },
  { left: 14, top: 0, rotate: 5 },
  { left: 27, top: 7, rotate: -2 },
]

/** The one way to the photo wall: a little stack of the latest polaroids. */
export function PhotoWallCard({ kitchen }: { kitchen: Kitchen }) {
  const c = useCopy(reviewCopy)
  const photos = wallPhotos(kitchen.servings)
  // Oldest of the three at the bottom of the stack, the newest on top.
  const latest = photos.slice(0, 3).reverse()
  return (
    <Card pad={false} data-testid="wall-link">
      <button type="button" onClick={() => navigate('/photos')} className="flex min-h-20 w-full items-center gap-4 px-4 py-3 text-left">
        <span aria-hidden className="relative block h-16 w-[4.75rem] shrink-0">
          {latest.length === 0 ? (
            <span className="absolute left-3 top-1 block -rotate-6 rounded-[2px] bg-[#fffefa] p-[3px] pb-[10px] shadow-paper">
              <span className="grid size-11 place-items-center rounded-[1px] bg-[#f6ebe4] text-[#4a383380]">
                <Icon name="camera" size={22} />
              </span>
            </span>
          ) : (
            latest.map((photo, index) => {
              const place = STACK[index + (3 - latest.length)]
              return (
                <span key={photo.photoId} className="absolute block rounded-[2px] bg-[#fffefa] p-[3px] pb-[10px] shadow-paper" style={{ left: place.left, top: place.top, rotate: `${place.rotate}deg` }}>
                  <PhotoImg photoId={photo.photoId} alt="" className="block size-11 rounded-[1px]" />
                </span>
              )
            })
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold leading-tight font-soft">{c.today.wall}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">{photos.length === 0 ? c.today.wallEmpty : c.today.wallCount(photos.length)}</span>
        </span>
      </button>
    </Card>
  )
}
