import { beforeEach, describe, expect, it } from 'vitest'
import { FakeCloud } from '../../src/data/fake/cloudCore'
import { newsLink, tidyNews, type NewsDraft } from '../../src/data/news'
import { newId, nowIso, type BasketItem, type ID, type PantryItem } from '../../src/data/types'
import { cookedMeals, planSignature } from '../../src/features/basket/fork'
import { newsLine, type NewsContext } from '../../src/features/news/logic'
import { newsCopy } from '../../src/features/news/copy'
import { makeCouple, type Phone } from './helpers'

// The basket and the pantry between two phones and a pretend cloud: they sync like
// everything else, the bell says what is new, and a cloud that does not know them yet
// makes their changes wait without holding up anything else.

let cloud: FakeCloud

beforeEach(() => {
  cloud = new FakeCloud()
})

const meOf = async (phone: Phone) => (await phone.store.memberId()) as ID
const kitchenOf = async (phone: Phone) => (await phone.store.householdId()) as ID
const settle = async (...phones: Phone[]) => {
  for (let round = 0; round < 2; round++) for (const phone of phones) await phone.engine.sync()
}

async function onBasket(phone: Phone, name: string, over: Partial<BasketItem> = {}): Promise<BasketItem> {
  const at = nowIso()
  const item: BasketItem = { id: newId(), householdId: await kitchenOf(phone), createdAt: at, updatedAt: at, deletedAt: null, name, amount: null, note: null, state: 'open', source: 'hand', reason: null, dishId: null, addedBy: await meOf(phone), boughtAt: null, ...over }
  await phone.store.put('basket', item)
  return item
}

async function inPantry(phone: Phone, name: string, amount: string | null = null): Promise<PantryItem> {
  const at = nowIso()
  const item: PantryItem = { id: newId(), householdId: await kitchenOf(phone), createdAt: at, updatedAt: at, deletedAt: null, name, amount }
  await phone.store.put('pantry', item)
  return item
}

const basketOf = async (phone: Phone) => (await phone.db.basket.toArray()).filter((item) => !item.deletedAt).map((item) => `${item.name}:${item.state}`).sort()
const newsOf = async (phone: Phone) => (await phone.db.news.orderBy('id').toArray()).filter((item) => item.kind === 'basket' || item.kind === 'fork')

describe('the basket and the pantry between two phones', () => {
  it('what one writes down, the other sees; what one ticks off, is ticked off for both', async () => {
    const { her, him } = await makeCouple(cloud)
    const milk = await onBasket(her, 'Milk', { amount: '1 l' })
    await inPantry(her, 'Flour', '1 kg')
    await settle(her, him)
    expect(await basketOf(him)).toEqual(['Milk:open'])
    expect((await him.db.pantry.toArray()).map((item) => `${item.name}:${item.amount}`)).toEqual(['Flour:1 kg'])

    // He is in the shop, without a connection for a while.
    him.backend.online = false
    await him.store.patch('basket', milk.id, { state: 'bought', boughtAt: nowIso() })
    await him.engine.sync()
    expect(await basketOf(her)).toEqual(['Milk:open'])
    him.backend.online = true
    await settle(him, her)
    expect(await basketOf(her)).toEqual(['Milk:bought'])
  })

  it('the bell says once how much is new on the basket, and never to whoever wrote it', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    await him.db.news.clear()
    await her.db.news.clear()

    await onBasket(her, 'Milk')
    await onBasket(her, 'Eggs')
    await onBasket(her, 'Bread')
    await settle(her, him)
    const his = await newsOf(him)
    expect(his).toHaveLength(1)
    expect(his[0]).toMatchObject({ kind: 'basket', actorId: await meOf(her), facts: { count: 3 } })
    expect(await newsOf(her)).toEqual([])

    // One thing is named; ticking off and tidying up are not news.
    const butter = await onBasket(him, 'Butter')
    await settle(him, her)
    await him.store.patch('basket', butter.id, { state: 'bought', boughtAt: nowIso() })
    await him.store.remove('basket', butter.id)
    await settle(him, her)
    const hers = await newsOf(her)
    expect(hers).toHaveLength(1)
    expect(hers[0]).toMatchObject({ kind: 'basket', facts: { name: 'Butter', count: 1 } })
  })

  it("Fork's suggestions ring the partner's bell as one line, and lead to the basket", async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    await him.db.news.clear()
    await onBasket(her, 'Rüebli', { state: 'suggested', source: 'fork', reason: 'For the soup on Friday.' })
    await onBasket(her, 'Rahm', { state: 'suggested', source: 'fork' })
    await settle(her, him)
    const [line] = await newsOf(him)
    expect(line).toMatchObject({ kind: 'fork', facts: { count: 2 } })
    expect(newsLink(line, false)).toBe('/basket')
  })

  it('a cloud from before the basket makes its changes wait, and lets everything else through', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    cloud.setLaterTables(false)

    await onBasket(her, 'Milk')
    await inPantry(her, 'Flour')
    const at = nowIso()
    await her.store.put('dishes', { id: newId(), householdId: await kitchenOf(her), createdAt: at, updatedAt: at, deletedAt: null, name: 'Rösti', description: null, course: 'main', tags: [], effort: null, recipe: {}, nutrition: {}, coverPhotoId: null, icon: null, createdBy: await meOf(her), archived: false })
    await settle(her, him)

    // The dish went through; the two lists wait on her phone, and nothing was refused.
    expect((await him.db.dishes.toArray()).map((dish) => dish.name)).toEqual(['Rösti'])
    expect(await basketOf(him)).toEqual([])
    expect(await basketOf(her)).toEqual(['Milk:open'])
    expect(her.engine.status).toMatchObject({ state: 'idle', pending: 0, later: 2, stuck: 0 })
    expect(await her.db.deadLetters.count()).toBe(0)
    expect(await her.db.outbox.count()).toBe(2)
    // What she adds meanwhile waits too, without another question to the cloud going wrong.
    await onBasket(her, 'Eggs')
    await her.engine.sync()
    expect(her.engine.status).toMatchObject({ state: 'idle', later: 3, stuck: 0 })
  })

  it('once the cloud has caught up, what waited goes out by itself', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    cloud.setLaterTables(false)
    await onBasket(her, 'Milk')
    await her.engine.sync()
    expect(await her.db.outbox.count()).toBe(1)

    cloud.setLaterTables(true)
    // The next pull mentions the new lists: that is the sign. The pass after it sends.
    await her.engine.sync()
    await her.engine.sync()
    await him.engine.sync()
    expect(await her.db.outbox.count()).toBe(0)
    expect(her.engine.status).toMatchObject({ later: 0, pending: 0 })
    expect(await basketOf(him)).toEqual(['Milk:open'])
  })
})

