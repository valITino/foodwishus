import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHIP_KEYS, chipLabel, isChipKey } from '../../src/content/chips'
import {
  ActionError,
  addProofPhoto,
  answerReview,
  createDish,
  createMenu,
  finishMeal,
  isSealed,
  markServed,
  planServing,
  proposeServing,
  reactToMeal,
  removeProofPhoto,
  reviewDishes,
  reviewIdFor,
  saveReview,
  setEatenAt,
} from '../../src/data/actions'
import { db } from '../../src/data/app'
import { META } from '../../src/data/db'
import { buildDemoRows } from '../../src/data/demo/history'
import { newId, nowIso, type Member } from '../../src/data/types'

const householdId = newId()
const leo = newId()
const mia = newId()

const picture = () => ({ full: new Blob([new Uint8Array(900)], { type: 'image/jpeg' }), thumb: new Blob([new Uint8Array(90)], { type: 'image/jpeg' }), width: 1600, height: 1200 })

async function as(memberId: string): Promise<void> {
  await db.setMeta(META.memberId, memberId)
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.setMeta(META.householdId, householdId)
  await as(leo)
  const at = nowIso()
  const person = (id: string, name: string, role: 'chef' | 'taster', isAdmin: boolean): Member => ({ id, householdId, name, avatar: 'fork', color: 'sage', accessory: null, status: null, defaultRole: role, prefs: {}, isAdmin, disabledAt: null, createdAt: at, updatedAt: at, deletedAt: null })
  await db.members.bulkPut([person(leo, 'Leo', 'taster', true), person(mia, 'Mia', 'chef', false)])
})

afterEach(() => {
  vi.useRealTimers()
})

/** A dish that Mia cooked and put on the table tonight. */
async function served(name = 'Älplermagronen') {
  const dish = await createDish({ name })
  const serving = await proposeServing({ dishId: dish.id, cookedBy: mia })
  await planServing(serving.id, '2026-11-10', 'dinner')
  await markServed(serving.id)
  return { dish, servingId: serving.id }
}

describe('proof photos', () => {
  it('attaches a photo to the meal and queues its bytes for the cloud', async () => {
    const { servingId } = await served()
    const proof = await addProofPhoto(servingId, { image: picture(), source: 'camera', takenAt: '2026-11-10T18:42:00.000Z' })

    expect((await db.servings.get(servingId))?.proofPhotos).toEqual([{ photoId: proof.photoId, source: 'camera', takenAt: '2026-11-10T18:42:00.000Z' }])
    expect(await db.photos.get(proof.photoId)).toMatchObject({ kind: 'proof', source: 'camera', createdBy: leo, uploaded: false })
    expect(await db.blobs.get(proof.photoId)).toMatchObject({ pending: 1 })
  })

  it('keeps several photos in order and can tag one with its course', async () => {
    const { servingId, dish } = await served()
    const first = await addProofPhoto(servingId, { image: picture(), source: 'camera' })
    const second = await addProofPhoto(servingId, { image: picture(), source: 'gallery', courseDishId: dish.id })
    expect((await db.servings.get(servingId))?.proofPhotos.map((p) => [p.photoId, p.source, p.courseDishId])).toEqual([
      [first.photoId, 'camera', undefined],
      [second.photoId, 'gallery', dish.id],
    ])

    await removeProofPhoto(servingId, first.photoId)
    expect((await db.servings.get(servingId))?.proofPhotos.map((p) => p.photoId)).toEqual([second.photoId])
    expect((await db.photos.get(first.photoId))?.deletedAt).toEqual(expect.any(String))
  })
})

