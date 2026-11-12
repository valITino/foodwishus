import { describe, expect, it } from 'vitest'
import { MANY_DISHES, NEWS_DAYS, NEWS_KEEP, newsFrom, newsLink, staleNews, tidyNews, type NewsDraft } from '../../src/data/news'
import type { Dish, Member, Menu, Review, Serving } from '../../src/data/types'

const MIA = 'mia' // cooks
const LEO = 'leo' // eats
const people = [{ id: MIA }, { id: LEO }]
const AT = '2026-11-12T18:00:00.000Z'

function serving(overrides: Partial<Serving> = {}): Serving {
  return {
    id: 's1',
    householdId: 'kitchen',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: AT,
    deletedAt: null,
    dishId: 'rösti',
    menuId: null,
    proposedBy: MIA,
    cookedBy: MIA,
    proposedAt: '2026-11-10T10:00:00.000Z',
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
    ...overrides,
  }
}

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    householdId: 'kitchen',
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    servingId: 's1',
    dishId: 'rösti',
    reviewerId: LEO,
    reaction: 5,
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
    ...overrides,
  }
}

const dish = (id: string, overrides: Partial<Dish> = {}): Dish =>
  ({ id, householdId: 'kitchen', createdAt: AT, updatedAt: AT, deletedAt: null, name: id, description: null, course: 'main', tags: [], effort: null, recipe: {}, nutrition: {}, coverPhotoId: null, icon: null, createdBy: MIA, archived: false, ...overrides }) as Dish

const kinds = (news: NewsDraft[]) => news.map((n) => n.kind)
const meal = (before: Serving | undefined, after: Serving) => newsFrom('servings', before, after, people)

