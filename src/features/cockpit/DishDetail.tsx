// The dish in numbers: where every tap on a dish, a bar or a point in the Cockpit
// leads. Its whole history, whatever the Cockpit's filter says: photos, every review,
// the reactions, the averages, and the way to the recipe.

import { useMemo } from 'react'
import { navigate } from '../../app/router'
import { chipLabel } from '../../content/chips'
import { usePref } from '../../data/prefs'
import type { ExtraReaction, ID, Reaction } from '../../data/types'
import { useT } from '../../i18n'
import { formatDay } from '../../lib/dates'
import { mean, totalMinutes, type Meal, type Plate } from '../../lib/stats'
import { Button, Card, EmptyState, PageHeader, PhotoImg, Polaroid, REACTION_EMOJI, Screen, Stat, SteamLoader, Tag } from '../../ui/components'
import { BarList } from './charts/BarList'
import { ChartCard, Readout, usePick } from './charts/base'
import { LineChart } from './charts/LineChart'
import { useKitchen, useWords, type Kitchen, type Words } from './data'
import { activeChips } from './filter'
import { useFilter } from './filterStore'
import { Group, Thumb } from './parts'
import { useDuration } from './sections/Food'

const EXTRA_EMOJI: Record<ExtraReaction, string> = { love: '❤️', fire: '🔥', 'chef-queen': '👑', 'needs-salt': '🧂', 'too-spicy': '🌶️', again: '🔁' }
const FIVE = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))
const TILTS = [-2, 1.5, -1, 2]
const TAPES = ['rose', 'sage', 'butter'] as const

interface Visit {
  meal: Meal
  plate: Plate
}

function Photos({ visits, name, w }: { visits: Visit[]; name: string; w: Words }) {
  const c = w.c.detail
  // Newest first. A photo of the whole table counts for every dish on it.
  const photos = [...visits].reverse().flatMap(({ meal, plate }) =>
    meal.serving.proofPhotos.filter((proof) => !proof.courseDishId || proof.courseDishId === plate.dishId).map((proof) => ({ proof, day: meal.day })),
  )
  return (
    <Group id="photos" title={c.photos}>
      {photos.length === 0 ? (
        <Card pad={false} className="px-4 py-3">
          <p className="text-sm text-ink-soft">{c.noPhotos}</p>
        </Card>
      ) : (
        <ul className="fw-scroll -mx-4 flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pb-3 pt-3" data-testid="photo-timeline">
          {photos.map(({ proof, day }, i) => (
            <li key={proof.photoId} className="w-40 shrink-0 snap-start">
              <Polaroid caption={formatDay(day, w.lang, 'date-short')} source={proof.source} tilt={TILTS[i % TILTS.length]} tape={TAPES[i % TAPES.length]}>
                <PhotoImg photoId={proof.photoId} alt={c.photoAlt(name, formatDay(day, w.lang, 'date'))} className="size-full" />
              </Polaroid>
            </li>
          ))}
        </ul>
      )}
    </Group>
  )
}

/** The dish's rating at every meal, in order: the place where a soufflé is seen to rise. */
function RatingHistory({ visits, w }: { visits: Visit[]; w: Words }) {
  const c = w.c.detail
  const rated = useMemo(() => visits.filter((visit) => visit.plate.overall !== null), [visits])
  const pick = usePick(rated.length, rated)
  if (rated.length < 2) return null
  const picked = pick.picked !== null ? rated[pick.picked] : null
  const first = rated[0]
  const last = rated[rated.length - 1]
  return (
    <ChartCard id="dish-ratings" title={c.ratings}>
      <div className="pt-2">
        <LineChart
          label={`${c.ratings}. ${c.ratingSummary(rated.length, first.plate.overall ?? 0, last.plate.overall ?? 0)}`}
          height={160}
          xDomain={[0, rated.length - 1]}
          yDomain={[0.6, 5.4]}
          xTicks={[
            { value: 0, label: formatDay(first.meal.day, w.lang, 'date-short') },
            { value: rated.length - 1, label: formatDay(last.meal.day, w.lang, 'date-short') },
          ]}
          yTicks={FIVE}
          series={[{ key: 'overall', points: rated.map((visit, i) => ({ x: i, y: visit.plate.overall ?? 0 })), look: 'stitched' }]}
          stops={rated.map((_, i) => i)}
          pick={pick}
        />
      </div>
      <Readout hint={w.c.shared.tapHint}>{picked && c.ratingReadout(formatDay(picked.meal.day, w.lang, 'full'), picked.plate.overall ?? 0)}</Readout>
    </ChartCard>
  )
}

