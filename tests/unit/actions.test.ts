import { beforeEach, describe, expect, it } from 'vitest'
import { createDish, moveServing, planServing, proposeServing, setCraving, skipServing, unplanServing, updateMyProfile, reviveServing } from '../../src/data/actions'
import { db } from '../../src/data/app'
import { META } from '../../src/data/db'
import { byPriority } from '../../src/data/queries'
import { newId, nowIso, type Member } from '../../src/data/types'

const householdId = newId()
const memberId = newId()

async function wishlistNames(): Promise<string[]> {
  const dishes = new Map((await db.dishes.toArray()).map((d) => [d.id, d.name]))
  return (await db.servings.toArray()).sort(byPriority).map((s) => dishes.get(s.dishId as string) as string)
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.setMeta(META.householdId, householdId)
  await db.setMeta(META.memberId, memberId)
  const at = nowIso()
  const me: Member = { id: memberId, householdId, name: 'Leo', avatar: 'fork', color: 'sage', accessory: null, status: null, defaultRole: 'taster', createdAt: at, updatedAt: at, deletedAt: null }
  await db.members.put(me)
})

describe('wishlist order', () => {
  it('adds new proposals at the bottom and lets him drag them anywhere', async () => {
    const servings = []
    for (const name of ['Rösti', 'Fondue', 'Zopf', 'Birchermüesli']) {
      servings.push(await proposeServing({ dishId: (await createDish({ name })).id }))
    }
    const [rosti, fondue, zopf, muesli] = servings
    expect(await wishlistNames()).toEqual(['Rösti', 'Fondue', 'Zopf', 'Birchermüesli'])

    await moveServing(muesli.id, null, rosti.id) // to the top
    expect(await wishlistNames()).toEqual(['Birchermüesli', 'Rösti', 'Fondue', 'Zopf'])

    await moveServing(rosti.id, zopf.id, null) // to the bottom
    expect(await wishlistNames()).toEqual(['Birchermüesli', 'Fondue', 'Zopf', 'Rösti'])

    await moveServing(rosti.id, fondue.id, zopf.id) // between two
    expect(await wishlistNames()).toEqual(['Birchermüesli', 'Fondue', 'Rösti', 'Zopf'])
  })

  it('survives neighbours that a sync left in the wrong order', async () => {
    const a = await proposeServing({ dishId: (await createDish({ name: 'A' })).id })
    const b = await proposeServing({ dishId: (await createDish({ name: 'B' })).id })
    await expect(moveServing(a.id, b.id, a.id)).resolves.toBeUndefined()
  })
})

describe('a serving through its early life', () => {
  it('goes from wishlist to planned and back, and can be skipped and revived', async () => {
    const serving = await proposeServing({ dishId: (await createDish({ name: 'Lasagne' })).id, note: '  Extra cheese  ' })
    expect(serving).toMatchObject({ status: 'wishlist', note: 'Extra cheese', proposedBy: memberId, craving: null })

    await setCraving(serving.id, 5)
    await planServing(serving.id, '2026-11-12', 'dinner')
    expect(await db.servings.get(serving.id)).toMatchObject({ status: 'planned', plannedDate: '2026-11-12', plannedSlot: 'dinner', craving: 5 })

    await unplanServing(serving.id)
    expect(await db.servings.get(serving.id)).toMatchObject({ status: 'wishlist', plannedDate: null, plannedSlot: null })

    await skipServing(serving.id, 'Ate out')
    expect(await db.servings.get(serving.id)).toMatchObject({ status: 'skipped', skippedReason: 'Ate out' })

    await reviveServing(serving.id)
    expect(await db.servings.get(serving.id)).toMatchObject({ status: 'wishlist', skippedReason: null })
  })
})

describe('profile', () => {
  it('saves a status line, trimmed and capped at 60 characters', async () => {
    await updateMyProfile({ status: `  Always ${'Huuu'.repeat(20)}ngry  ` })
    const status = (await db.members.get(memberId))?.status as string
    expect(status.startsWith('Always Huuu')).toBe(true)
    expect(status.length).toBe(60)

    await updateMyProfile({ status: '   ' })
    expect((await db.members.get(memberId))?.status).toBeNull()
  })
})