describe('what a changed meal is worth telling', () => {
  it('a new wish, a meal that arrives planned, one that arrives on the table', () => {
    expect(meal(undefined, serving())).toEqual([{ kind: 'proposed', at: AT, actorId: MIA, servingId: 's1', dishId: 'rösti', facts: {} }])
    expect(meal(undefined, serving({ status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'dinner', proposedBy: LEO }))).toEqual([
      { kind: 'planned', at: AT, actorId: LEO, servingId: 's1', dishId: 'rösti', facts: { day: '2026-11-13', slot: 'dinner' } },
    ])
    expect(meal(undefined, serving({ status: 'served' }))).toMatchObject([{ kind: 'served', actorId: MIA }])
    // A menu is named by its menu.
    expect(meal(undefined, serving({ dishId: null, menuId: 'brunch' }))[0]).toMatchObject({ menuId: 'brunch' })
    expect(meal(undefined, serving({ dishId: null, menuId: 'brunch' }))[0]).not.toHaveProperty('dishId')
  })

  it('old history arriving (a backup) is not news', () => {
    expect(meal(undefined, serving({ status: 'eaten' }))).toEqual([])
    expect(meal(undefined, serving({ status: 'skipped' }))).toEqual([])
    expect(meal(undefined, serving({ deletedAt: AT }))).toEqual([])
  })

  it('follows a meal from wish to plate', () => {
    const wish = serving()
    const planned = serving({ status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'dinner' })
    const served = { ...planned, status: 'served' as const, servedAt: AT }
    const eaten = { ...served, status: 'eaten' as const, eatenAt: AT }

    // Either of them may have planned it: no name.
    expect(meal(wish, planned)).toEqual([{ kind: 'planned', at: AT, actorId: null, servingId: 's1', dishId: 'rösti', facts: { day: '2026-11-13', slot: 'dinner' } }])
    // The cook serves, the other one eats.
    expect(meal(planned, served)).toMatchObject([{ kind: 'served', actorId: MIA }])
    expect(meal(wish, served)).toMatchObject([{ kind: 'served', actorId: MIA }])
    expect(meal(served, eaten)).toMatchObject([{ kind: 'eaten', actorId: LEO }])
    // Straight from planned to eaten (the cook never tapped Served).
    expect(meal(planned, eaten)).toMatchObject([{ kind: 'eaten', actorId: LEO }])
  })

  it('tells a move, a step back to the wishlist, a skip and a removal', () => {
    const planned = serving({ status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'dinner' })
    expect(meal(planned, { ...planned, plannedDate: '2026-11-14' })).toMatchObject([{ kind: 'moved', facts: { day: '2026-11-14', slot: 'dinner' } }])
    expect(meal(planned, { ...planned, plannedSlot: 'lunch' })).toMatchObject([{ kind: 'moved', facts: { day: '2026-11-13', slot: 'lunch' } }])
    expect(kinds(meal(planned, serving()))).toEqual(['unplanned'])
    expect(meal(planned, { ...planned, status: 'skipped', skippedReason: 'Ate out' })).toMatchObject([{ kind: 'skipped', facts: { reason: 'Ate out' } }])
    expect(kinds(meal(serving({ status: 'skipped' }), planned))).toEqual(['planned'])
    expect(kinds(meal(planned, { ...planned, deletedAt: AT }))).toEqual(['removed'])
    // An eaten meal that is taken out again, or a skipped one that is cleared away: no line.
    expect(meal(serving({ status: 'eaten' }), serving({ status: 'eaten', deletedAt: AT }))).toEqual([])
    expect(meal(serving({ status: 'skipped' }), serving({ status: 'skipped', deletedAt: AT }))).toEqual([])
  })

  it('says nothing when nothing worth telling changed', () => {
    const planned = serving({ status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'dinner' })
    expect(meal(planned, { ...planned, updatedAt: '2026-11-12T19:00:00.000Z', priority: 'b1', suggestedDays: ['2026-11-14'] })).toEqual([])
    // Taking a mis-tapped "Served" back, and bringing a skipped wish back.
    expect(meal({ ...planned, status: 'served' }, planned)).toEqual([])
    expect(meal(serving({ status: 'skipped' }), serving())).toEqual([])
    // Proof photos and the time of an eaten meal.
    const eaten = serving({ status: 'eaten', eatenAt: AT })
    expect(meal(eaten, { ...eaten, eatenAt: '2026-11-12T19:30:00.000Z', proofPhotos: [{ photoId: 'p', source: 'camera', takenAt: AT }] })).toEqual([])
  })

  it("hearts are the eater's, a note is the proposer's, and a new cook is told once", () => {
    const wish = serving()
    expect(meal(wish, { ...wish, craving: 4 })).toEqual([{ kind: 'hearts', at: AT, actorId: LEO, servingId: 's1', dishId: 'rösti', facts: { hearts: 4 } }])
    expect(meal({ ...wish, craving: 4 }, { ...wish, craving: null })).toEqual([])
    expect(meal(wish, { ...wish, note: 'Extra cheese' })).toMatchObject([{ kind: 'note', actorId: MIA }])
    expect(meal({ ...wish, note: 'Extra cheese' }, { ...wish, note: null })).toEqual([])
    // The cook changes and the hearts are cleared with it: one line, about the cook.
    expect(meal({ ...wish, craving: 5 }, { ...wish, cookedBy: LEO, craving: null })).toEqual([{ kind: 'cook', at: AT, actorId: null, servingId: 's1', dishId: 'rösti', facts: { cookId: LEO } }])
    // Hearts on a meal that is already eaten are history being tidied, not news.
    const eaten = serving({ status: 'eaten' })
    expect(meal(eaten, { ...eaten, craving: 3 })).toEqual([])
  })

  it('alone in the kitchen nobody else is the eater', () => {
    const served = serving({ status: 'served' })
    expect(newsFrom('servings', served, { ...served, status: 'eaten' }, [{ id: MIA }])).toMatchObject([{ kind: 'eaten', actorId: null }])
  })
})