describe('the words on the bell', () => {
  const ctx: NewsContext = { meId: 'leo', nameOf: (id) => (id === 'mia' ? 'Mia' : ''), mealName: () => null, cookOf: () => null, when: (day) => day, goneName: 'A dish that left the recipe book' }
  const line = (draft: Partial<NewsDraft>, lang: 'en' | 'de' = 'en') => newsLine({ kind: 'basket', at: nowIso(), actorId: 'mia', facts: {}, seenAt: null, ...draft }, ctx, newsCopy[lang].lines)

  it('name one thing and count several', () => {
    const many: NewsDraft[] = [1, 2, 3].map((n) => ({ kind: 'basket', at: `2026-11-12T10:00:0${n}.000Z`, actorId: 'mia', facts: { name: `Thing ${n}`, count: 1 } }))
    const tidy = tidyNews(many, 'leo')
    expect(tidy).toHaveLength(1)
    expect(tidy[0]).toMatchObject({ kind: 'basket', actorId: 'mia', at: '2026-11-12T10:00:03.000Z', facts: { count: 3 } })
    // What I did on my other device is not news to me.
    expect(tidyNews(many, 'mia')).toEqual([])
  })

  it('read like a person would say it', () => {
    expect(line({ facts: { name: 'Milk', count: 1 } })).toBe('Mia put Milk on the basket.')
    expect(line({ facts: { count: 3 } })).toBe('Mia put 3 things on the basket.')
    expect(line({ kind: 'fork', actorId: null, facts: { count: 4 } })).toBe('Fork thinks 4 things are running low.')
    expect(line({ kind: 'fork', actorId: null, facts: { name: 'Cream', count: 1 } })).toBe('Fork thinks Cream is running low.')
    // Without a name for who did it (a profile that is gone), the line still reads.
    expect(line({ actorId: null, facts: { count: 2 } })).toBe('2 new things on the basket.')
    expect(line({ facts: { count: 3 } }, 'de')).toBe('Mia hat 3 Sachen in den Korb gelegt.')
    expect(line({ kind: 'fork', actorId: null, facts: { count: 4 } }, 'de')).toBe('Fork meint, 4 Sachen gehen zur Neige.')
  })
})

describe('what Fork looks at', () => {
  it('a plan is the planned meals of the window, whatever else changes around them', () => {
    const meals = [{ servingId: 's1', day: '2026-11-13', dishId: 'd1', dishName: 'Soup', ingredients: [] }, { servingId: 's2', day: '2026-11-14', dishId: 'd2', dishName: 'Rösti', ingredients: [] }]
    expect(planSignature(meals)).toBe('2026-11-13/d1,2026-11-14/d2')
    expect(planSignature([{ ...meals[0], dishName: 'Renamed soup', ingredients: [{ name: 'Salt' }] }, meals[1]])).toBe(planSignature(meals))
    expect(planSignature([])).toBe('')
  })

  it('counts as cooked what was served or eaten since a day, on the day it was', () => {
    const base = { householdId: 'h', createdAt: '', updatedAt: '', deletedAt: null }
    const dish = { ...base, id: 'd1', name: 'Soup', recipe: { ingredients: [{ name: 'Carrots', quantity: 500, unit: 'g' }] } }
    const meal = (id: string, status: string, servedAt: string | null) => ({ ...base, id, dishId: 'd1', menuId: null, status, plannedDate: null, servedAt, eatenAt: null })
    const today = new Date().toISOString()
    const cooked = cookedMeals({ servings: [meal('a', 'eaten', today), meal('b', 'planned', null), meal('c', 'served', '2020-01-01T12:00:00.000Z')] as never, dishes: [dish] as never, menus: [] }, '2026-01-01')
    expect(cooked.map((entry) => entry.servingId)).toEqual(['a'])
    expect(cooked[0].ingredients).toHaveLength(1)
  })
})

describe('changes made on this phone', () => {
  it('are heard of with their table; what a sync brings in is not', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    const heard: string[] = []
    const stop = him.store.onLocal((table) => heard.push(table))

    await onBasket(her, 'Milk')
    await settle(her, him)
    expect(heard).toEqual([])

    const butter = await onBasket(him, 'Butter')
    await him.store.patch('basket', butter.id, { amount: '250 g' })
    await inPantry(him, 'Flour')
    expect(heard).toEqual(['basket', 'basket', 'pantry'])

    stop()
    await inPantry(him, 'Sugar')
    expect(heard).toHaveLength(3)
  })
})
