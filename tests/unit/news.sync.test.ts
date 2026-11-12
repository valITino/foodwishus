import { beforeEach, describe, expect, it } from 'vitest'
import { FakeCloud } from '../../src/data/fake/cloudCore'
import { newId, nowIso, type Dish, type ID, type Serving } from '../../src/data/types'
import { HER_PIN, HIS_PIN, makeCouple, makePhone, type Phone } from './helpers'

// The bell, end to end on the data side: two phones and a pretend cloud. News is made by
// the sync when changes arrive, and only on the phone that did not make them.

let cloud: FakeCloud

beforeEach(() => {
  cloud = new FakeCloud()
})

const news = async (phone: Phone) => (await phone.db.news.orderBy('id').toArray()).map((item) => item.kind)
const meOf = async (phone: Phone) => (await phone.store.memberId()) as ID

async function wish(phone: Phone, dish: Dish, overrides: Partial<Serving> = {}): Promise<Serving> {
  const at = nowIso()
  const me = await meOf(phone)
  const serving: Serving = {
    id: newId(),
    householdId: dish.householdId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    dishId: dish.id,
    menuId: null,
    proposedBy: me,
    cookedBy: me,
    proposedAt: at,
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
  await phone.store.put('servings', serving)
  return serving
}

/** Both phones send and fetch until nothing is left to tell. */
async function settle(...phones: Phone[]): Promise<void> {
  for (let round = 0; round < 2; round++) for (const phone of phones) await phone.engine.sync()
}

describe('the bell', () => {
  it('filling a new phone is not news; the partner taking their seat is', async () => {
    const her = makePhone(cloud)
    const him = makePhone(cloud)
    await her.adopt(await her.backend.createHousehold('Our kitchen', { name: 'Mia', defaultRole: 'chef' }, HER_PIN))
    await her.engine.sync()
    const invite = await her.backend.createInvite('join')
    await him.adopt(await him.backend.joinHousehold(invite.code, { name: 'Leo', defaultRole: 'taster' }, HIS_PIN))
    await him.engine.sync()
    // Their first syncs brought the kitchen, the people and six criteria: nothing to tell.
    expect(await news(her)).toEqual([])
    expect(await news(him)).toEqual([])

    // Her phone was there first. The next sync brings him.
    await her.engine.sync()
    const [line] = await her.db.news.toArray()
    expect(line).toMatchObject({ kind: 'joined', actorId: await meOf(him), facts: { name: 'Leo' }, seenAt: null })
    expect(await news(him)).toEqual([])
  })

  it('tells him what she did, and never tells her what she did herself', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    await her.db.news.clear()

    const dish = await her.dish({ name: 'Rösti' })
    const serving = await wish(her, dish)
    await settle(her, him)

    // The dish arrives with its wish: one line, about the wish.
    const [line] = await him.db.news.toArray()
    expect(await news(him)).toEqual(['proposed'])
    expect(line).toMatchObject({ kind: 'proposed', actorId: await meOf(her), servingId: serving.id, dishId: dish.id })
    expect(await news(her)).toEqual([])

    // He gives hearts and plans it; she serves; he eats.
    await him.store.patch('servings', serving.id, { craving: 5 })
    await settle(him, her)
    await him.store.patch('servings', serving.id, { status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'dinner' })
    await settle(him, her)
    await her.store.patch('servings', serving.id, { status: 'served', servedAt: nowIso() })
    await settle(her, him)
    await him.store.patch('servings', serving.id, { status: 'eaten', eatenAt: nowIso() })
    await settle(him, her)

    expect(await news(her)).toEqual(['hearts', 'planned', 'eaten'])
    expect(await news(him)).toEqual(['proposed', 'served'])
    const eaten = (await her.db.news.toArray()).at(-1)
    expect(eaten).toMatchObject({ kind: 'eaten', actorId: await meOf(him), servingId: serving.id })
  })

  it('says each thing once, however often the phones sync', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    const dish = await her.dish({ name: 'Rösti' })
    await wish(her, dish)
    await settle(her, him)
    // Every pull reaches back a little (the overlap), so the same rows arrive again.
    for (let i = 0; i < 4; i++) await settle(her, him)
    expect(await news(him)).toEqual(['proposed'])
  })

  it('judges a change by what it really changed here, not by what was still waiting to be sent', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    const dish = await her.dish({ name: 'Rösti' })
    const serving = await wish(her, dish)
    await settle(her, him)
    await him.db.news.clear()

    // He plans it while offline. She, meanwhile, writes a note.
    him.backend.online = false
    await him.store.patch('servings', serving.id, { status: 'planned', plannedDate: '2026-11-13', plannedSlot: 'dinner' })
    await her.store.patch('servings', serving.id, { note: 'Extra crispy' })
    await her.engine.sync()
    him.backend.online = true
    await settle(him, her)

    // His own planning is not news to him; her note is. And his planning is news to her.
    expect(await news(him)).toEqual(['note'])
    expect((await him.db.servings.get(serving.id))?.status).toBe('planned')
    expect((await her.db.news.toArray()).map((n) => n.kind)).toContain('planned')
  })

  it('does not tell me what I did on my own tablet, when the change itself says it was me', async () => {
    const { her, him } = await makeCouple(cloud)
    await settle(her, him)
    const tablet = makePhone(cloud)
    await tablet.adopt(await tablet.backend.signInWithPin('Leo', HIS_PIN))
    await settle(tablet, him, her)
    await him.db.news.clear()
    await her.db.news.clear()

    // On the tablet he wishes for something: he is named as the one who proposed it.
    const dish = await tablet.dish({ name: 'Burger' })
    await wish(tablet, dish)
    await settle(tablet, him, her)

    expect(await news(him)).toEqual([])
    expect(await news(tablet)).toEqual([])
    expect(await news(her)).toEqual(['proposed'])
  })
})
