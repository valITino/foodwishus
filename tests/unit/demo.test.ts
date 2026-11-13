import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppDB, META } from '../../src/data/db'
import { hm, zurichIso } from '../../src/data/demo/clock'
import { buildDemoRows, CURRENT_STREAK, HISTORY_DAYS, type DemoRows } from '../../src/data/demo/history'
import { demoNews } from '../../src/data/demo/news'
import { PHOTO_JOBS } from '../../src/data/demo/photos'
import { ensureDemoKitchen, seedDemoPhotos } from '../../src/data/demo/seed'
import { CRITERIA } from '../../src/data/demo/story'
import { byPriority } from '../../src/data/queries'
import { newId, type Criterion, type Day, type Dish, type ID, type Member, type Menu, type Review, type Serving } from '../../src/data/types'
import { getLang, setLang, type Lang } from '../../src/i18n'
import { addDays, diffDays, formatTime, toDay, today, weekdayIndex, zurichHour } from '../../src/lib/dates'
import { DISH_ICONS } from '../../src/ui/deco/registry'

let counter = 0

interface Kitchen {
  db: AppDB
  day: Day
  members: Member[]
  chef: Member
  taster: Member
  criteria: Criterion[]
  dishes: Dish[]
  menus: Menu[]
  servings: Serving[]
  reviews: Review[]
  eaten: Serving[]
}

/** Open a fresh demo kitchen in its own database and read everything back. */
async function openDemo(options: { lang?: Lang; today?: Day } = {}): Promise<Kitchen> {
  const db = new AppDB(`demo-test-${++counter}-${Math.random().toString(36).slice(2)}`)
  const day = options.today ?? today()
  await ensureDemoKitchen(db, { ...options, today: day })
  const members = await db.members.toArray()
  const servings = await db.servings.toArray()
  return {
    db,
    day,
    members,
    chef: members.find((m) => m.defaultRole === 'chef') as Member,
    taster: members.find((m) => m.defaultRole === 'taster') as Member,
    criteria: (await db.criteria.toArray()).sort((a, b) => a.sortOrder - b.sortOrder),
    dishes: await db.dishes.toArray(),
    menus: await db.menus.toArray(),
    servings,
    reviews: await db.reviews.toArray(),
    eaten: servings.filter((s) => s.status === 'eaten'),
  }
}

/** Everything in the database as plain data, for "nothing changed" checks. */
async function dump(db: AppDB): Promise<string> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) tables[table.name] = await table.toArray()
  return JSON.stringify(tables)
}

/** Build the rows without a database, for a given day. */
function build(day: Day, lang: Lang = 'en'): DemoRows & { criteria: Criterion[] } {
  const householdId = newId()
  const criteria: Criterion[] = CRITERIA.map(([, label, , icon], sortOrder) => ({ id: newId(), householdId, label, icon, active: true, sortOrder, createdAt: '', updatedAt: '', deletedAt: null }))
  return { ...buildDemoRows({ kitchen: { householdId, chefId: 'mia', tasterId: 'leo' }, criteria, today: day, lang }), criteria }
}

