// The KPI tiles: the kitchen at a glance. Every average says how many values went
// into it. The last tiles are about right now and do not follow the filter.

import { useMemo, type ReactNode } from 'react'
import { usePref } from '../../data/prefs'
import type { ID } from '../../data/types'
import { kpis } from '../../lib/stats'
import { Card, cx, REACTION_EMOJI, Stat } from '../../ui/components'
import { openDish, Thumb, type SectionProps } from './parts'

function Tile({ id, children, note, wide, className }: { id: string; children: ReactNode; note?: string; wide?: boolean; className?: string }) {
  return (
    <Card pad={false} className={cx('flex min-w-0 flex-col justify-between gap-1 px-3.5 py-3', wide && 'col-span-2', className)} data-testid={`tile-${id}`}>
      {children}
      {note && <p className="text-2xs font-bold leading-snug text-ink-soft">{note}</p>}
    </Card>
  )
}

/** A tile about one dish: its picture, its name, and a tap that leads to its numbers. */
function DishTile({ id, label, dishId, note, none, kitchen, w }: { id: string; label: string; dishId: ID | null; note: string; none: string } & Pick<SectionProps, 'kitchen' | 'w'>) {
  if (!dishId) {
    return (
      <Tile id={id} wide note={none}>
        <p className="text-xs font-bold text-ink-soft">{label}</p>
      </Tile>
    )
  }
  const name = w.dishName(dishId)
  return (
    <Card pad={false} className="col-span-2 min-w-0" data-testid={`tile-${id}`}>
      <button type="button" onClick={() => openDish(dishId)} aria-label={`${label}: ${name}, ${note}. ${w.c.shared.openDish(name)}`} className="flex min-h-16 w-full items-center gap-3 rounded-card px-3.5 py-3 text-left active:bg-blush/40">
        <Thumb dish={kitchen.dishes.get(dishId)} id={dishId} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-ink-soft">{label}</span>
          <span className="line-clamp-2 break-words font-display text-lg font-bold leading-tight font-soft">{name}</span>
          <span className="block text-2xs font-bold text-ink-soft">{note}</span>
        </span>
      </button>
    </Card>
  )
}

const Dash = ({ label }: { label: string }) => (
  <span role="img" aria-label={label}>
    –
  </span>
)

export function Tiles({ kitchen, sel, w }: SectionProps) {
  const c = w.c.tiles
  const showCalories = usePref('showCalories')
  const k = useMemo(() => kpis(kitchen.data, sel.statsFilter, kitchen.today), [kitchen.data, kitchen.today, sel.statsFilter])
  const none = <Dash label={w.c.shared.noValue} />
  const week = k.caloriesThisWeek

  return (
    <section aria-label={c.title} className="flex flex-col gap-3" data-testid="tiles">
      <div className="grid grid-cols-2 gap-3">
        <Tile id="meals">
          <Stat value={k.mealsEaten} label={c.meals(k.mealsEaten)} />
        </Tile>
        <Tile id="average" note={k.averageOverall ? c.averageNote(k.averageOverall.n) : c.averageNone}>
          <Stat value={k.averageOverall ? w.f.one(k.averageOverall.mean) : none} label={c.average} />
        </Tile>

        <DishTile
          id="best"
          label={c.best}
          dishId={k.bestRated?.dishId ?? null}
          note={k.bestRated?.average ? w.c.shared.fromRatings(w.f.one(k.bestRated.average.mean), k.bestRated.average.n) : ''}
          none={c.bestNone}
          kitchen={kitchen}
          w={w}
        />
        <DishTile id="most" label={c.most} dishId={k.mostEaten?.dishId ?? null} note={k.mostEaten ? w.c.shared.times(k.mostEaten.timesEaten) : ''} none={c.mostNone} kitchen={kitchen} w={w} />

        <Tile id="skip" note={k.skipRate ? c.skipNote(k.skipRate.skipped, k.skipRate.skipped + k.skipRate.eaten) : k.mealsEaten > 0 ? c.skipUntold : c.skipNone}>
          <Stat value={k.skipRate ? w.f.percent(k.skipRate.rate) : none} label={c.skip} />
        </Tile>
        <Tile id="days-to-eat" note={k.daysToEat ? c.daysToEatNote(k.daysToEat.n) : c.daysToEatNone}>
          <Stat value={k.daysToEat ? w.f.one(k.daysToEat.mean) : none} unit={k.daysToEat ? c.days(2) : undefined} label={c.daysToEat} />
        </Tile>

        <Tile id="reaction" wide note={k.mostCommonReaction ? w.c.shared.times(k.mostCommonReaction.count) : c.reactionNone}>
          <p className="text-xs font-bold text-ink-soft">{c.reaction}</p>
          {k.mostCommonReaction && (
            <p className="flex items-center gap-2 font-display text-lg font-bold leading-tight font-soft">
              <span aria-hidden className="text-2xl leading-none">
                {REACTION_EMOJI[k.mostCommonReaction.reaction]}
              </span>
              {w.reactionName(k.mostCommonReaction.reaction)}
            </p>
          )}
        </Tile>
      </div>

      <p className="px-1 pt-1 text-xs font-bold text-ink-soft">{c.now}</p>
      <div className="grid grid-cols-2 gap-3">
        <Tile id="streak" note={c.longest(k.longestStreak)}>
          <Stat value={k.currentStreak} unit={c.days(k.currentStreak)} label={c.streak} />
        </Tile>
        <Tile id="wishes" note={c.wishesNote}>
          <Stat value={k.openWishlist} label={c.wishes(k.openWishlist)} />
        </Tile>
        {showCalories && (
          <Tile id="calories-week" wide note={week.known > 0 ? c.caloriesWeekNote(week.known, week.unknown) : c.caloriesWeekNone(week.unknown)}>
            <Stat value={week.known > 0 ? w.f.whole(week.kcal) : none} unit={week.known > 0 ? 'kcal' : undefined} label={c.caloriesWeek} />
          </Tile>
        )}
      </div>
    </section>
  )
}
