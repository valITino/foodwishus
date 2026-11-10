import { beforeEach, describe, expect, it } from 'vitest'
import { ActionError, addCriterion, createDish, moveCriterion, proposeServing, removeCriterion, saveReview, setCriterionActive, updateCriterion } from '../../src/data/actions'
import { db, store } from '../../src/data/app'
import { META } from '../../src/data/db'
import { byCriterionOrder } from '../../src/data/queries'
import { criteriaProfile, eatenMeals } from '../../src/lib/stats'
import { newId, nowIso, type Criterion, type Member } from '../../src/data/types'

const householdId = newId()
const memberId = newId()
const DEFAULTS = ['Taste', 'Texture', 'Smell', 'Looks', 'Portion', 'Temperature']

async function list(): Promise<Criterion[]> {
  return (await db.criteria.toArray()).filter((criterion) => !criterion.deletedAt).sort(byCriterionOrder)
}
const labels = async () => (await list()).map((criterion) => criterion.label)
const named = async (label: string) => (await list()).find((criterion) => criterion.label === label) as Criterion
const refusal = async (run: Promise<unknown>) => {
  const error = await run.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ActionError)
  return (error as ActionError).code
}
/** What is waiting to go to the cloud, as "kind table fields". */
const queued = async () => (await db.outbox.orderBy('seq').toArray()).map((op) => `${op.kind} ${op.table} ${Object.keys(op.data).sort().join(',')}`)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.setMeta(META.householdId, householdId)
  await db.setMeta(META.memberId, memberId)
  const at = nowIso()
  const me: Member = { id: memberId, householdId, name: 'Leo', avatar: 'fork', color: 'sage', accessory: null, status: null, defaultRole: 'taster', prefs: {}, isAdmin: true, disabledAt: null, createdAt: at, updatedAt: at, deletedAt: null }
  await db.members.put(me)
  // The six defaults, as the cloud makes them when a kitchen opens.
  await db.criteria.bulkPut(DEFAULTS.map((label, sortOrder) => ({ id: newId(), householdId, label, icon: 'spoon', active: true, sortOrder, createdAt: at, updatedAt: at, deletedAt: null })))
})