describe('what else is worth telling', () => {
  it("the cook's answer: a face or words where there were none", () => {
    const verdict = review()
    expect(newsFrom('reviews', verdict, { ...verdict, chefReaction: 6 }, people)).toEqual([{ kind: 'answered', at: AT, actorId: null, servingId: 's1', dishId: 'rösti', facts: { hasReply: false } }])
    expect(newsFrom('reviews', verdict, { ...verdict, chefReply: 'Told you so' }, people)).toMatchObject([{ kind: 'answered', facts: { hasReply: true } }])
    // Changing the answer, guessing, the verdict itself, a new verdict: no line (the meal's own line tells "eaten").
    expect(newsFrom('reviews', { ...verdict, chefReply: 'Hm' }, { ...verdict, chefReply: 'Told you so' }, people)).toEqual([])
    expect(newsFrom('reviews', verdict, { ...verdict, chefSelfRating: 4 }, people)).toEqual([])
    expect(newsFrom('reviews', verdict, { ...verdict, overall: 5, comment: 'Wow' }, people)).toEqual([])
    expect(newsFrom('reviews', undefined, review({ chefReaction: 6 }), people)).toEqual([])
  })

  it('a new dish, a new menu, the partner taking their seat', () => {
    expect(newsFrom('dishes', undefined, dish('Ramen'), people)).toEqual([{ kind: 'dish', at: AT, actorId: MIA, dishId: 'Ramen', facts: { name: 'Ramen' } }])
    expect(newsFrom('dishes', dish('Ramen'), dish('Ramen', { name: 'Ramen with egg' }), people)).toEqual([])
    expect(newsFrom('dishes', undefined, dish('Old', { archived: true }), people)).toEqual([])
    expect(newsFrom('dishes', undefined, dish('Gone', { deletedAt: AT }), people)).toEqual([])
    const menu = { ...dish('Brunch'), courses: [] } as unknown as Menu
    expect(newsFrom('menus', undefined, menu, people)).toMatchObject([{ kind: 'menu', menuId: 'Brunch', actorId: MIA, facts: { name: 'Brunch' } }])
    const mia = { id: MIA, name: 'Mia', createdAt: AT, updatedAt: AT, deletedAt: null } as Member
    expect(newsFrom('members', undefined, mia, people)).toEqual([{ kind: 'joined', at: AT, actorId: MIA, facts: { name: 'Mia' } }])
    expect(newsFrom('members', mia, { ...mia, status: 'Hungry' }, people)).toEqual([])
    // Criteria, photos and the kitchen's name are nobody's news.
    expect(newsFrom('criteria', undefined, { id: 'c', householdId: 'kitchen', createdAt: AT, updatedAt: AT, deletedAt: null, label: 'Taste', icon: 'spoon', active: true, sortOrder: 0 }, people)).toEqual([])
  })
})