/** Consecutive days with at least one eaten serving, counted back from today (or from yesterday, while today is still empty). */
function currentStreak(eaten: Serving[], day: Day): number {
  const days = new Set(eaten.map((s) => toDay(s.eatenAt as string)))
  let at = days.has(day) ? day : addDays(day, -1)
  let streak = 0
  while (days.has(at)) {
    streak++
    at = addDays(at, -1)
  }
  return streak
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length

let kitchen: Kitchen
const startLang = getLang()

beforeAll(async () => {
  kitchen = await openDemo({ lang: 'en' })
})

afterAll(() => setLang(startLang))

describe('what the demo kitchen contains', () => {
  it('has the two of them, six criteria and about thirty complete recipe cards', () => {
    const { members, criteria, dishes } = kitchen
    expect(members.map((m) => m.name).sort()).toEqual(['Leo', 'Mia'])
    expect(criteria).toHaveLength(6)
    expect(dishes.length).toBeGreaterThanOrEqual(28)
    expect(dishes.length).toBeLessThanOrEqual(36)
    expect(new Set(dishes.map((d) => d.name)).size).toBe(dishes.length)

    for (const dish of dishes) {
      const where = `dish "${dish.name}"`
      expect(dish.description, where).toBeTruthy()
      expect(dish.tags.length, where).toBeGreaterThan(0)
      expect(dish.effort, where).not.toBeNull()
      expect(DISH_ICONS as readonly string[], where).toContain(dish.icon)
      expect(members.map((m) => m.id), where).toContain(dish.createdBy)
      const { recipe } = dish
      expect(recipe.servings, where).toBeGreaterThan(0)
      expect(recipe.prepMinutes, where).toBeGreaterThan(0)
      expect(recipe.cookMinutes, where).toBeGreaterThanOrEqual(0)
      expect(recipe.ingredients?.length, where).toBeGreaterThanOrEqual(5)
      expect(recipe.steps?.length, where).toBeGreaterThanOrEqual(4)
      expect(recipe.steps?.length, where).toBeLessThanOrEqual(8)
      for (const ingredient of recipe.ingredients ?? []) {
        expect(ingredient.name, where).toBeTruthy()
        if (ingredient.quantity !== undefined) expect(ingredient.quantity, where).toBeGreaterThan(0)
        // Metric kitchen: no cups, ounces or pounds.
        if (ingredient.unit) expect(ingredient.unit, where).not.toMatch(/^(cups?|oz|lb|lbs|ounces?|pounds?)$/i)
      }
      for (const step of recipe.steps ?? []) expect(step.text.length, where).toBeGreaterThan(10)
    }

    expect(dishes.filter((d) => d.recipe.steps?.some((s) => s.timerSeconds)).length).toBeGreaterThan(20)
    const unknown = dishes.filter((d) => d.nutrition.kcalPerServing === undefined)
    expect(unknown.length).toBeGreaterThanOrEqual(2)
    expect(unknown.length).toBeLessThanOrEqual(3)
    expect(dishes.filter((d) => d.nutrition.isEstimate).length).toBeGreaterThanOrEqual(3)
    for (const course of ['starter', 'main', 'side', 'dessert', 'breakfast', 'snack', 'drink']) {
      expect(dishes.some((d) => d.course === course), `a ${course}`).toBe(true)
    }
  })

  it('has four menus built from those dishes', () => {
    const dishIds = new Set(kitchen.dishes.map((d) => d.id))
    expect(kitchen.menus).toHaveLength(4)
    for (const menu of kitchen.menus) {
      expect(menu.courses.length, menu.name).toBeGreaterThanOrEqual(3)
      expect(menu.courses.map((c) => c.order), menu.name).toEqual(menu.courses.map((_, i) => i))
      for (const course of menu.courses) expect(dishIds.has(course.dishId), menu.name).toBe(true)
    }
  })

  it('has three months of meals, tonight, the coming week and a wishlist', () => {
    const { servings, eaten, reviews, day } = kitchen
    expect(eaten.length).toBeGreaterThanOrEqual(55)
    expect(eaten.length).toBeLessThanOrEqual(70)
    expect(reviews).toHaveLength(eaten.length)

    const skipped = servings.filter((s) => s.status === 'skipped')
    expect(skipped.length).toBeGreaterThanOrEqual(6)
    expect(skipped.length).toBeLessThanOrEqual(8)
    for (const skip of skipped) expect(skip.skippedReason).toBeTruthy()

    const planned = servings.filter((s) => s.status === 'planned')
    expect(planned.filter((s) => s.plannedDate === day).map((s) => s.plannedSlot)).toEqual(['dinner'])
    const comingUp = planned.filter((s) => s.plannedDate !== day)
    expect(comingUp.length).toBeGreaterThanOrEqual(4)
    expect(comingUp.length).toBeLessThanOrEqual(5)
    for (const serving of comingUp) {
      const ahead = diffDays(day, serving.plannedDate as Day)
      expect(ahead).toBeGreaterThanOrEqual(1)
      expect(ahead).toBeLessThanOrEqual(7)
    }

    const wishlist = servings.filter((s) => s.status === 'wishlist')
    expect(wishlist).toHaveLength(8)
    expect(wishlist.filter((s) => s.craving !== null).length).toBeGreaterThanOrEqual(3)
    expect(wishlist.filter((s) => s.craving === null).length).toBeGreaterThanOrEqual(2)
    expect(wishlist.filter((s) => s.note).length).toBeGreaterThanOrEqual(4)
    expect(servings.filter((s) => s.status === 'served')).toHaveLength(0)
  })

  it('keeps every row in the one demo kitchen, with nothing deleted', () => {
    const householdId = kitchen.members[0].householdId
    const rows = [...kitchen.dishes, ...kitchen.menus, ...kitchen.servings, ...kitchen.reviews, ...kitchen.criteria, ...kitchen.members]
    expect(rows.every((row) => row.householdId === householdId && row.deletedAt === null)).toBe(true)
  })

  it('never uses the outbox: the demo does not sync', async () => {
    expect(await kitchen.db.outbox.count()).toBe(0)
    expect(await kitchen.db.deadLetters.count()).toBe(0)
    expect(await kitchen.db.getMeta(META.memberId)).toBe(kitchen.taster.id)
  })
})

describe('how the rows hang together', () => {
  it('points every serving to an existing dish or menu, and to the people who proposed and cooked it', () => {
    const dishIds = new Set(kitchen.dishes.map((d) => d.id))
    const menuIds = new Set(kitchen.menus.map((m) => m.id))
    const memberIds = new Set(kitchen.members.map((m) => m.id))
    for (const serving of kitchen.servings) {
      const hasDish = serving.dishId !== null && dishIds.has(serving.dishId)
      const hasMenu = serving.menuId !== null && menuIds.has(serving.menuId)
      expect(hasDish !== hasMenu, `serving ${serving.id} has exactly one of dish and menu`).toBe(true)
      expect(memberIds.has(serving.proposedBy as ID)).toBe(true)
      expect(memberIds.has(serving.cookedBy as ID)).toBe(true)
    }
    expect(kitchen.servings.some((s) => s.menuId !== null)).toBe(true)
  })

  it('gives every eaten serving exactly one review, and every review an eaten serving', () => {
    const eatenIds = new Set(kitchen.eaten.map((s) => s.id))
    const reviewed = new Map<ID, number>()
    for (const review of kitchen.reviews) {
      expect(eatenIds.has(review.servingId)).toBe(true)
      reviewed.set(review.servingId, (reviewed.get(review.servingId) ?? 0) + 1)
    }
    for (const serving of kitchen.eaten) expect(reviewed.get(serving.id), `reviews of ${serving.id}`).toBe(1)
  })

  it('scores only the active criteria, all of them, by the person who did not cook', () => {
    const active = kitchen.criteria.filter((c) => c.active).map((c) => c.id).sort()
    const servingById = new Map(kitchen.servings.map((s) => [s.id, s]))
    for (const review of kitchen.reviews) {
      const serving = servingById.get(review.servingId) as Serving
      expect(Object.keys(review.scores).sort()).toEqual(active)
      for (const value of Object.values(review.scores)) expect([1, 2, 3, 4, 5]).toContain(value)
      expect([1, 2, 3, 4, 5]).toContain(review.overall)
      expect([1, 2, 3, 4, 5, 6]).toContain(review.reaction)
      expect([0.5, 1, 1.5, 2]).toContain(review.portionsEaten)
      expect(typeof review.wouldEatAgain).toBe('boolean')
      expect(review.dishId).toBe(serving.dishId)
      expect(review.reviewerId).not.toBe(serving.cookedBy)
      expect([kitchen.chef.id, kitchen.taster.id]).toContain(review.reviewerId)
      // Sealed exactly 24 hours after it was written.
      expect(Date.parse(review.sealedAt as string) - Date.parse(review.createdAt)).toBe(24 * 3600 * 1000)
    }
  })

  it('lets Mia propose and cook, with a handful of meals proposed or cooked by Leo', () => {
    const { eaten, chef, taster } = kitchen
    const byLeo = eaten.filter((s) => s.cookedBy === taster.id || s.proposedBy === taster.id)
    expect(byLeo.length).toBeGreaterThanOrEqual(4)
    expect(byLeo.length).toBeLessThanOrEqual(12)
    expect(eaten.filter((s) => s.cookedBy === chef.id).length).toBeGreaterThan(eaten.length * 0.8)
    expect(eaten.filter((s) => s.cookedBy === taster.id).length).toBeGreaterThanOrEqual(3)
  })
})

describe('when things happened', () => {
  it('puts every eaten serving on its planned day, at a sensible time for its slot', () => {
    const hours: Record<string, [number, number]> = { breakfast: [6, 11], lunch: [12, 14], dinner: [18, 21], dessert: [15, 22] }
    for (const serving of kitchen.eaten) {
      const where = `serving on ${serving.plannedDate} (${serving.plannedSlot}, eaten ${formatTime(serving.eatenAt as string, 'en')})`
      expect(serving.plannedDate, where).not.toBeNull()
      expect(serving.plannedSlot, where).not.toBeNull()
      expect(toDay(serving.eatenAt as string), where).toBe(serving.plannedDate)
      const [from, to] = hours[serving.plannedSlot as string]
      const hour = zurichHour(serving.eatenAt as string)
      expect(hour, where).toBeGreaterThanOrEqual(from)
      expect(hour, where).toBeLessThanOrEqual(to)
      expect(serving.craving, where).not.toBeNull()
      expect((serving.proposedAt as string) < (serving.servedAt as string), where).toBe(true)
      expect((serving.servedAt as string) < (serving.eatenAt as string), where).toBe(true)
      expect(serving.createdAt, where).toBe(serving.proposedAt)
    }
  })

  it('never lies in the future', () => {
    const now = new Date().toISOString()
    const { day } = kitchen
    for (const serving of kitchen.eaten) {
      for (const moment of [serving.proposedAt, serving.servedAt, serving.eatenAt, serving.createdAt, serving.updatedAt]) expect((moment as string) <= now).toBe(true)
      const ago = diffDays(serving.plannedDate as Day, day)
      expect(ago).toBeGreaterThanOrEqual(1)
      expect(ago).toBeLessThanOrEqual(HISTORY_DAYS)
    }
    for (const review of kitchen.reviews) {
      expect(review.createdAt <= now).toBe(true)
      expect(review.updatedAt <= now).toBe(true)
      expect(review.updatedAt >= review.createdAt).toBe(true)
    }
    for (const serving of kitchen.servings) expect(serving.proposedAt <= now, `${serving.status} serving proposed in the past`).toBe(true)
    for (const dish of kitchen.dishes) expect(dish.createdAt <= now).toBe(true)
    // A recipe card exists before it is first proposed.
    const cards = new Map(kitchen.dishes.map((d) => [d.id, d.createdAt]))
    for (const serving of kitchen.servings) if (serving.dishId) expect((cards.get(serving.dishId) as string) < serving.proposedAt).toBe(true)
  })

  it('has a realistic rhythm: mostly dinners, breakfasts at the weekend, days without a meal', () => {
    const { eaten } = kitchen
    const count = (slot: string): number => eaten.filter((s) => s.plannedSlot === slot).length
    expect(count('dinner')).toBeGreaterThan(count('breakfast') + count('lunch'))
    expect(count('breakfast')).toBeGreaterThanOrEqual(6)
    expect(count('lunch')).toBeGreaterThanOrEqual(4)
    expect(count('dessert')).toBeGreaterThanOrEqual(4)
    const breakfasts = eaten.filter((s) => s.plannedSlot === 'breakfast')
    expect(breakfasts.filter((s) => weekdayIndex(s.plannedDate as Day) >= 5).length).toBeGreaterThan(breakfasts.length * 0.6)
    const daysWithMeals = new Set(eaten.map((s) => s.plannedDate)).size
    expect(daysWithMeals).toBeLessThan(HISTORY_DAYS - 15)
    expect(daysWithMeals).toBeGreaterThan(35)
  })

  it('is on a streak of four days', () => {
    expect(CURRENT_STREAK).toBe(4)
    expect(currentStreak(kitchen.eaten, kitchen.day)).toBe(4)
  })
})

describe('the wishlist order', () => {
  it('hands out strictly increasing priorities, in the order servings were created', () => {
    const rows = build(today())
    const open = rows.servings.filter((s) => s.status === 'wishlist' || s.status === 'planned')
    expect(open).toHaveLength(14)
    for (let i = 1; i < rows.servings.length; i++) expect(rows.servings[i - 1].priority < rows.servings[i].priority, `priority ${i}`).toBe(true)
    for (let i = 1; i < open.length; i++) expect(open[i - 1].priority < open[i].priority).toBe(true)
  })

  it('reads sensibly: the planned week by date, then what he craves most, new ideas last', () => {
    const open = kitchen.servings.filter((s) => s.status === 'wishlist' || s.status === 'planned').sort(byPriority)
    expect(new Set(open.map((s) => s.priority)).size).toBe(open.length)
    const planned = open.filter((s) => s.status === 'planned')
    const wishlist = open.filter((s) => s.status === 'wishlist')
    expect(open.slice(0, planned.length)).toEqual(planned)
    expect(planned.map((s) => s.plannedDate)).toEqual(planned.map((s) => s.plannedDate).sort())
    const cravings = wishlist.map((s) => s.craving ?? 0)
    expect(cravings).toEqual([...cravings].sort((a, b) => b - a))
  })
})

describe('the stories in the numbers', () => {
  const overallByDish = (k: Kitchen): Map<ID, number[]> => {
    const byDish = new Map<ID, number[]>()
    for (const review of k.reviews) byDish.set(review.dishId as ID, [...(byDish.get(review.dishId as ID) ?? []), review.overall as number])
    return byDish
  }

  it('has a clear favourite: the most eaten dish is also the best rated', () => {
    const ranked = [...overallByDish(kitchen)].filter(([, ratings]) => ratings.length >= 2)
    const mostEaten = [...ranked].sort((a, b) => b[1].length - a[1].length)[0]
    const bestRated = [...ranked].sort((a, b) => mean(b[1]) - mean(a[1]) || b[1].length - a[1].length)[0]
    expect(mostEaten[0]).toBe(bestRated[0])
    expect(mostEaten[1].length).toBeGreaterThanOrEqual(5)
    expect(mean(bestRated[1])).toBeGreaterThanOrEqual(4.5)
    expect(kitchen.dishes.find((d) => d.id === mostEaten[0])?.name).toBe('Älplermagronen')
  })

  it('has one divisive dish and one kitchen disaster', () => {
    const divisive = [...overallByDish(kitchen)].filter(([, ratings]) => ratings.length >= 3 && Math.min(...ratings) <= 2 && Math.max(...ratings) >= 4)
    expect(divisive).toHaveLength(1)
    const disasters = kitchen.reviews.filter((r) => r.reaction === 1)
    expect(disasters).toHaveLength(1)
    expect(disasters[0].overall).toBe(1)
    expect(disasters[0].wouldEatAgain).toBe(false)
    expect(disasters[0].comment).toBeTruthy()
    // The same dish got a second chance, and it went well.
    const again = kitchen.reviews.filter((r) => r.dishId === disasters[0].dishId)
    expect(again).toHaveLength(2)
    expect(Math.max(...again.map((r) => r.overall as number))).toBeGreaterThanOrEqual(4)
  })

  it('lets cravings mostly, but not always, predict the rating', () => {
    const servingById = new Map(kitchen.servings.map((s) => [s.id, s]))
    const gaps = kitchen.reviews.map((r) => Math.abs((servingById.get(r.servingId)?.craving as number) - (r.overall as number)))
    const accuracy = 1 - mean(gaps) / 4
    expect(accuracy).toBeGreaterThan(0.72)
    expect(accuracy).toBeLessThan(0.92)
    expect(gaps.filter((gap) => gap >= 2).length).toBeGreaterThanOrEqual(3)
    expect(gaps.filter((gap) => gap === 0).length).toBeGreaterThan(gaps.length * 0.3)
  })

  it('has lively reviews: comments, chips, extra reactions, and a Chef who answers', () => {
    const { reviews } = kitchen
    const share = (test: (r: Review) => boolean): number => reviews.filter(test).length / reviews.length
    for (const part of [share((r) => Boolean(r.comment)), share((r) => r.chips.length > 0), share((r) => r.extraReactions.length > 0), share((r) => Boolean(r.chefReply)), share((r) => r.chefReaction !== null), share((r) => r.chefSelfRating !== null)]) {
      expect(part).toBeGreaterThan(0.1)
      expect(part).toBeLessThan(0.9)
    }
    expect(reviews.some((r) => r.chefExtraReactions.length > 0)).toBe(true)
    expect(new Set(reviews.map((r) => r.reaction)).size).toBeGreaterThanOrEqual(5)
    expect(new Set(reviews.map((r) => r.overall)).size).toBe(5)
    expect(new Set(reviews.map((r) => r.portionsEaten)).size).toBeGreaterThanOrEqual(3)
  })
})

describe('seeding again', () => {
  it('builds the same kitchen twice on the same day', () => {
    const day = today()
    const [first, second] = [build(day), build(day)]
    const story = (rows: DemoRows & { criteria: Criterion[] }) => {
      const dish = new Map(rows.dishes.map((d) => [d.id, d.name]))
      const menu = new Map(rows.menus.map((m) => [m.id, m.name]))
      const serving = new Map(rows.servings.map((s) => [s.id, s]))
      const criterion = new Map(rows.criteria.map((c) => [c.id, c.label]))
      return {
        dishes: rows.dishes.map(({ id: _id, householdId: _h, ...rest }) => rest),
        menus: rows.menus.map(({ id: _id, householdId: _h, courses, ...rest }) => ({ ...rest, courses: courses.map((c) => dish.get(c.dishId)) })),
        servings: rows.servings.map(({ id: _id, householdId: _h, dishId, menuId, ...rest }) => ({ ...rest, what: dishId ? dish.get(dishId) : menu.get(menuId as ID) })),
        reviews: rows.reviews.map(({ id: _id, householdId: _h, servingId, dishId, scores, ...rest }) => ({
          ...rest,
          what: dish.get(dishId as ID),
          eatenAt: serving.get(servingId)?.eatenAt,
          scores: Object.fromEntries(Object.entries(scores).map(([id, value]) => [criterion.get(id), value])),
        })),
        photos: rows.photoJobs.map(({ photoId: _p, householdId: _h, servingId, dishId, ...rest }) => ({ ...rest, eatenAt: servingId ? serving.get(servingId)?.eatenAt : undefined, card: dishId ? dish.get(dishId) : undefined })),
      }
    }
    expect(story(second)).toEqual(story(first))
    // Ids stay random.
    expect(second.dishes[0].id).not.toBe(first.dishes[0].id)
  })

  it('changes nothing when the demo is opened a second time', async () => {
    const before = await dump(kitchen.db)
    await ensureDemoKitchen(kitchen.db)
    await ensureDemoKitchen(kitchen.db, { lang: 'de' })
    expect(await dump(kitchen.db)).toBe(before)
  })

  it('creates one kitchen when two starts race each other', async () => {
    const db = new AppDB(`demo-race-${Math.random().toString(36).slice(2)}`)
    await Promise.all([ensureDemoKitchen(db), ensureDemoKitchen(db), ensureDemoKitchen(db)])
    expect(await db.households.count()).toBe(1)
    expect(await db.members.count()).toBe(2)
    expect(await db.criteria.count()).toBe(6)
    expect(await db.dishes.count()).toBe(kitchen.dishes.length)
    expect(await db.servings.count()).toBe(kitchen.servings.length)
  })
})

describe('both languages', () => {
  it('seeds in English and in German without errors, with the same shape', async () => {
    const german = await openDemo({ lang: 'de' })
    expect(german.dishes).toHaveLength(kitchen.dishes.length)
    expect(german.servings).toHaveLength(kitchen.servings.length)
    expect(german.reviews).toHaveLength(kitchen.reviews.length)
    expect(german.criteria.map((c) => c.label)).toEqual(['Geschmack', 'Konsistenz', 'Duft', 'Aussehen', 'Portion', 'Temperatur'])
    expect(kitchen.criteria.map((c) => c.label)).toEqual(['Taste', 'Texture', 'Smell', 'Looks', 'Portion', 'Temperature'])
    expect(german.dishes.map((d) => d.name)).toContain('Rösti mit Spiegelei')
    expect(kitchen.dishes.map((d) => d.name)).toContain('Rösti with fried egg')

    // Swiss spelling: ss, never ß. And the two languages really differ.
    const text = await dump(german.db)
    expect(text).not.toContain('ß')
    const english = new Set(kitchen.dishes.map((d) => d.description))
    expect(german.dishes.filter((d) => english.has(d.description as string))).toHaveLength(0)
    // Liquids the Swiss way.
    expect(german.dishes.flatMap((d) => d.recipe.ingredients ?? []).some((i) => i.unit === 'dl')).toBe(true)
    expect(kitchen.dishes.flatMap((d) => d.recipe.ingredients ?? []).some((i) => i.unit === 'dl')).toBe(false)
  })

  it('uses the language the app is set to when nothing else is said', async () => {
    setLang('de')
    const db = new AppDB(`demo-lang-${Math.random().toString(36).slice(2)}`)
    await ensureDemoKitchen(db)
    setLang('en')
    expect((await db.households.toArray())[0].name).toBe('Demo-Küche')
    expect((await db.dishes.toArray()).map((d) => d.name)).toContain('Kürbissuppe')
  })
})

describe('photos', () => {
  it('skips them where there is no canvas, and keeps the list for later', async () => {
    const { db, eaten, dishes } = kitchen
    expect(await seedDemoPhotos(db)).toBe(0)
    expect(await db.photos.count()).toBe(0)
    expect(await db.blobs.count()).toBe(0)
    expect(eaten.every((s) => s.proofPhotos.length === 0)).toBe(true)

    const jobs = (await db.getMeta<{ photoId: ID; kind: string; source: string; servingId?: ID; dishId?: ID; takenAt: string }[]>(PHOTO_JOBS)) ?? []
    const proofs = jobs.filter((job) => job.kind === 'proof')
    const covers = jobs.filter((job) => job.kind === 'cover')
    expect(proofs.length).toBeGreaterThanOrEqual(24)
    expect(covers.length).toBeGreaterThanOrEqual(8)
    expect(covers.length).toBeLessThanOrEqual(12)
    expect(new Set(jobs.map((job) => job.photoId)).size).toBe(jobs.length)

    // The most recent meals are covered, each photo taken the moment the meal was eaten.
    const eatenAt = new Map(eaten.map((s) => [s.id, s.eatenAt]))
    const recent = [...eaten].sort((a, b) => ((a.eatenAt as string) < (b.eatenAt as string) ? 1 : -1)).slice(0, 24)
    const withProof = new Set(proofs.map((job) => job.servingId))
    for (const serving of recent) expect(withProof.has(serving.id)).toBe(true)
    for (const job of proofs) expect(job.takenAt).toBe(eatenAt.get(job.servingId as ID))
    const dishIds = new Set(dishes.map((d) => d.id))
    for (const job of covers) expect(dishIds.has(job.dishId as ID)).toBe(true)
    const camera = proofs.filter((job) => job.source === 'camera').length
    expect(camera).toBeGreaterThan(proofs.length * 0.7)
    expect(camera).toBeLessThan(proofs.length)
  })
})

describe('on any day of the year', () => {
  // Every weekday, both clock changes, a year end and a leap day.
  const days: Day[] = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-10-25', '2026-10-26', '2027-01-01', '2027-03-28', '2027-03-29', '2028-02-29', '2028-07-17']

  it.each(days)('keeps its promises when opened on %s', (day) => {
    const rows = build(day, day.endsWith('5') ? 'de' : 'en')
    const eaten = rows.servings.filter((s) => s.status === 'eaten')
    expect(eaten.length).toBeGreaterThanOrEqual(55)
    expect(eaten.length).toBeLessThanOrEqual(70)
    expect(rows.reviews).toHaveLength(eaten.length)
    expect(currentStreak(eaten, day)).toBe(4)

    const hours: Record<string, [number, number]> = { breakfast: [6, 11], lunch: [12, 14], dinner: [18, 21], dessert: [15, 22] }
    for (const serving of eaten) {
      expect(toDay(serving.eatenAt as string)).toBe(serving.plannedDate)
      expect((serving.plannedDate as Day) < day).toBe(true)
      const [from, to] = hours[serving.plannedSlot as string]
      expect(zurichHour(serving.eatenAt as string)).toBeGreaterThanOrEqual(from)
      expect(zurichHour(serving.eatenAt as string)).toBeLessThanOrEqual(to)
    }
    // Nothing that has happened is dated today or later.
    for (const review of rows.reviews) {
      expect(toDay(review.createdAt) < day).toBe(true)
      expect(toDay(review.updatedAt) < day).toBe(true)
    }
    for (const serving of rows.servings) expect(toDay(serving.proposedAt) < day).toBe(true)
    for (const serving of rows.servings) expect(toDay(serving.updatedAt) < day).toBe(true)

    // No two meals share a slot on the same day, eaten or skipped.
    const slots = rows.servings.filter((s) => s.plannedDate && s.status !== 'planned').map((s) => `${s.plannedDate}/${s.plannedSlot}`)
    expect(new Set(slots).size).toBe(slots.length)

    const planned = rows.servings.filter((s) => s.status === 'planned')
    expect(planned.filter((s) => s.plannedDate === day)).toHaveLength(1)
    expect(planned.length).toBeGreaterThanOrEqual(5)
    expect(planned.length).toBeLessThanOrEqual(6)
    expect(new Set(planned.map((s) => `${s.plannedDate}/${s.plannedSlot}`)).size).toBe(planned.length)
    expect(rows.servings.filter((s) => s.status === 'wishlist')).toHaveLength(8)
    expect(rows.servings.filter((s) => s.status === 'skipped').length).toBeGreaterThanOrEqual(6)
  })
})

describe('Zurich clock', () => {
  it('turns a day and a wall-clock time into the right moment, summer and winter', () => {
    expect(zurichIso('2026-07-01', hm(19, 30))).toBe('2026-07-01T17:30:00.000Z')
    expect(zurichIso('2026-12-01', hm(19, 30))).toBe('2026-12-01T18:30:00.000Z')
    // The night the clocks go back, and the night they go forward.
    expect(zurichIso('2026-10-25', hm(9, 0))).toBe('2026-10-25T08:00:00.000Z')
    expect(zurichIso('2027-03-28', hm(9, 0))).toBe('2027-03-28T07:00:00.000Z')
    expect(toDay(zurichIso('2026-10-25', hm(0, 5)))).toBe('2026-10-25')
    expect(toDay(zurichIso('2027-03-28', hm(23, 55)))).toBe('2027-03-28')
  })
})

describe('the demo kitchen: lines for the bell', () => {
  it('has the same five lines to show on every day of the year, whichever of them is the newest', () => {
    const newest = new Set<string>()
    for (let n = 0; n < 366; n++) {
      const day = addDays('2026-01-01', n)
      const rows = build(day)
      const news = demoNews(rows, { householdId: rows.servings[0].householdId, chefId: 'mia', tasterId: 'leo' })
      const kinds = news.map((line) => line.kind)
      expect(news, day).toHaveLength(5)
      // An answer to a verdict, two plans, two wishes: what the bell is for.
      expect([...kinds].sort(), day).toEqual(['answered', 'planned', 'planned', 'proposed', 'proposed'])
      // Oldest first, and the two newest are the ones still unread.
      expect(news.map((line) => line.at), day).toEqual(news.map((line) => line.at).sort())
      expect(news.map((line) => line.seenAt === null), day).toEqual([false, false, false, true, true])
      newest.add(kinds[4])
    }
    // The story is told backwards from today, so the newest line is not the same kind every day.
    // (A test that expected the answer on top passed on the two days it was written, and failed the day after.)
    expect([...newest].sort()).toEqual(['answered', 'planned', 'proposed'])
  })
})
