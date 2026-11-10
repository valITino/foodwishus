// The Cockpit: one long page of tiles and charts, all driven by one shared filter bar.
// The numbers come from src/lib/stats; this feature only draws them.

import { matchPath, navigate, type Route } from '../../app/router'
import { usePref } from '../../data/prefs'
import { useT } from '../../i18n'
import { AwningHeader, Button, Card, EmptyState, Screen, SteamLoader } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { useKitchen, useSelection, useWords } from './data'
import { DishDetail } from './DishDetail'
import { FunFacts, HallOfFame } from './Extras'
import { FilterBar } from './FilterBar'
import { resetFilter, useScrollMemory } from './filterStore'
import { Group } from './parts'
import { CaloriesBySlotChart, CaloriesChart, TasteChart } from './sections/Calories'
import { CriteriaChart } from './sections/Criteria'
import { EffortChart, MixChart, RecipesChart, TopDishesChart } from './sections/Food'
import { RatingsChart } from './sections/Ratings'
import { CravingChart, ReactionCountsChart, ReactionTrendChart } from './sections/Taste'
import { CalendarChart, HoursChart, PlannedHoursChart, SlotsChart } from './sections/Time'
import { Tiles } from './Tiles'

export function CockpitScreen() {
  const t = useT()
  const kitchen = useKitchen()
  const sel = useSelection(kitchen)
  const w = useWords(kitchen)
  const showCalories = usePref('showCalories')
  const ready = kitchen !== undefined && sel !== undefined
  useScrollMemory(ready)
  const c = w.c

  if (!kitchen || !sel) {
    return (
      <Screen tabs>
        <AwningHeader title={t.tabs.cockpit} script={c.header.script} />
        <SteamLoader />
      </Screen>
    )
  }

  // Nothing has ever been eaten: there is nothing to count and nothing to filter.
  if (kitchen.all.length === 0) {
    return (
      <Screen tabs>
        <AwningHeader title={t.tabs.cockpit} />
        <main className="app-column px-4 pt-5" data-testid="cockpit-empty">
          <Card pad={false}>
            <EmptyState mood="sleepy" title={c.empty.kitchenTitle} body={c.empty.kitchenBody} action={<Button onClick={() => navigate('/wishlist')}>{c.empty.kitchenAction}</Button>} />
          </Card>
        </main>
      </Screen>
    )
  }

  const props = { kitchen, sel, w }
  return (
    <Screen tabs>
      <AwningHeader title={t.tabs.cockpit} script={c.header.script} action={<Mascot size={58} mood="love" className="-mt-1 mr-1 shrink-0" />} />
      <FilterBar {...props} />
      <main className="app-column flex flex-col gap-8 px-4 pt-5" data-testid="cockpit">
        <Tiles {...props} />

        {sel.meals.length === 0 ? (
          <Card pad={false} data-testid="no-match">
            <EmptyState
              mood="happy"
              title={c.empty.matchTitle}
              body={c.empty.matchBody}
              action={
                <Button variant="secondary" onClick={resetFilter}>
                  {c.empty.matchAction}
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <FunFacts {...props} />
            <HallOfFame {...props} />

            <Group id="taste" title={c.sections.taste}>
              <RatingsChart {...props} />
              <CriteriaChart {...props} />
              <CravingChart {...props} />
              <ReactionCountsChart {...props} />
              <ReactionTrendChart {...props} />
            </Group>

            <Group id="food" title={c.sections.food}>
              <TopDishesChart {...props} />
              <MixChart {...props} />
              <RecipesChart {...props} />
              <EffortChart {...props} />
            </Group>

            <Group id="time" title={c.sections.time}>
              <CalendarChart {...props} />
              <SlotsChart {...props} />
              <HoursChart {...props} />
              <PlannedHoursChart {...props} />
            </Group>

            {showCalories && (
              <Group id="calories" title={c.sections.calories}>
                <CaloriesChart {...props} />
                <CaloriesBySlotChart {...props} />
                <TasteChart {...props} />
              </Group>
            )}
          </>
        )}
      </main>
    </Screen>
  )
}

/** Pages that hang off the Cockpit: the dish in numbers. */
export function CockpitRoutes({ route }: { route: Route }) {
  const dish = matchPath('/cockpit/dish/:id', route.path)
  // An address that names no dish shows the same kind "no numbers" page as a dish that is gone.
  return <DishDetail id={dish?.id ?? ''} />
}