describe('reviews', () => {
  it('starts with one tap on an emoji and grows from there, in one and the same review', async () => {
    const { servingId, dish } = await served()
    await reactToMeal(servingId, 6)
    const quick = (await db.reviews.toArray())[0]
    expect(quick).toMatchObject({ servingId, dishId: dish.id, reviewerId: leo, reaction: 6, overall: null, portionsEaten: 1, chips: [] })

    const criterion = newId()
    await saveReview(servingId, dish.id, { overall: 5, scores: { [criterion]: 4 }, portionsEaten: 1.5, wouldEatAgain: true, comment: '  More of this, always.  ', chips: ['perfect', 'keeper', 'perfect'] })
    expect(await db.reviews.count()).toBe(1)
    expect(await db.reviews.get(quick.id)).toMatchObject({ reaction: 6, overall: 5, scores: { [criterion]: 4 }, portionsEaten: 1.5, wouldEatAgain: true, comment: 'More of this, always.', chips: ['perfect', 'keeper'] })
  })

  it('gives the same person the same review id on every device', async () => {
    const a = await reviewIdFor('s1', 'd1', 'm1')
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await reviewIdFor('s1', 'd1', 'm1')).toBe(a)
    for (const other of [await reviewIdFor('s2', 'd1', 'm1'), await reviewIdFor('s1', 'd2', 'm1'), await reviewIdFor('s1', 'd1', 'm2')]) expect(other).not.toBe(a)
  })

  it('tidies what is typed: empty comments vanish, portions come in halves', async () => {
    const { servingId, dish } = await served()
    expect(await saveReview(servingId, dish.id, { comment: '   ', portionsEaten: 1.3 })).toMatchObject({ comment: null, portionsEaten: 1.5 })
    expect(await saveReview(servingId, dish.id, { portionsEaten: 0 })).toMatchObject({ portionsEaten: 0.5 })
    expect(await saveReview(servingId, dish.id, { portionsEaten: 40 })).toMatchObject({ portionsEaten: 9 })
  })

  it('can be changed for 24 hours, then it is sealed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z'))
    const { servingId, dish } = await served()
    const review = await saveReview(servingId, dish.id, { reaction: 4 })
    expect(review.sealedAt).toBe('2026-11-11T19:00:00.000Z')
    expect(isSealed(review)).toBe(false)

    vi.setSystemTime(new Date('2026-11-11T18:59:00Z'))
    await expect(saveReview(servingId, dish.id, { reaction: 5 })).resolves.toMatchObject({ reaction: 5 })

    vi.setSystemTime(new Date('2026-11-11T19:00:01Z'))
    await expect(saveReview(servingId, dish.id, { reaction: 1 })).rejects.toMatchObject({ name: 'ActionError', code: 'review_sealed' })
    expect((await db.reviews.get(review.id))?.reaction).toBe(5)
  })

  it('lets the Chef answer, even after the seal', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z'))
    const { servingId, dish } = await served()
    const review = await saveReview(servingId, dish.id, { reaction: 6, overall: 5 })

    vi.setSystemTime(new Date('2026-11-13T08:00:00Z'))
    await as(mia)
    await answerReview(review.id, { chefSelfRating: 4, chefReaction: 6, chefExtraReactions: ['love', 'love'], chefReply: '  Told you so.  ' })
    expect(await db.reviews.get(review.id)).toMatchObject({ reaction: 6, overall: 5, chefSelfRating: 4, chefReaction: 6, chefExtraReactions: ['love'], chefReply: 'Told you so.' })
    await expect(answerReview(newId(), { chefReply: 'Hello?' })).rejects.toMatchObject({ code: 'review_missing' })
  })
})

