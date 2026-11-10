import { describe, expect, it } from 'vitest'
import { buildDemoRows, CURRENT_STREAK } from '../../src/data/demo/history'
import { newId, type Course, type Criterion, type Day, type Dish, type ID, type Menu, type Reaction, type Review, type Score5, type Serving, type Slot } from '../../src/data/types'
import {
  averageCaloriesPerMeal,
  bestRated,
  calorieCharts,
  caloriesEaten,
  courseMix,
  cravingVsReality,
  criteriaProfile,
  currentStreak,
  daysToEat,
  dishStats,
  eatenMeals,
  eatingTimes,
  effortVsLove,
  filterMeals,
  funFacts,
  hallOfFame,
  kpis,
  longestStreak,
  mealCalendar,
  mealKcal,
  mostCommonReaction,
  mostEaten,
  rangeFor,
  ratingsOverTime,
  reactionCounts,
  reactionTrend,
  recipeStats,
  skipRate,
  tagMix,
  tasteVsCalories,
  timesEatenTop,
  type KitchenData,
} from '../../src/lib/stats'

// ------------------------------------------------------------ a tiny kitchen --

const householdId = 'h'
const mia = 'mia'
const leo = 'leo'
const row = (id: ID) => ({ id, householdId, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null })

function dish(id: ID, extra: Partial<Dish> = {}): Dish {
  return { ...row(id), name: id, description: null, course: 'main', tags: [], effort: null, recipe: {}, nutrition: {}, coverPhotoId: null, icon: null, createdBy: mia, archived: false, ...extra }
}

function serving(id: ID, extra: Partial<Serving> = {}): Serving {
  return {
    ...row(id),
    dishId: null,
    menuId: null,
    proposedBy: mia,
    cookedBy: mia,
    proposedAt: '2026-11-01T09:00:00.000Z',
    note: null,
    suggestedDays: [],
    craving: null,
    priority: 'a0',
    status: 'wishlist',
    plannedDate: null,
    plannedSlot: null,
    servedAt: null,
    eatenAt: null,
    skippedReason: null,
    proofPhotos: [],
    ...extra,
  }
}

/** A dish eaten on a Zurich day at 18:30 local time (winter: 17:30 UTC). */
function eaten(id: ID, dishId: ID, day: Day, extra: Partial<Serving> = {}): Serving {
  return serving(id, { dishId, status: 'eaten', plannedDate: day, plannedSlot: 'dinner', eatenAt: `${day}T17:30:00.000Z`, ...extra })
}

function review(servingId: ID, dishId: ID, extra: Partial<Review> = {}): Review {
  return {
    ...row(`${servingId}:${dishId}:${extra.reviewerId ?? leo}`),
    servingId,
    dishId,
    reviewerId: leo,
    reaction: null,
    extraReactions: [],
    overall: null,
    scores: {},
    portionsEaten: 1,
    wouldEatAgain: null,
    comment: null,
    chips: [],
    chefSelfRating: null,
    chefReaction: null,
    chefExtraReactions: [],
    chefReply: null,
    sealedAt: null,
    ...extra,
  }
}

const rated = (servingId: ID, dishId: ID, overall: Score5, reaction?: Reaction, extra: Partial<Review> = {}) => review(servingId, dishId, { overall, reaction: reaction ?? null, ...extra })

function kitchen(parts: Partial<KitchenData>): KitchenData {
  return { dishes: [], menus: [], servings: [], reviews: [], criteria: [], ...parts }
}

// ------------------------------------------------------------------- meals --

