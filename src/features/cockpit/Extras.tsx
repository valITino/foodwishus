// The Hall of Fame (the five best dishes as framed polaroids) and the fun facts strip.

import { useMemo } from 'react'
import { usePhotoUrl } from '../../data/hooks'
import type { ID } from '../../data/types'
import { formatDay, weekOf } from '../../lib/dates'
import { funFacts, hallOfFame, type DishStats } from '../../lib/stats'
import { Card, DishThumb, Polaroid } from '../../ui/components'
import { Sparkle } from '../../ui/deco/Deco'
import { ChartEmpty } from './charts/base'
import { factLines } from './facts'
import { openDish, type SectionProps } from './parts'

const TILTS = [-2.5, 2, -1.5, 2.5, -2]
const TAPES = ['rose', 'sage', 'butter'] as const

/** The newest proof photo of each dish, among the meals given. */
function useLatestProof(meals: SectionProps['sel']['meals']): Map<ID, ID> {
  return useMemo(() => {
    const latest = new Map<ID, ID>()
    // Oldest first, so later meals overwrite earlier ones.
    for (const meal of meals) {
      for (const plate of meal.plates) {
        const photo = meal.serving.proofPhotos.find((proof) => proof.courseDishId === plate.dishId) ?? (meal.plates.length === 1 ? meal.serving.proofPhotos[0] : undefined)
        if (photo) latest.set(plate.dishId, photo.photoId)
      }
    }
    return latest
  }, [meals])
}

function FamePicture({ photoId, dishId, name, kitchen }: { photoId: ID | null; dishId: ID; name: string } & Pick<SectionProps, 'kitchen'>) {
  const dish = kitchen.dishes.get(dishId)
  const url = usePhotoUrl(photoId ?? dish?.coverPhotoId ?? null, 'thumb')
  if (url) return <img src={url} alt="" className="size-full object-cover" />
  return (
    <div className="grid size-full place-items-center">
      <DishThumb dish={dish ?? { id: dishId, name, coverPhotoId: null, icon: null }} size={76} />
    </div>
  )
}

function Framed({ stats, rank, photoId, kitchen, w }: { stats: DishStats; rank: number; photoId: ID | null } & Pick<SectionProps, 'kitchen' | 'w'>) {
  const name = w.dishName(stats.dishId)
  const rating = stats.average ? w.c.shared.fromRatings(w.f.one(stats.average.mean), stats.average.n) : ''
  return (
    <li className="w-[9.75rem] shrink-0 snap-start">
      <button type="button" onClick={() => openDish(stats.dishId)} aria-label={`${w.c.fame.rank(rank)}: ${name}, ${rating}. ${w.c.shared.openDish(name)}`} className="block w-full rounded-lg pt-3 text-left" data-testid="fame-dish">
        <Polaroid caption={w.c.fame.rank(rank)} tilt={TILTS[(rank - 1) % TILTS.length]} tape={TAPES[(rank - 1) % TAPES.length]}>
          <FamePicture photoId={photoId} dishId={stats.dishId} name={name} kitchen={kitchen} />
        </Polaroid>
        <span className="mt-3 block px-1">
          <span className="line-clamp-2 break-words text-sm font-extrabold leading-snug">{name}</span>
          <span className="block text-xs text-ink-soft">{rating}</span>
        </span>
      </button>
    </li>
  )
}

/** The top five dishes, framed. */
export function HallOfFame({ kitchen, sel, w }: SectionProps) {
  const c = w.c.fame
  const top = useMemo(() => hallOfFame(sel.stats, 5), [sel.stats])
  const proofs = useLatestProof(sel.meals)
  return (
    <section aria-labelledby="fame-title" data-testid="hall-of-fame">
      <div className="mb-1 flex items-center gap-2 px-1">
        <h2 id="fame-title" className="text-xl">
          {c.title}
        </h2>
        <Sparkle size={22} />
      </div>
      <p className="px-1 text-xs text-ink-soft">{c.sub}</p>
      {top.length === 0 ? (
        <Card pad={false} className="mt-3">
          <ChartEmpty>{c.empty}</ChartEmpty>
        </Card>
      ) : (
        <ol className="fw-scroll -mx-4 flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pb-3 pt-2">
          {top.map((stats, i) => (
            <Framed key={stats.dishId} stats={stats} rank={i + 1} photoId={proofs.get(stats.dishId) ?? null} kitchen={kitchen} w={w} />
          ))}
        </ol>
      )}
    </section>
  )
}

/** Little truths about the kitchen, each with a wink. */
export function FunFacts({ kitchen, sel, w }: SectionProps) {
  const lines = useMemo(() => {
    const weekdays = weekOf('2026-11-09').map((day) => formatDay(day, w.lang, 'weekday'))
    return factLines(funFacts(sel.meals, kitchen.data.servings, kitchen.today), w.c.facts, {
      dish: w.dishName,
      weekday: (index) => weekdays[index],
      superDelicious: w.reactionName(6),
    })
  }, [sel.meals, kitchen.data.servings, kitchen.today, w])
  if (lines.length === 0) return null
  return (
    <section aria-labelledby="facts-title" data-testid="fun-facts">
      <h2 id="facts-title" className="px-1 text-xl">
        {w.c.facts.title}
      </h2>
      <ul className="fw-scroll -mx-4 mt-3 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1">
        {lines.map((line) => {
          const text = <span className="text-sm font-extrabold leading-snug">{line.text}</span>
          const box = 'flex min-h-24 w-60 shrink-0 snap-start items-center rounded-card bg-butter px-4 py-3 text-left text-on-rose'
          return (
            <li key={line.key} className="flex">
              {line.dishId ? (
                <button type="button" className={box} onClick={() => line.dishId && openDish(line.dishId)} data-fact={line.key}>
                  {text}
                </button>
              ) : (
                <div className={box} data-fact={line.key}>
                  {text}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