describe('review criteria', () => {
  it('adds a criterion at the end, tidied up, switched on', async () => {
    const added = await addCriterion({ label: '  Crunch   factor ', icon: 'crunch' })
    expect(added).toMatchObject({ label: 'Crunch factor', icon: 'crunch', active: true, sortOrder: 6, householdId })
    expect(await labels()).toEqual([...DEFAULTS, 'Crunch factor'])
    expect((await addCriterion({ label: 'Sauce' })).icon).toBe('spoon')
    expect((await addCriterion({ label: 'x'.repeat(60) })).label).toHaveLength(40)
    expect(await queued()).toEqual(['put criteria active,createdAt,deletedAt,householdId,icon,id,label,sortOrder,updatedAt', 'put criteria active,createdAt,deletedAt,householdId,icon,id,label,sortOrder,updatedAt', 'put criteria active,createdAt,deletedAt,householdId,icon,id,label,sortOrder,updatedAt'])
  })

  it('refuses a criterion without a name, and a second one with the same name', async () => {
    expect(await refusal(addCriterion({ label: '   ' }))).toBe('criterion_unnamed')
    expect(await refusal(addCriterion({ label: ' taste ' }))).toBe('criterion_twice')
    // A switched-off criterion still owns its name: switch it on instead of adding a twin.
    await setCriterionActive((await named('Smell')).id, false)
    expect(await refusal(addCriterion({ label: 'Smell' }))).toBe('criterion_twice')
    expect(await db.outbox.count()).toBe(1)
  })

  it('renames and changes the icon, sending only what changed', async () => {
    const texture = await named('Texture')
    await updateCriterion(texture.id, { label: 'Bite', icon: 'layers' })
    expect(await db.criteria.get(texture.id)).toMatchObject({ label: 'Bite', icon: 'layers', sortOrder: 1, active: true })
    expect(await queued()).toEqual(['patch criteria icon,label'])

    await db.outbox.clear()
    await updateCriterion(texture.id, { label: 'Bite', icon: 'layers' })
    expect(await db.outbox.count()).toBe(0)
    await updateCriterion(texture.id, { label: 'bite' }) // its own name in other letters is fine
    expect((await db.criteria.get(texture.id))?.label).toBe('bite')

    expect(await refusal(updateCriterion(texture.id, { label: 'Taste' }))).toBe('criterion_twice')
    expect(await refusal(updateCriterion(texture.id, { label: '' }))).toBe('criterion_unnamed')
    expect(await refusal(updateCriterion(newId(), { label: 'Ghost' }))).toBe('criterion_missing')
  })

  it('moves a criterion and renumbers only the rows that changed place', async () => {
    await moveCriterion((await named('Temperature')).id, 1)
    expect(await labels()).toEqual(['Taste', 'Temperature', 'Texture', 'Smell', 'Looks', 'Portion'])
    expect((await list()).map((criterion) => criterion.sortOrder)).toEqual([0, 1, 2, 3, 4, 5])
    // Taste stayed where it was: five rows changed their number, one did not.
    expect(await db.outbox.count()).toBe(5)

    await moveCriterion((await named('Taste')).id, 99)
    expect(await labels()).toEqual(['Temperature', 'Texture', 'Smell', 'Looks', 'Portion', 'Taste'])
    await moveCriterion((await named('Looks')).id, -3)
    expect(await labels()).toEqual(['Looks', 'Temperature', 'Texture', 'Smell', 'Portion', 'Taste'])

    await db.outbox.clear()
    await moveCriterion((await named('Smell')).id, 3)
    expect(await db.outbox.count()).toBe(0)
    expect(await refusal(moveCriterion(newId(), 0))).toBe('criterion_missing')
  })

  it('saves a move in one step, so the list never shows a half-renumbered order', async () => {
    // The defaults are made in the same instant, so a number that two rows share for a
    // moment is settled by id. These ids make every such moment swap two rows.
    await db.criteria.clear()
    const at = nowIso()
    await db.criteria.bulkPut(DEFAULTS.map((label, sortOrder) => ({ id: `00000000-0000-4000-8000-00000000000${9 - sortOrder}`, householdId, label, icon: 'spoon', active: true, sortOrder, createdAt: at, updatedAt: at, deletedAt: null })))

    // What a screen would show after every single write.
    const shown: Promise<string[]>[] = []
    const hook = store.onWrite
    store.onWrite = () => void shown.push(labels())
    try {
      await moveCriterion((await named('Temperature')).id, 1)
    } finally {
      store.onWrite = hook
    }
    expect(await Promise.all(shown)).toEqual([['Taste', 'Temperature', 'Texture', 'Smell', 'Looks', 'Portion']])
  })

  it('changes several rows together or none of them', async () => {
    const [taste, texture] = await list()
    await expect(
      store.patchAll('criteria', [
        { id: taste.id, changes: { label: 'Flavour' } },
        { id: newId(), changes: { label: 'Nobody' } },
      ]),
    ).rejects.toThrow(/missing row/)
    expect(await labels()).toEqual(DEFAULTS)
    expect(await db.outbox.count()).toBe(0)

    let writes = 0
    const hook = store.onWrite
    store.onWrite = () => void writes++
    try {
      await store.patchAll('criteria', [
        { id: taste.id, changes: { label: 'Flavour' } },
        { id: texture.id, changes: { label: 'Bite', sortOrder: undefined } },
        { id: taste.id, changes: {} },
      ])
      await store.patchAll('criteria', [])
    } finally {
      store.onWrite = hook
    }
    expect((await labels()).slice(0, 2)).toEqual(['Flavour', 'Bite'])
    expect(await queued()).toEqual(['patch criteria label', 'patch criteria label'])
    expect(writes).toBe(1)
  })

  it('keeps a steady order when two phones handed out the same number', async () => {
    const [taste, texture] = await list()
    await db.criteria.update(texture.id, { sortOrder: 0, createdAt: '2026-01-02T00:00:00.000Z' })
    await db.criteria.update(taste.id, { sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' })
    expect((await labels()).slice(0, 2)).toEqual(['Taste', 'Texture'])
    // The next move sorts the numbers out for good.
    await moveCriterion(texture.id, 0)
    expect((await list()).map((criterion) => [criterion.label, criterion.sortOrder]).slice(0, 3)).toEqual([
      ['Texture', 0],
      ['Taste', 1],
      ['Smell', 2],
    ])
  })

  it('switches a criterion off and on again without touching its place or its history', async () => {
    const smell = await named('Smell')
    const dish = await createDish({ name: 'Raclette' })
    const serving = await proposeServing({ dishId: dish.id })
    const review = await saveReview(serving.id, dish.id, { overall: 5, scores: { [smell.id]: 5 } })

    await setCriterionActive(smell.id, false)
    expect(await db.criteria.get(smell.id)).toMatchObject({ active: false, sortOrder: 2, deletedAt: null })
    expect((await db.reviews.get(review.id))?.scores[smell.id]).toBe(5)
    expect(await labels()).toEqual(DEFAULTS)

    await db.outbox.clear()
    await setCriterionActive(smell.id, false)
    expect(await db.outbox.count()).toBe(0)
    await setCriterionActive(smell.id, true)
    expect((await db.criteria.get(smell.id))?.active).toBe(true)
  })

  it('removes only a criterion that was never rated', async () => {
    const smell = await named('Smell')
    const dish = await createDish({ name: 'Raclette' })
    const serving = await proposeServing({ dishId: dish.id })
    await saveReview(serving.id, dish.id, { scores: { [smell.id]: 2 } })

    expect(await refusal(removeCriterion(smell.id))).toBe('criterion_used')
    expect((await db.criteria.get(smell.id))?.deletedAt).toBeNull()

    const fresh = await addCriterion({ label: 'Typo' })
    await removeCriterion(fresh.id)
    expect((await db.criteria.get(fresh.id))?.deletedAt).not.toBeNull()
    expect(await labels()).toEqual(DEFAULTS)
    expect(await refusal(removeCriterion(fresh.id))).toBe('criterion_missing')
    // Its name is free again.
    expect((await addCriterion({ label: 'typo' })).sortOrder).toBe(6)
  })
})

describe('the Cockpit and switched-off criteria', () => {
  it('keeps showing a switched-off criterion that has ratings, and drops one that has none', async () => {
    const [taste, texture, smell] = await list()
    const dish = await createDish({ name: 'Raclette' })
    const serving = await proposeServing({ dishId: dish.id })
    await saveReview(serving.id, dish.id, { overall: 4, scores: { [taste.id]: 5, [smell.id]: 3 } })
    await db.servings.update(serving.id, { status: 'eaten', eatenAt: nowIso(), servedAt: nowIso() })
    await setCriterionActive(smell.id, false)
    await setCriterionActive(texture.id, false)

    const data = { dishes: await db.dishes.toArray(), menus: [], servings: await db.servings.toArray(), reviews: await db.reviews.toArray(), criteria: await db.criteria.toArray() }
    const profile = criteriaProfile(eatenMeals(data), data.criteria)
    // Smell is off but was rated: it stays. Texture is off and was never rated: it goes. The rest are asked, so they show.
    expect(profile.map((row) => row.label)).toEqual(['Taste', 'Smell', 'Looks', 'Portion', 'Temperature'])
    expect(profile.find((row) => row.label === 'Smell')?.value).toEqual({ mean: 3, n: 1 })
    // For one dish the spokes are the same ones, so two shapes can be laid over each other.
    expect(criteriaProfile(eatenMeals(data), data.criteria, dish.id).map((row) => row.label)).toEqual(profile.map((row) => row.label))
  })
})