describe('meals and plates', () => {
  it('counts only eaten servings, and gives a menu one plate per course', () => {
    const menu: Menu = { ...row('menu'), name: 'Sunday roast', description: null, courses: [{ dishId: 'roast', order: 1 }, { dishId: 'soup', order: 0 }], createdBy: mia, archived: false }
    const data = kitchen({
      dishes: [dish('soup', { course: 'starter' }), dish('roast'), dish('rösti')],
      menus: [menu],
      servings: [
        eaten('s1', 'rösti', '2026-11-03'),
        serving('s2', { menuId: 'menu', status: 'eaten', eatenAt: '2026-11-08T12:10:00.000Z' }),
        serving('s3', { dishId: 'rösti', status: 'planned', plannedDate: '2026-11-12' }),
        serving('s4', { dishId: 'rösti', status: 'skipped' }),
        { ...eaten('s5', 'rösti', '2026-11-05'), deletedAt: '2026-11-06T00:00:00.000Z' },
      ],
      reviews: [rated('s2', 'soup', 4), rated('s2', 'roast', 5)],
    })
    const meals = eatenMeals(data)
    expect(meals.map((m) => [m.serving.id, m.day, m.plates.map((p) => p.dishId)])).toEqual([
      ['s1', '2026-11-03', ['rösti']],
      ['s2', '2026-11-08', ['soup', 'roast']],
    ])
    expect(meals[1].plates.map((p) => p.overall)).toEqual([4, 5])
  })

  it('uses the Zurich day: a late dinner after midnight UTC still belongs to its evening', () => {
    // 23:30 in Zurich on 10 November is 22:30 UTC; 00:30 Zurich on the 11th is 23:30 UTC on the 10th.
    const data = kitchen({
      dishes: [dish('fondue')],
      servings: [serving('late', { dishId: 'fondue', status: 'eaten', eatenAt: '2026-11-10T22:30:00.000Z' }), serving('later', { dishId: 'fondue', status: 'eaten', eatenAt: '2026-11-10T23:30:00.000Z' })],
    })
    expect(eatenMeals(data).map((m) => m.day)).toEqual(['2026-11-10', '2026-11-11'])
  })

  it('takes the Taster\'s verdict, not the cook\'s own', () => {
    const data = kitchen({
      dishes: [dish('zopf')],
      servings: [eaten('s1', 'zopf', '2026-11-08')],
      reviews: [rated('s1', 'zopf', 5, 6, { reviewerId: mia }), rated('s1', 'zopf', 3, 4)],
    })
    expect(eatenMeals(data)[0].plates[0]).toMatchObject({ overall: 3, reaction: 4 })
  })

  it('keeps a deleted dish in the count but knows nothing more about it', () => {
    const data = kitchen({ dishes: [{ ...dish('gone'), deletedAt: '2026-11-09T00:00:00.000Z' }], servings: [eaten('s1', 'gone', '2026-11-08')] })
    expect(eatenMeals(data)[0].plates[0]).toMatchObject({ dishId: 'gone', dish: undefined, kcal: null })
  })
})

// --------------------------------------------------------------- per dish --

