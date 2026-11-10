// Everything the Cockpit reads, gathered once: the kitchen's rows, the eaten meals,
// and the same meals with the shared filter applied. The numbers themselves come
// from src/lib/stats; nothing is computed differently here.

import { useEffect, useMemo, useState } from 'react'
import { usePref } from '../../data/prefs'
import { useCriteria, useDishes, useHousehold, useMembers, useMenus, useReviews, useServings } from '../../data/queries'
import type { Criterion, Day, Dish, ID, Member, Menu, Reaction } from '../../data/types'
import { useLang, useT, type Lang } from '../../i18n'
import { today } from '../../lib/dates'
import { dishStats, eatenMeals, filterMeals, type DishStats, type KitchenData, type Meal, type StatsFilter } from '../../lib/stats'
import { useCockpitCopy, type CockpitCopy } from './copy'
import { sanitise, toStatsFilter, type CockpitFilter } from './filter'
import { useFilter } from './filterStore'
import { formats, type Formats } from './format'

/** Today in Zurich. Rolls over by itself when the app stays open past midnight. */
export function useToday(): Day {
  const [day, setDay] = useState(today)
  useEffect(() => {
    const check = () => setDay(today())
    const timer = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return day
}

export interface Kitchen {
  today: Day
  data: KitchenData
  members: Member[]
  dishes: Map<ID, Dish>
  menus: Map<ID, Menu>
  criteria: Criterion[]
  /** Every eaten meal, oldest first. */
  all: Meal[]
  /** Per dish, over all meals: the dish in numbers reads from here. */
  allStats: Map<ID, DishStats>
}

/** The kitchen's rows and its eaten meals, or undefined while the phone is still loading them. */
export function useKitchen(): Kitchen | undefined {
  // Archived dishes and menus keep their history: a meal eaten last month still counts.
  const dishes = useDishes({ includeArchived: true })
  const menus = useMenus({ includeArchived: true })
  const servings = useServings()
  const reviews = useReviews()
  const criteria = useCriteria()
  const members = useMembers()
  const day = useToday()

  return useMemo(() => {
    if (!dishes || !menus || !servings || !reviews || !criteria || !members) return undefined
    const data: KitchenData = { dishes, menus, servings, reviews, criteria }
    const all = eatenMeals(data)
    return {
      today: day,
      data,
      members,
      dishes: new Map(dishes.map((d) => [d.id, d])),
      menus: new Map(menus.map((m) => [m.id, m])),
      criteria,
      all,
      allStats: dishStats(all),
    }
  }, [dishes, menus, servings, reviews, criteria, members, day])
}

export interface Selection {
  /** The filter as the filter bar holds it, cleaned of things that no longer exist. */
  filter: CockpitFilter
  statsFilter: StatsFilter
  /** The meals that match, each with only its matching plates. */
  meals: Meal[]
  stats: Map<ID, DishStats>
}

/** The shared filter applied to the kitchen's meals. */
export function useSelection(kitchen: Kitchen | undefined): Selection | undefined {
  const stored = useFilter()
  const calories = usePref('showCalories')
  return useMemo(() => {
    if (!kitchen) return undefined
    const filter = sanitise(stored, {
      dishIds: new Set(kitchen.all.flatMap((meal) => meal.plates.map((plate) => plate.dishId))),
      menuIds: new Set(kitchen.menus.keys()),
      memberIds: new Set(kitchen.members.map((m) => m.id)),
    })
    const statsFilter = toStatsFilter(filter, kitchen.today, { calories })
    const meals = filterMeals(kitchen.all, statsFilter)
    return { filter, statsFilter, meals, stats: dishStats(meals) }
  }, [kitchen, stored, calories])
}

export interface Words {
  lang: Lang
  c: CockpitCopy
  f: Formats
  /** A dish's name, or a kind word for one that is gone. */
  dishName: (id: ID) => string
  /** What a reaction is called in this kitchen (labels can be changed in Settings). */
  reactionName: (reaction: Reaction) => string
  memberName: (id: ID | null) => string
}

/** Names and number formats in the current language. */
export function useWords(kitchen: Pick<Kitchen, 'dishes' | 'members'> | undefined): Words {
  const lang = useLang()
  const t = useT()
  const c = useCockpitCopy()
  const household = useHousehold()
  return useMemo(() => {
    const labels = household?.settings.reactionLabels ?? {}
    return {
      lang,
      c,
      f: formats(lang),
      dishName: (id) => kitchen?.dishes.get(id)?.name ?? c.shared.goneDish,
      reactionName: (reaction) => labels[String(reaction)] || t.reactions.levels[reaction - 1],
      memberName: (id) => kitchen?.members.find((m) => m.id === id)?.name ?? '',
    }
  }, [lang, t, c, household, kitchen])
}