describe('finishing a meal', () => {
  it('needs proof first, then a verdict', async () => {
    const { servingId } = await served()
    await expect(finishMeal(servingId)).rejects.toMatchObject({ code: 'proof_missing' })
    await addProofPhoto(servingId, { image: picture(), source: 'camera', takenAt: '2026-11-10T18:42:00.000Z' })
    await expect(finishMeal(servingId)).rejects.toMatchObject({ code: 'reaction_missing' })
    expect((await db.servings.get(servingId))?.status).toBe('served')

    await reactToMeal(servingId, 5)
    await finishMeal(servingId)
    expect(await db.servings.get(servingId)).toMatchObject({ status: 'eaten', eatenAt: '2026-11-10T18:42:00.000Z' })
  })

  it('takes the time of the earliest proof photo, and lets it be corrected', async () => {
    const { servingId } = await served()
    await addProofPhoto(servingId, { image: picture(), source: 'gallery', takenAt: '2026-11-10T19:30:00.000Z' })
    await addProofPhoto(servingId, { image: picture(), source: 'camera', takenAt: '2026-11-10T18:42:00.000Z' })
    await reactToMeal(servingId, 4)
    await finishMeal(servingId)
    expect((await db.servings.get(servingId))?.eatenAt).toBe('2026-11-10T18:42:00.000Z')
    await setEatenAt(servingId, '2026-11-10T12:15:00.000Z')
    expect((await db.servings.get(servingId))?.eatenAt).toBe('2026-11-10T12:15:00.000Z')
  })

  it('works when the Chef forgot to tap "Served"', async () => {
    const dish = await createDish({ name: 'Rösti' })
    const serving = await proposeServing({ dishId: dish.id, cookedBy: mia })
    await planServing(serving.id, '2026-11-10', 'lunch')
    await addProofPhoto(serving.id, { image: picture(), source: 'camera', takenAt: '2026-11-10T11:58:00.000Z' })
    await reactToMeal(serving.id, 5)
    await finishMeal(serving.id)
    expect(await db.servings.get(serving.id)).toMatchObject({ status: 'eaten', servedAt: '2026-11-10T11:58:00.000Z', eatenAt: '2026-11-10T11:58:00.000Z' })
  })

  it('gives every course of a menu its own verdict', async () => {
    const soup = await createDish({ name: 'Pumpkin soup', course: 'starter' })
    const roast = await createDish({ name: 'Roast chicken' })
    const tart = await createDish({ name: 'Plum tart', course: 'dessert' })
    const menu = await createMenu({ name: 'Sunday roast', courses: [{ dishId: roast.id, order: 1 }, { dishId: tart.id, order: 2 }, { dishId: soup.id, order: 0 }] })
    const serving = await proposeServing({ menuId: menu.id, cookedBy: mia })
    expect(await reviewDishes(serving)).toEqual([soup.id, roast.id, tart.id])

    await addProofPhoto(serving.id, { image: picture(), source: 'camera' })
    await saveReview(serving.id, soup.id, { reaction: 4 })
    await saveReview(serving.id, roast.id, { overall: 5 })
    await expect(finishMeal(serving.id)).rejects.toMatchObject({ code: 'reaction_missing' })

    // One emoji for the whole table fills in what is missing, and can be refined per course.
    await reactToMeal(serving.id, 6)
    await saveReview(serving.id, soup.id, { reaction: 3 })
    await finishMeal(serving.id)
    const verdicts = Object.fromEntries((await db.reviews.toArray()).map((r) => [r.dishId, r.reaction]))
    expect(verdicts).toEqual({ [soup.id]: 3, [roast.id]: 6, [tart.id]: 6 })
    expect((await db.reviews.toArray()).find((r) => r.dishId === roast.id)?.overall).toBe(5)
  })

  it('wants a picture of the whole table for a menu, not only of one course', async () => {
    const soup = await createDish({ name: 'Pumpkin soup', course: 'starter' })
    const roast = await createDish({ name: 'Roast chicken' })
    const menu = await createMenu({ name: 'Sunday roast', courses: [{ dishId: soup.id, order: 0 }, { dishId: roast.id, order: 1 }] })
    const serving = await proposeServing({ menuId: menu.id, cookedBy: mia })
    await reactToMeal(serving.id, 5)

    await addProofPhoto(serving.id, { image: picture(), source: 'camera', courseDishId: soup.id })
    await expect(finishMeal(serving.id)).rejects.toMatchObject({ code: 'proof_missing' })
    await addProofPhoto(serving.id, { image: picture(), source: 'camera' })
    await finishMeal(serving.id)
    expect((await db.servings.get(serving.id))?.status).toBe('eaten')
  })

  it('says so when the meal does not exist', async () => {
    await expect(reactToMeal(newId(), 5)).rejects.toBeInstanceOf(ActionError)
  })
})

describe('review chips', () => {
  it('are stored as keys and shown in the reader\'s language', () => {
    expect(chipLabel('keeper', 'en')).toBe('Recipe keeper')
    expect(chipLabel('keeper', 'de')).toBe('Rezept behalten')
    expect(chipLabel('Something typed long ago', 'de')).toBe('Something typed long ago')
    expect(CHIP_KEYS.length).toBeGreaterThanOrEqual(6)
  })

  it('the demo kitchen uses only known chips', () => {
    const kitchen = { householdId, chefId: mia, tasterId: leo }
    const rows = buildDemoRows({ kitchen, criteria: [], today: '2026-11-10', lang: 'de' })
    const used = new Set(rows.reviews.flatMap((r) => r.chips))
    expect(used.size).toBeGreaterThan(0)
    expect([...used].filter((chip) => !isChipKey(chip))).toEqual([])
  })
})