describe('dish numbers', () => {
  const data = kitchen({
    dishes: ['älpler', 'casimir', 'soufflé', 'once', 'twins'].map((id) => dish(id)),
    servings: [
      eaten('a1', 'älpler', '2026-10-01'),
      eaten('a2', 'älpler', '2026-10-10'),
      eaten('a3', 'älpler', '2026-11-01'),
      eaten('c1', 'casimir', '2026-10-02'),
      eaten('c2', 'casimir', '2026-10-12'),
      eaten('c3', 'casimir', '2026-10-22'),
      eaten('c4', 'casimir', '2026-11-02'),
      eaten('f1', 'soufflé', '2026-10-03'),
      eaten('f2', 'soufflé', '2026-11-03'),
      eaten('o1', 'once', '2026-11-04'),
      eaten('t1', 'twins', '2026-10-05'),
      eaten('t2', 'twins', '2026-11-05'),
    ],
    reviews: [
      rated('a1', 'älpler', 5, 6, { scores: { taste: 5, looks: 4 }, wouldEatAgain: true }),
      rated('a2', 'älpler', 5, 6, { scores: { taste: 5 }, wouldEatAgain: true }),
      review('a3', 'älpler', { reaction: 5 }), // an emoji only: eaten, but no rating
      rated('c1', 'casimir', 5, 6),
      rated('c2', 'casimir', 2, 2, { wouldEatAgain: false }),
      rated('c3', 'casimir', 4, 5),
      rated('c4', 'casimir', 2, 2),
      rated('f1', 'soufflé', 1, 1),
      rated('f2', 'soufflé', 5, 6),
      rated('o1', 'once', 5, 6),
      rated('t1', 'twins', 5, 6),
      rated('t2', 'twins', 5, 6),
    ],
  })
  const stats = dishStats(eatenMeals(data))

  it('times eaten: the number of eaten servings of that dish', () => {
    expect(Object.fromEntries([...stats].map(([id, s]) => [id, s.timesEaten]))).toEqual({ älpler: 3, casimir: 4, soufflé: 2, once: 1, twins: 2 })
  })

  it('dish average: the mean overall rating, always with n', () => {
    expect(stats.get('älpler')?.average).toEqual({ mean: 5, n: 2 })
    expect(stats.get('casimir')?.average).toEqual({ mean: 3.25, n: 4 })
    expect(stats.get('soufflé')?.average).toEqual({ mean: 3, n: 2 })
  })

  it('reaction score: the mean on the scale from 1 to 6, with n', () => {
    expect(stats.get('älpler')?.reaction?.n).toBe(3)
    expect(stats.get('älpler')?.reaction?.mean).toBeCloseTo(17 / 3)
    expect(stats.get('casimir')?.reaction).toEqual({ mean: 3.75, n: 4 })
  })

  it('criterion average: the mean wherever it was rated', () => {
    expect(stats.get('älpler')?.criteria).toEqual({ taste: { mean: 5, n: 2 }, looks: { mean: 4, n: 1 } })
    expect(stats.get('älpler')?.wouldEatAgain).toEqual({ yes: 2, n: 2 })
    expect(stats.get('casimir')?.wouldEatAgain).toEqual({ yes: 0, n: 1 })
  })

  it('best-rated dish: highest average with at least two ratings; ties go to more servings, then the most recent', () => {
    // "once" has a 5 but only one serving. älpler and twins both average 5 with two ratings:
    // älpler was eaten three times, twins twice.
    expect(bestRated(stats)?.dishId).toBe('älpler')
    const withoutÄlpler = new Map([...stats].filter(([id]) => id !== 'älpler'))
    expect(bestRated(withoutÄlpler)?.dishId).toBe('twins')

    // Same average, same count: the one eaten more recently wins.
    const tie = dishStats(
      eatenMeals(
        kitchen({
          dishes: [dish('old'), dish('new')],
          servings: [eaten('o1', 'old', '2026-09-01'), eaten('o2', 'old', '2026-09-02'), eaten('n1', 'new', '2026-10-01'), eaten('n2', 'new', '2026-10-02')],
          reviews: [rated('o1', 'old', 4), rated('o2', 'old', 4), rated('n1', 'new', 4), rated('n2', 'new', 4)],
        }),
      ),
    )
    expect(bestRated(tie)?.dishId).toBe('new')
    expect(bestRated(new Map([...stats].filter(([id]) => id === 'once')))).toBeNull()
  })

  it('most eaten, the top list and the Hall of Fame', () => {
    expect(mostEaten(stats)?.dishId).toBe('casimir')
    expect(timesEatenTop(stats, 3).map((s) => s.dishId)).toEqual(['casimir', 'älpler', 'twins'])
    // Proven dishes (rated twice or more) first, then the one-hit wonder.
    expect(hallOfFame(stats).map((s) => s.dishId)).toEqual(['älpler', 'twins', 'casimir', 'soufflé', 'once'])
    expect(hallOfFame(stats, 2)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------- streaks --

describe('streaks', () => {
  const days = (...list: Day[]) => list.map((day, i) => eaten(`s${i}`, 'x', day))

  it('counts consecutive calendar days with at least one eaten meal', () => {
    const servings = days('2026-11-07', '2026-11-08', '2026-11-08', '2026-11-09', '2026-11-10')
    expect(currentStreak(servings, '2026-11-10')).toBe(4)
    expect(longestStreak(servings)).toBe(4)
  })

  it('does not break today before dinner, but breaks after a missed day', () => {
    const servings = days('2026-11-07', '2026-11-08', '2026-11-09')
    expect(currentStreak(servings, '2026-11-10')).toBe(3)
    expect(currentStreak(servings, '2026-11-11')).toBe(0)
  })

  it('remembers the longest run even when the current one is short', () => {
    const servings = days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-20', '2026-11-09', '2026-11-10')
    expect(longestStreak(servings)).toBe(5)
    expect(currentStreak(servings, '2026-11-10')).toBe(2)
    expect(longestStreak([])).toBe(0)
  })

  it('runs across a month end and a change of the clocks', () => {
    // Summer time ends on 25 October 2026.
    expect(longestStreak(days('2026-10-24', '2026-10-25', '2026-10-26', '2026-10-31', '2026-11-01'))).toBe(3)
  })

  it('ignores meals that were planned, served or skipped', () => {
    const servings = [eaten('a', 'x', '2026-11-09'), serving('b', { dishId: 'x', status: 'served', plannedDate: '2026-11-10' }), serving('c', { dishId: 'x', status: 'skipped', plannedDate: '2026-11-08' })]
    expect(currentStreak(servings, '2026-11-10')).toBe(1)
  })
})

// ------------------------------------------------------------------- KPIs --

describe('the numbers on the tiles', () => {
  it('skip rate: skipped / (eaten + skipped) within the range', () => {
    const data = kitchen({
      dishes: [dish('x')],
      servings: [
        eaten('e1', 'x', '2026-11-02'),
        eaten('e2', 'x', '2026-11-03'),
        eaten('e3', 'x', '2026-11-04'),
        serving('k1', { dishId: 'x', status: 'skipped', plannedDate: '2026-11-05' }),
        serving('k2', { dishId: 'x', status: 'skipped', plannedDate: '2026-09-05' }),
        serving('w', { dishId: 'x', status: 'wishlist' }),
      ],
    })
    expect(skipRate(data)).toEqual({ rate: 2 / 5, skipped: 2, eaten: 3 })
    expect(skipRate(data, { from: '2026-11-01', to: '2026-11-30' })).toEqual({ rate: 1 / 4, skipped: 1, eaten: 3 })
    expect(skipRate(data, { from: '2025-01-01', to: '2025-12-31' })).toBeNull()
  })

  it('skip rate agrees with the other tiles under every filter', () => {
    const menu: Menu = { ...row('menu'), name: 'Menu', description: null, courses: [{ dishId: 'soup', order: 0 }, { dishId: 'roast', order: 1 }], createdBy: mia, archived: false }
    const data = kitchen({
      dishes: [dish('soup', { course: 'starter' }), dish('roast'), dish('curry', { tags: ['spicy'], nutrition: { kcalPerServing: 650 } })],
      menus: [menu],
      servings: [
        eaten('e1', 'curry', '2026-11-02'),
        eaten('e2', 'curry', '2026-11-03'),
        eaten('e3', 'roast', '2026-11-04', { cookedBy: leo }),
        serving('k1', { dishId: 'curry', status: 'skipped', plannedDate: '2026-11-05' }),
        serving('k2', { menuId: 'menu', status: 'skipped', plannedDate: '2026-11-06' }),
        serving('k3', { dishId: 'roast', status: 'skipped', plannedDate: '2026-11-07', cookedBy: leo }),
      ],
      reviews: [rated('e1', 'curry', 5, 6), rated('e2', 'curry', 2, 2), rated('e3', 'roast', 4, 5)],
    })
    const tiles = (filter: Parameters<typeof skipRate>[1]) => ({ eaten: kpis(data, filter ?? {}, '2026-11-10').mealsEaten, rate: skipRate(data, filter) })

    expect(tiles({})).toEqual({ eaten: 3, rate: { rate: 0.5, skipped: 3, eaten: 3 } })
    expect(tiles({ dishIds: ['curry'] })).toEqual({ eaten: 2, rate: { rate: 1 / 3, skipped: 1, eaten: 2 } })
    // A skipped menu counts for each of its courses.
    expect(tiles({ courses: ['starter'] })).toEqual({ eaten: 0, rate: { rate: 1, skipped: 1, eaten: 0 } })
    expect(tiles({ dishIds: ['roast'] })).toEqual({ eaten: 1, rate: { rate: 2 / 3, skipped: 2, eaten: 1 } })
    expect(tiles({ tags: ['spicy'] }).rate).toEqual({ rate: 1 / 3, skipped: 1, eaten: 2 })
    expect(tiles({ kcalPerServing: [600, 700] }).rate).toEqual({ rate: 1 / 3, skipped: 1, eaten: 2 })
    expect(tiles({ cookedBy: leo }).rate).toEqual({ rate: 0.5, skipped: 1, eaten: 1 })
    expect(tiles({ menuId: 'menu' }).rate).toEqual({ rate: 1, skipped: 1, eaten: 0 })
    // Skipped meals have no verdict: with a rating or reaction filter there is no honest rate.
    expect(tiles({ overall: [4, 5] })).toEqual({ eaten: 2, rate: null })
    expect(tiles({ reactions: [6] })).toEqual({ eaten: 1, rate: null })
  })

  it('days to eat: from proposing to eating', () => {
    const data = kitchen({
      dishes: [dish('x')],
      servings: [eaten('a', 'x', '2026-11-04', { proposedAt: '2026-11-01T09:00:00.000Z' }), eaten('b', 'x', '2026-11-10', { proposedAt: '2026-11-09T22:00:00.000Z' }), eaten('c', 'x', '2026-11-10', { proposedAt: '2026-11-10T07:00:00.000Z' })],
    })
    expect(daysToEat(eatenMeals(data))).toEqual({ mean: (3 + 1 + 0) / 3, n: 3 })
  })

  it('most common reaction: the mode; ties go to the higher score', () => {
    const meals = (reactions: Reaction[]) =>
      eatenMeals(kitchen({ dishes: [dish('x')], servings: reactions.map((_, i) => eaten(`s${i}`, 'x', '2026-11-01')), reviews: reactions.map((r, i) => review(`s${i}`, 'x', { reaction: r })) }))
    expect(mostCommonReaction(meals([5, 5, 6, 2]))).toEqual({ reaction: 5, count: 2 })
    expect(mostCommonReaction(meals([2, 2, 6, 6, 4]))).toEqual({ reaction: 6, count: 2 })
    expect(mostCommonReaction(meals([]))).toBeNull()
    expect(reactionCounts(meals([1, 6, 6]))).toEqual([1, 0, 0, 0, 0, 2])
  })

  it('craving accuracy: 1 − mean(|craving − overall|) / 4, only where both exist', () => {
    const data = kitchen({
      dishes: [dish('x')],
      servings: [eaten('a', 'x', '2026-11-01', { craving: 5 }), eaten('b', 'x', '2026-11-02', { craving: 5 }), eaten('c', 'x', '2026-11-03', { craving: 1 }), eaten('d', 'x', '2026-11-04'), eaten('e', 'x', '2026-11-05', { craving: 3 })],
      reviews: [rated('a', 'x', 5), rated('b', 'x', 3), rated('c', 'x', 5), rated('d', 'x', 4)],
    })
    const result = cravingVsReality(eatenMeals(data))
    expect(result.points).toEqual([
      { servingId: 'a', craving: 5, overall: 5 },
      { servingId: 'b', craving: 5, overall: 3 },
      { servingId: 'c', craving: 1, overall: 5 },
    ])
    expect(result.accuracy).toBeCloseTo(1 - (0 + 2 + 4) / 3 / 4)
    expect(cravingVsReality([]).accuracy).toBeNull()
  })

  it('puts the tiles together, with streak, wishlist and this week\'s calories untouched by the filter', () => {
    const data = kitchen({
      dishes: [dish('rösti', { nutrition: { kcalPerServing: 500 } }), dish('salad', { nutrition: { kcalPerServing: 200 } })],
      servings: [
        eaten('old', 'rösti', '2026-08-01'),
        eaten('mon', 'rösti', '2026-11-09'),
        eaten('tue', 'salad', '2026-11-10'),
        serving('w1', { dishId: 'rösti' }),
        serving('w2', { dishId: 'salad' }),
        { ...serving('w3', { dishId: 'salad' }), deletedAt: '2026-11-01T00:00:00.000Z' },
      ],
      reviews: [rated('old', 'rösti', 3, 4), rated('mon', 'rösti', 5, 6, { portionsEaten: 2 }), rated('tue', 'salad', 4, 5)],
    })
    const all = kpis(data, {}, '2026-11-10')
    expect(all).toMatchObject({ mealsEaten: 3, averageOverall: { mean: 4, n: 3 }, currentStreak: 2, longestStreak: 2, openWishlist: 2, caloriesThisWeek: { kcal: 1200, known: 2, unknown: 0 }, mostCommonReaction: { reaction: 6, count: 1 } })
    expect(all.bestRated?.dishId).toBe('rösti')
    expect(all.mostEaten?.dishId).toBe('rösti')

    const august = kpis(data, { from: '2026-08-01', to: '2026-08-31' }, '2026-11-10')
    expect(august).toMatchObject({ mealsEaten: 1, averageOverall: { mean: 3, n: 1 }, bestRated: null, currentStreak: 2, openWishlist: 2, caloriesThisWeek: { kcal: 1200 } })
  })
})

// --------------------------------------------------------------- calories --

describe('calories', () => {
  const menu: Menu = { ...row('menu'), name: 'Menu', description: null, courses: [{ dishId: 'soup', order: 0 }, { dishId: 'mystery', order: 1 }], createdBy: mia, archived: false }
  const data = kitchen({
    dishes: [dish('rösti', { nutrition: { kcalPerServing: 600 } }), dish('soup', { nutrition: { kcalPerServing: 150 } }), dish('mystery'), dish('zero', { nutrition: { kcalPerServing: 0 } })],
    menus: [menu],
    servings: [
      eaten('a', 'rösti', '2026-11-02', { plannedSlot: 'lunch' }),
      eaten('b', 'rösti', '2026-11-02', { plannedSlot: 'dinner' }),
      eaten('c', 'mystery', '2026-11-03'),
      serving('d', { menuId: 'menu', status: 'eaten', eatenAt: '2026-11-04T18:00:00.000Z', plannedSlot: 'dinner' }),
      eaten('e', 'zero', '2026-11-10', { plannedSlot: 'breakfast' }),
    ],
    reviews: [rated('a', 'rösti', 4, 5, { portionsEaten: 1.5 }), rated('b', 'rösti', 4, 5, { portionsEaten: 0.5 })],
  })
  const meals = eatenMeals(data)

  it('calories eaten: kcal per serving × portions eaten; unknown is unknown, never 0', () => {
    expect(meals.map(mealKcal)).toEqual([900, 300, null, null, 0])
    expect(caloriesEaten(meals)).toEqual({ kcal: 1200, known: 3, unknown: 2 })
  })

  it('average calories per meal: only meals with known calories count', () => {
    expect(averageCaloriesPerMeal(meals)).toEqual({ mean: 400, n: 3 })
    expect(averageCaloriesPerMeal(eatenMeals(kitchen({ dishes: [dish('mystery')], servings: [eaten('x', 'mystery', '2026-11-01')] })))).toBeNull()
  })

  it('adds up per day, per week (Monday to Sunday) and per meal by slot', () => {
    const charts = calorieCharts(meals)
    expect(charts.perDay).toEqual([
      { day: '2026-11-02', kcal: 1200 },
      { day: '2026-11-10', kcal: 0 },
    ])
    expect(charts.perWeek).toEqual([
      { weekStart: '2026-11-02', kcal: 1200 },
      { weekStart: '2026-11-09', kcal: 0 },
    ])
    expect(charts.perMealBySlot).toEqual({ lunch: { mean: 900, n: 1 }, dinner: { mean: 300, n: 1 }, breakfast: { mean: 0, n: 1 } })
  })

  it('compares taste with calories only where both are known', () => {
    expect(tasteVsCalories(meals)).toEqual([{ dishId: 'rösti', kcalPerServing: 600, average: { mean: 4, n: 2 } }])
  })
})

// ---------------------------------------------------------------- filters --

describe('the filter bar', () => {
  const menu: Menu = { ...row('menu'), name: 'Menu', description: null, courses: [{ dishId: 'soup', order: 0 }, { dishId: 'roast', order: 1 }], createdBy: mia, archived: false }
  const data = kitchen({
    dishes: [dish('soup', { course: 'starter', tags: ['swiss'], nutrition: { kcalPerServing: 150 } }), dish('roast', { tags: ['sunday'], nutrition: { kcalPerServing: 700 } }), dish('curry', { tags: ['spicy'] })],
    menus: [menu],
    servings: [
      eaten('s1', 'curry', '2026-09-15', { cookedBy: leo }),
      serving('s2', { menuId: 'menu', status: 'eaten', eatenAt: '2026-11-08T12:00:00.000Z', cookedBy: mia }),
      eaten('s3', 'curry', '2026-11-10', { cookedBy: mia }),
    ],
    reviews: [rated('s1', 'curry', 2, 2), rated('s2', 'soup', 4, 5), rated('s2', 'roast', 5, 6), rated('s3', 'curry', 4, 4)],
  })
  const meals = eatenMeals(data)
  const ids = (filter: Parameters<typeof filterMeals>[1]) => filterMeals(meals, filter).map((m) => `${m.serving.id}:${m.plates.map((p) => p.dishId).join('+')}`)

  it('filters by date, cook, menu, dish, course, tag, rating, reaction and calories', () => {
    expect(ids({})).toEqual(['s1:curry', 's2:soup+roast', 's3:curry'])
    expect(ids({ from: '2026-11-01', to: '2026-11-08' })).toEqual(['s2:soup+roast'])
    expect(ids({ cookedBy: leo })).toEqual(['s1:curry'])
    expect(ids({ menuId: 'menu' })).toEqual(['s2:soup+roast'])
    expect(ids({ dishIds: ['curry'] })).toEqual(['s1:curry', 's3:curry'])
    expect(ids({ courses: ['starter' as Course] })).toEqual(['s2:soup'])
    expect(ids({ tags: ['spicy', 'sunday'] })).toEqual(['s1:curry', 's2:roast', 's3:curry'])
    expect(ids({ overall: [4, 5] })).toEqual(['s2:soup+roast', 's3:curry'])
    expect(ids({ reactions: [2, 6] })).toEqual(['s1:curry', 's2:roast'])
    expect(ids({ kcalPerServing: [100, 200] })).toEqual(['s2:soup'])
    expect(ids({ dishIds: ['curry'], overall: [4, 5], cookedBy: mia })).toEqual(['s3:curry'])
  })

  it('knows the presets', () => {
    expect(rangeFor('week', '2026-11-10')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(rangeFor('month', '2026-11-10')).toEqual({ from: '2026-11-01', to: '2026-11-10' })
    expect(rangeFor('quarter', '2026-11-10')).toEqual({ from: '2026-08-10', to: '2026-11-10' })
    // Three calendar months back, also across a year end and from a long month into a short one.
    expect(rangeFor('quarter', '2027-01-15').from).toBe('2026-10-15')
    expect(rangeFor('quarter', '2026-05-31').from).toBe('2026-02-28')
    expect(rangeFor('year', '2026-11-10')).toEqual({ from: '2026-01-01', to: '2026-11-10' })
    expect(rangeFor('all', '2026-11-10')).toEqual({})
  })
})

// ----------------------------------------------------------------- charts --

describe('chart data', () => {
  const criteria: Criterion[] = [
    { ...row('taste'), label: 'Taste', icon: 'tongue', active: true, sortOrder: 0 },
    { ...row('looks'), label: 'Looks', icon: 'sparkle', active: true, sortOrder: 1 },
    { ...row('retired'), label: 'Retired', icon: 'x', active: false, sortOrder: 2 },
  ]
  const data = kitchen({
    criteria,
    dishes: [
      dish('rösti', { tags: ['swiss', 'potato'], recipe: { prepMinutes: 10, cookMinutes: 25, ingredients: [{ name: 'Potatoes' }, { name: 'Butter' }, { name: 'butter ' }] } }),
      dish('zopf', { course: 'breakfast', tags: ['swiss'], recipe: { cookMinutes: 40, ingredients: [{ name: 'Flour' }, { name: 'butter' }] } }),
      dish('salad', { course: 'side' }),
    ],
    servings: [
      // Monday 2 November, lunch planned, eaten 12:15 in Zurich
      eaten('a', 'rösti', '2026-11-02', { plannedSlot: 'lunch' as Slot, eatenAt: '2026-11-02T11:15:00.000Z' }),
      // Sunday 8 November, breakfast, eaten 09:40
      eaten('b', 'zopf', '2026-11-08', { plannedSlot: 'breakfast' as Slot, eatenAt: '2026-11-08T08:40:00.000Z' }),
      // Monday 9 November, dinner planned but eaten at 21:05
      eaten('c', 'rösti', '2026-11-09', { plannedSlot: 'dinner' as Slot, eatenAt: '2026-11-09T20:05:00.000Z' }),
      eaten('d', 'salad', '2026-10-15', { plannedSlot: null, eatenAt: null }),
    ],
    reviews: [rated('a', 'rösti', 4, 5, { scores: { taste: 4, looks: 3, retired: 1 } }), rated('b', 'zopf', 5, 6, { scores: { taste: 5 } }), rated('c', 'rösti', 5, 6, { scores: { taste: 5, looks: 5 } })],
  })
  const meals = eatenMeals(data)

  it('ratings over time, oldest first, with the criteria that were rated', () => {
    expect(ratingsOverTime(meals).map((p) => [p.day, p.dishId, p.overall, p.scores.taste])).toEqual([
      ['2026-11-02', 'rösti', 4, 4],
      ['2026-11-08', 'zopf', 5, 5],
      ['2026-11-09', 'rösti', 5, 5],
    ])
  })

  it('criteria profile: in their order, for all dishes or one; a switched-off criterion stays while it has ratings', () => {
    expect(criteriaProfile(meals, criteria).map((c) => [c.label, c.value])).toEqual([
      ['Taste', { mean: 14 / 3, n: 3 }],
      ['Looks', { mean: 4, n: 2 }],
      ['Retired', { mean: 1, n: 1 }],
    ])
    // The same spokes for one dish, so two shapes can be laid over each other.
    expect(criteriaProfile(meals, criteria, 'zopf').map((c) => [c.label, c.value])).toEqual([
      ['Taste', { mean: 5, n: 1 }],
      ['Looks', null],
      ['Retired', null],
    ])
    // Switched off and never rated in these meals: gone from the chart.
    const unrated = criteria.map((c) => (c.label === 'Looks' ? { ...c, active: false } : c))
    expect(criteriaProfile(meals.filter((meal) => meal.plates.every((plate) => plate.review?.scores.looks === undefined)), unrated).map((c) => c.label)).not.toContain('Looks')
  })

  it('course and tag mix, most first', () => {
    expect(courseMix(meals)).toEqual([
      { course: 'main', count: 2 },
      { course: 'breakfast', count: 1 },
      { course: 'side', count: 1 },
    ])
    expect(tagMix(meals)).toEqual([
      { tag: 'swiss', count: 3 },
      { tag: 'potato', count: 2 },
    ])
  })

  it('the calendar and when we eat, by weekday, slot and Zurich hour', () => {
    expect(Object.fromEntries(mealCalendar(meals))).toEqual({ '2026-10-15': 1, '2026-11-02': 1, '2026-11-08': 1, '2026-11-09': 1 })
    const times = eatingTimes(meals)
    // Monday: one lunch and one dinner. Sunday: one breakfast.
    expect(times.byWeekdayAndSlot[0]).toEqual([0, 1, 1, 0])
    expect(times.byWeekdayAndSlot[6]).toEqual([1, 0, 0, 0])
    expect(times.byWeekdayAndHour[0][12]).toBe(1)
    expect(times.byWeekdayAndHour[0][21]).toBe(1)
    expect(times.byWeekdayAndHour[6][9]).toBe(1)
    expect(times.plannedVsActual).toEqual([
      { servingId: 'a', slot: 'lunch', hour: 12 },
      { servingId: 'b', slot: 'breakfast', hour: 9 },
      { servingId: 'c', slot: 'dinner', hour: 21 },
    ])
  })

  it('effort against love, the reaction trend and the recipe numbers', () => {
    expect(effortVsLove(meals)).toEqual([
      { dishId: 'rösti', minutes: 35, average: { mean: 4.5, n: 2 }, reaction: { mean: 5.5, n: 2 } },
      { dishId: 'zopf', minutes: 40, average: { mean: 5, n: 1 }, reaction: { mean: 6, n: 1 } },
    ])
    expect(reactionTrend(meals)).toEqual([{ month: '2026-11', value: { mean: 17 / 3, n: 3 } }])
    const recipes = recipeStats(meals)
    expect(recipes.averageMinutes).toEqual({ mean: (35 + 40 + 35) / 3, n: 3 })
    // Butter is in three plates (twice rösti, once zopf), written three different ways.
    expect(recipes.ingredients).toEqual([
      { name: 'Butter', count: 3 },
      { name: 'Potatoes', count: 2 },
      { name: 'Flour', count: 1 },
    ])
  })
})

// -------------------------------------------------------------- fun facts --

describe('fun facts', () => {
  it('stays quiet in an empty kitchen', () => {
    expect(funFacts([], [], '2026-11-10')).toEqual([])
  })

  it('finds the little truths', () => {
    const servings = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((day, i) =>
      eaten(`s${i}`, 'älpler', day, { craving: 5, proofPhotos: [{ photoId: newId(), source: 'camera', takenAt: `${day}T17:30:00.000Z` }] }),
    )
    const data = kitchen({ dishes: [dish('älpler')], servings, reviews: servings.map((s, i) => rated(s.id, 'älpler', 5, 6, { portionsEaten: i === 0 ? 2 : 1 })) })
    const facts = funFacts(eatenMeals(data), data.servings, '2026-11-10')
    expect(facts).toEqual(
      expect.arrayContaining([
        { kind: 'mostEaten', dishId: 'älpler', count: 5 },
        { kind: 'streak', days: 5 },
        { kind: 'perfectScores', count: 5 },
        { kind: 'superDelicious', count: 5 },
        { kind: 'cravingAccuracy', percent: 100 },
        { kind: 'seconds', count: 1 },
        { kind: 'proofPhotos', count: 5 },
      ]),
    )
  })
})

// ---------------------------------------------------------- the demo kitchen --

describe('the demo kitchen tells its stories through these numbers', () => {
  const today = '2026-11-10'
  const criteria: Criterion[] = ['Taste', 'Texture', 'Smell', 'Looks', 'Portion', 'Temperature'].map((label, sortOrder) => ({ ...row(newId()), label, icon: 'spoon', active: true, sortOrder }))
  const rows = buildDemoRows({ kitchen: { householdId, chefId: mia, tasterId: leo }, criteria, today, lang: 'en' })
  const data: KitchenData = { dishes: rows.dishes, menus: rows.menus, servings: rows.servings, reviews: rows.reviews, criteria }
  const name = (dishId: ID | undefined) => rows.dishes.find((d) => d.id === dishId)?.name

  it('has one clear favourite, most eaten and best rated', () => {
    const tiles = kpis(data, {}, today)
    expect(name(tiles.mostEaten?.dishId)).toBe('Älplermagronen')
    expect(name(tiles.bestRated?.dishId)).toBe('Älplermagronen')
    expect(tiles.mealsEaten).toBeGreaterThan(40)
    expect(tiles.currentStreak).toBe(CURRENT_STREAK)
    expect(tiles.longestStreak).toBeGreaterThanOrEqual(tiles.currentStreak)
    expect(tiles.averageOverall?.mean).toBeGreaterThan(3)
    expect(tiles.openWishlist).toBeGreaterThan(0)
  })

  it('fills every chart with something to look at', () => {
    const meals = eatenMeals(data)
    expect(ratingsOverTime(meals).length).toBeGreaterThan(40)
    expect(criteriaProfile(meals, criteria).every((c) => c.value !== null)).toBe(true)
    expect(cravingVsReality(meals).accuracy).toBeGreaterThan(0.5)
    expect(courseMix(meals).length).toBeGreaterThan(2)
    expect(calorieCharts(meals).perWeek.length).toBeGreaterThan(8)
    expect(reactionTrend(meals).length).toBeGreaterThanOrEqual(3)
    expect(recipeStats(meals).ingredients.length).toBe(10)
    expect(hallOfFame(dishStats(meals))).toHaveLength(5)
    expect(funFacts(meals, data.servings, today).length).toBeGreaterThanOrEqual(5)
    expect(filterMeals(meals, rangeFor('month', today)).length).toBeLessThan(meals.length)
  })
})