describe('tidying what one sync brought in', () => {
  const draft = (kind: NewsDraft['kind'], extra: Partial<NewsDraft> = {}): NewsDraft => ({ kind, at: AT, actorId: null, facts: {}, ...extra })

  it('drops what I certainly did myself on my other device', () => {
    const news = [draft('proposed', { actorId: LEO, servingId: 'a' }), draft('proposed', { actorId: MIA, servingId: 'b' }), draft('planned', { servingId: 'c' })]
    expect(tidyNews(news, LEO).map((n) => n.servingId)).toEqual(['b', 'c'])
    expect(tidyNews(news, null)).toHaveLength(3)
  })

  it("tells a menu's answer once, not once per course", () => {
    const news = [draft('answered', { servingId: 'a', dishId: 'soup' }), draft('answered', { servingId: 'a', dishId: 'cake' }), draft('answered', { servingId: 'b' })]
    expect(tidyNews(news, LEO).map((n) => [n.servingId, n.dishId])).toEqual([['a', 'soup'], ['b', undefined]])
  })

  it('does not announce a dish twice when it arrives together with its meal', () => {
    const news = [draft('dish', { dishId: 'ramen', actorId: MIA }), draft('planned', { servingId: 'a', dishId: 'ramen', actorId: MIA }), draft('dish', { dishId: 'zopf', actorId: MIA })]
    expect(tidyNews(news, LEO).map((n) => [n.kind, n.dishId])).toEqual([['planned', 'ramen'], ['dish', 'zopf']])
  })

  it('turns an import into one line', () => {
    const few = Array.from({ length: MANY_DISHES }, (_, i) => draft('dish', { dishId: `d${i}`, actorId: MIA }))
    expect(kinds(tidyNews(few, LEO))).toEqual(Array(MANY_DISHES).fill('dish'))
    const many = [...few, draft('dish', { dishId: 'last', actorId: MIA, at: '2026-11-12T20:00:00.000Z' }), draft('proposed', { servingId: 'a', actorId: MIA, at: '2026-11-12T21:00:00.000Z' })]
    expect(tidyNews(many, LEO)).toEqual([
      { kind: 'dishes', at: '2026-11-12T20:00:00.000Z', actorId: MIA, facts: { count: MANY_DISHES + 1 } },
      { kind: 'proposed', at: '2026-11-12T21:00:00.000Z', actorId: MIA, servingId: 'a', facts: {} },
    ])
    // From both of them (a backup with old dishes): nobody is named.
    const mixed = [...few, draft('dish', { dishId: 'x', actorId: null })]
    expect(tidyNews(mixed, LEO)[0]).toMatchObject({ kind: 'dishes', actorId: null })
  })

  it('sorts oldest first, so three offline days read in order', () => {
    const news = [draft('served', { at: '2026-11-12T18:00:00.000Z' }), draft('planned', { at: '2026-11-10T09:00:00.000Z' }), draft('proposed', { at: '2026-11-09T09:00:00.000Z' })]
    expect(kinds(tidyNews(news, LEO))).toEqual(['proposed', 'planned', 'served'])
  })
})

describe('how much news a phone keeps', () => {
  const now = Date.parse('2026-11-12T12:00:00.000Z')
  const daysAgo = (days: number) => new Date(now - days * 24 * 3_600_000).toISOString()

  it('lets go of what is older than the limit', () => {
    const items = [{ id: 1, at: daysAgo(NEWS_DAYS + 1) }, { id: 2, at: daysAgo(NEWS_DAYS - 1) }, { id: 3, at: daysAgo(0) }]
    expect(staleNews(items, now)).toEqual([1])
  })

  it('keeps only the newest lines', () => {
    const items = Array.from({ length: NEWS_KEEP + 3 }, (_, i) => ({ id: i + 1, at: daysAgo(1 + i / 1000) }))
    // The three oldest go.
    expect(staleNews(items, now).sort((a, b) => a - b)).toEqual([NEWS_KEEP + 1, NEWS_KEEP + 2, NEWS_KEEP + 3])
    expect(staleNews(items.slice(0, NEWS_KEEP), now)).toEqual([])
  })
})

describe('where a line leads', () => {
  it('to the meal, the camera, the recipe or the book', () => {
    expect(newsLink({ kind: 'planned', servingId: 'a', dishId: 'd' }, true)).toBe('/serving/a')
    expect(newsLink({ kind: 'served', servingId: 'a' }, true)).toBe('/review/a')
    expect(newsLink({ kind: 'served', servingId: 'a' }, false)).toBe('/serving/a')
    expect(newsLink({ kind: 'removed', servingId: 'a' }, true)).toBe('/wishlist')
    expect(newsLink({ kind: 'dish', dishId: 'd' }, true)).toBe('/recipes/d')
    expect(newsLink({ kind: 'menu', menuId: 'm' }, true)).toBe('/menus/m')
    expect(newsLink({ kind: 'dishes' }, true)).toBe('/recipes')
    expect(newsLink({ kind: 'joined' }, true)).toBeNull()
  })
})