function Reviews({ visits, kitchen, w }: { visits: Visit[]; kitchen: Kitchen; w: Words }) {
  const t = useT()
  const c = w.c.detail
  return (
    <Group id="reviews" title={c.reviews}>
      <ol className="flex flex-col gap-3" data-testid="reviews">
        {[...visits].reverse().map(({ meal, plate }) => {
          const review = plate.review
          const cook = w.memberName(meal.serving.cookedBy)
          const menu = meal.serving.menuId ? kitchen.menus.get(meal.serving.menuId) : undefined
          return (
            <li key={meal.serving.id}>
              <Card pad={false} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold">{formatDay(meal.day, w.lang, 'full')}</p>
                    <p className="text-xs text-ink-soft">{[cook && c.cookedBy(cook), menu && c.partOf(menu.name)].filter(Boolean).join(', ')}</p>
                  </div>
                  {plate.reaction !== null && (
                    <span role="img" aria-label={w.reactionName(plate.reaction)} className="text-[1.75rem] leading-none">
                      {REACTION_EMOJI[plate.reaction]}
                    </span>
                  )}
                </div>

                {plate.overall === null ? (
                  <p className="mt-2 text-sm text-ink-soft">{c.notRated}</p>
                ) : (
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-xl font-bold font-soft">{c.overall(plate.overall)}</span>
                    <span className="text-sm font-bold text-ink-soft">{t.review.levels[plate.overall - 1]}</span>
                  </p>
                )}

                {review?.comment && <p className="mt-1.5 break-words font-script text-[1.6rem] leading-tight text-rose-ink">{review.comment}</p>}

                {review && (review.chips.length > 0 || review.extraReactions.length > 0) && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {review.extraReactions.map((extra) => (
                      <Tag key={extra}>
                        <span aria-hidden>{EXTRA_EMOJI[extra]}</span> {c.extra[extra] ?? extra}
                      </Tag>
                    ))}
                    {review.chips.map((chip) => (
                      <Tag key={chip} tone="butter">
                        {chipLabel(chip, w.lang)}
                      </Tag>
                    ))}
                  </p>
                )}

                {review && (
                  <p className="mt-2 text-xs text-ink-soft">
                    {[c.portions(w.f.loose(review.portionsEaten)), review.wouldEatAgain === true ? c.againYes : review.wouldEatAgain === false ? c.againNo : null].filter(Boolean).join(' ')}
                  </p>
                )}

                {review && (review.chefReply || review.chefSelfRating !== null) && (
                  <div className="mt-3 rounded-2xl bg-blush px-3.5 py-2.5">
                    {review.chefReply && (
                      <>
                        <p className="text-2xs font-extrabold">{c.replyFrom(cook)}</p>
                        <p className="break-words text-sm">{review.chefReply}</p>
                      </>
                    )}
                    {review.chefSelfRating !== null && <p className="text-xs">{c.self(review.chefSelfRating)}</p>}
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ol>
    </Group>
  )
}

export function DishDetail({ id }: { id: ID }) {
  const t = useT()
  const kitchen = useKitchen()
  const w = useWords(kitchen)
  const c = w.c.detail
  const duration = useDuration()
  const showCalories = usePref('showCalories')
  const filtered = activeChips(useFilter(), { calories: showCalories }).length > 0

  const visits = useMemo<Visit[]>(() => (kitchen ? kitchen.all.flatMap((meal) => meal.plates.filter((plate) => plate.dishId === id).map((plate) => ({ meal, plate }))) : []), [kitchen, id])

  if (!kitchen) {
    return (
      <Screen>
        <PageHeader title={c.header} backTo="/cockpit" />
        <SteamLoader />
      </Screen>
    )
  }

  const dish = kitchen.dishes.get(id)
  const stats = kitchen.allStats.get(id)
  if (!dish && !stats) {
    return (
      <Screen>
        <PageHeader title={c.header} backTo="/cockpit" />
        <EmptyState
          title={c.goneTitle}
          body={c.goneBody}
          action={
            <Button variant="secondary" onClick={() => navigate('/cockpit', { replace: true })}>
              {c.backToCockpit}
            </Button>
          }
        />
      </Screen>
    )
  }

  const name = w.dishName(id)
  const minutes = dish ? totalMinutes(dish) : null
  const kcal = dish?.nutrition.kcalPerServing
  const eaten = mean(visits.flatMap((visit) => (visit.plate.kcal === null ? [] : [visit.plate.kcal])))
  const reactions = [1, 2, 3, 4, 5, 6].map((reaction) => visits.filter((visit) => visit.plate.reaction === reaction).length)
  // Switched-off criteria stay in a dish's numbers: what was rated was rated.
  const criteria = kitchen.criteria.filter((criterion) => stats?.criteria[criterion.id])

  return (
    <Screen>
      <PageHeader title={c.header} backTo="/cockpit" />
      <main className="app-column flex flex-col gap-7 px-4 pt-4" data-testid="dish-numbers">
        <div className="flex flex-col gap-3">
          {/* A short name sits next to its picture. A long one gets the full width underneath. */}
          <div className={name.length > 12 ? 'flex flex-col gap-3' : 'flex items-center gap-4'}>
            <Thumb dish={dish} id={id} size={name.length > 12 ? 72 : 88} />
            <h2 className="min-w-0 hyphens-auto break-words text-2xl" data-testid="dish-name">
              {name}
            </h2>
          </div>
          {dish && (
            <div className="flex flex-wrap gap-1.5">
              <Tag>{t.courses[dish.course]}</Tag>
              {dish.effort && <Tag tone="butter">{t.effort[dish.effort]}</Tag>}
              {dish.tags.map((tag) => (
                <Tag key={tag} tone="sage">
                  {tag}
                </Tag>
              ))}
            </div>
          )}
          {filtered && stats && <p className="text-xs text-ink-soft">{c.allTime}</p>}
        </div>

        {!stats ? (
          <Card pad={false}>
            <EmptyState title={c.notEatenTitle} body={c.notEatenBody} />
          </Card>
        ) : (
          <>
            <Card pad={false} className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 py-4" data-testid="dish-stats">
              <Stat value={stats.timesEaten} label={c.timesEaten(stats.timesEaten)} />
              <div>
                <Stat value={stats.average ? w.f.one(stats.average.mean) : '–'} label={c.average} />
                <p className="text-2xs font-bold text-ink-soft">{w.c.shared.ratings(stats.average?.n ?? 0)}</p>
              </div>
              <Stat value={<span className="text-xl">{formatDay(stats.lastEaten, w.lang, 'date-short')}</span>} label={c.lastEaten} />
              {stats.wouldEatAgain.n > 0 && <Stat value={<span className="text-xl">{c.againValue(stats.wouldEatAgain.yes, stats.wouldEatAgain.n)}</span>} label={c.again} />}
            </Card>

            <Photos visits={visits} name={name} w={w} />

            <RatingHistory visits={visits} w={w} />

            {criteria.length > 0 && (
              <ChartCard id="dish-criteria" title={c.criteria}>
                <BarList
                  className="pt-2"
                  max={5}
                  rows={criteria.map((criterion) => {
                    const value = stats.criteria[criterion.id]
                    return { key: criterion.id, label: criterion.label, value: w.c.shared.fromRatings(w.f.one(value.mean), value.n), amount: value.mean }
                  })}
                />
              </ChartCard>
            )}

            {stats.reaction && (
              <ChartCard id="dish-reactions" title={c.reactions} sub={c.reactionScore(w.f.one(stats.reaction.mean), stats.reaction.n)}>
                <ul className="flex justify-between px-4 pb-4 pt-3">
                  {reactions.map((count, i) => (
                    <li key={i} className="flex flex-col items-center gap-1" aria-label={w.c.reactions.count(w.reactionName((i + 1) as Reaction), count)}>
                      <span aria-hidden className="text-[1.6rem] leading-none" style={count === 0 ? { filter: 'grayscale(0.8) opacity(0.5)' } : undefined}>
                        {REACTION_EMOJI[(i + 1) as Reaction]}
                      </span>
                      <span aria-hidden className={count === 0 ? 'tabular text-xs font-bold text-ink-soft' : 'tabular text-sm font-extrabold'}>
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              </ChartCard>
            )}

            {showCalories && (
              <Card pad={false} className="px-4 py-4" data-testid="dish-calories">
                <h3 className="text-base">{c.calories}</h3>
                {typeof kcal === 'number' ? (
                  <>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <Stat value={w.f.whole(kcal)} unit="kcal" label={c.perServing} />
                      {dish?.nutrition.isEstimate && <Tag tone="butter">{c.estimate}</Tag>}
                    </div>
                    {eaten && <p className="mt-2 text-xs text-ink-soft">{c.eatenAverage(w.f.whole(eaten.mean), eaten.n)}</p>}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-ink-soft">{c.unknownCalories}</p>
                )}
              </Card>
            )}

            <Reviews visits={visits} kitchen={kitchen} w={w} />
          </>
        )}

        {dish && (
          <div className="flex flex-col items-center gap-2">
            {minutes !== null && (
              <p className="text-xs font-bold text-ink-soft">{c.recipeTime(duration(minutes))}</p>
            )}
            <Button block onClick={() => navigate(`/recipes/${dish.id}`)}>
              {c.openRecipe}
            </Button>
          </div>
        )}
      </main>
    </Screen>
  )
}
