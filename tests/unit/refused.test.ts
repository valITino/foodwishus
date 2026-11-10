import { beforeEach, describe, expect, it } from 'vitest'
import { BackendError } from '../../src/data/backend'
import type { DeadLetter } from '../../src/data/db'
import { FakeCloud } from '../../src/data/fake/cloudCore'
import { savePhoto } from '../../src/data/photos'
import { describeRefused, type RefusedLookup } from '../../src/data/refused'
import { MAX_UPLOAD_ATTEMPTS } from '../../src/data/sync'
import type { ID } from '../../src/data/types'
import { makeCouple, type Phone } from './helpers'

let cloud: FakeCloud

beforeEach(() => {
  cloud = new FakeCloud()
})

/** Make the cloud say no to every change to these rows, until they are taken out of the set again. */
function refuse(phone: Phone): Set<ID> {
  const blocked = new Set<ID>()
  const push = phone.backend.push.bind(phone.backend)
  phone.backend.push = async (op) => {
    if (blocked.has(op.id)) throw new BackendError('rejected', 'forbidden')
    return push(op)
  }
  return blocked
}

const letters = (phone: Phone) => phone.db.deadLetters.orderBy('seq').toArray()

describe('a new row the cloud refused', () => {
  it('"Try again" sends it as it is now, later edits included', async () => {
    const { her, him } = await makeCouple(cloud)
    const blocked = refuse(her)
    const dish = await her.dish({ name: 'Rösti' })
    blocked.add(dish.id)
    await her.engine.sync()
    expect(await letters(her)).toMatchObject([{ table: 'dishes', rowId: dish.id, kind: 'put', attempts: 3, lastError: 'forbidden' }])
    expect(her.engine.status.stuck).toBe(1)
    // Still on her phone, nowhere else.
    expect((await her.db.dishes.get(dish.id))?.name).toBe('Rösti')
    await him.engine.sync()
    expect(await him.db.dishes.get(dish.id)).toBeUndefined()

    // She keeps working on it. The cloud has no such row, so this edit alone would go nowhere.
    blocked.delete(dish.id)
    await her.store.patch('dishes', dish.id, { name: 'Rösti with egg' })
    await her.engine.sync()
    await him.engine.sync()
    expect(await him.db.dishes.get(dish.id)).toBeUndefined()

    const [letter] = await letters(her)
    await her.engine.retryRefused(letter.seq as number)
    expect(await her.db.deadLetters.count()).toBe(0)
    expect(await her.db.outbox.toArray()).toMatchObject([{ table: 'dishes', rowId: dish.id, kind: 'put', attempts: 0, data: { name: 'Rösti with egg' } }])

    await her.engine.sync()
    await him.engine.sync()
    expect((await him.db.dishes.get(dish.id))?.name).toBe('Rösti with egg')
    expect(her.engine.status).toMatchObject({ stuck: 0, pending: 0 })
  })

  it('a second refusal sets it aside again instead of losing it', async () => {
    const { her } = await makeCouple(cloud)
    const blocked = refuse(her)
    const dish = await her.dish({ name: 'Rösti' })
    blocked.add(dish.id)
    await her.engine.sync()
    const [first] = await letters(her)
    await her.engine.retryRefused(first.seq as number)
    await her.engine.sync()
    const again = await letters(her)
    expect(again).toHaveLength(1)
    expect(again[0].seq).not.toBe(first.seq)
    expect(await her.db.dishes.get(dish.id)).toBeTruthy()
  })

  it('"Discard" removes it from this device too, with the edits that were waiting for it', async () => {
    const { her, him } = await makeCouple(cloud)
    const blocked = refuse(her)
    const dish = await her.dish({ name: 'Rösti' })
    const other = await her.dish({ name: 'Zopf' })
    blocked.add(dish.id)
    await her.engine.sync()
    const [letter] = await letters(her)

    // Offline nobody can tell whether the cloud has the row: nothing is thrown away.
    her.backend.online = false
    await her.store.patch('dishes', dish.id, { name: 'Rösti, edited offline' })
    await expect(her.engine.discardRefused(letter.seq as number)).rejects.toMatchObject({ kind: 'network' })
    expect(await her.db.deadLetters.count()).toBe(1)
    expect(await her.db.dishes.get(dish.id)).toBeTruthy()

    her.backend.online = true
    await her.engine.discardRefused(letter.seq as number)
    expect(await her.db.deadLetters.count()).toBe(0)
    expect(await her.db.dishes.get(dish.id)).toBeUndefined()
    expect(await her.db.outbox.count()).toBe(0)
    expect(her.engine.status.stuck).toBe(0)
    // Everything else is untouched, here and there.
    expect((await her.db.dishes.get(other.id))?.name).toBe('Zopf')
    await him.engine.sync()
    expect((await him.db.dishes.get(other.id))?.name).toBe('Zopf')
  })

  it('"Discard" keeps the row when the cloud has it after all', async () => {
    const { her } = await makeCouple(cloud)
    const blocked = refuse(her)
    const dish = await her.dish({ name: 'Rösti' })
    blocked.add(dish.id)
    await her.engine.sync()
    // It arrived some other way in the meantime.
    blocked.delete(dish.id)
    await her.backend.push({ table: 'dishes', kind: 'put', id: dish.id, data: { ...dish } })

    const [letter] = await letters(her)
    await her.engine.discardRefused(letter.seq as number)
    expect(await her.db.deadLetters.count()).toBe(0)
    expect((await her.db.dishes.get(dish.id))?.name).toBe('Rösti')
  })

  it('a refused photo row takes its picture along when it is discarded', async () => {
    const { her } = await makeCouple(cloud)
    const blocked = refuse(her)
    const image = { full: new Blob([new Uint8Array(900)]), thumb: new Blob([new Uint8Array(90)]), width: 1600, height: 1200 }
    const photo = await savePhoto(her.store, image, { kind: 'proof', source: 'camera' })
    blocked.add(photo.id)
    await her.engine.sync()
    const letter = (await letters(her)).find((l) => l.kind === 'put')
    expect(letter).toMatchObject({ table: 'photos', kind: 'put' })
    for (const other of await letters(her)) if (other.seq !== letter?.seq) await her.db.deadLetters.delete(other.seq as number)

    await her.engine.discardRefused(letter?.seq as number)
    expect(await her.db.photos.get(photo.id)).toBeUndefined()
    expect(await her.db.blobs.get(photo.id)).toBeUndefined()
  })
})

describe('an edit the cloud refused', () => {
  async function refusedRename() {
    const { her, him } = await makeCouple(cloud)
    const blocked = refuse(her)
    const dish = await her.dish({ name: 'Rösti' })
    await her.engine.sync()
    blocked.add(dish.id)
    await her.store.patch('dishes', dish.id, { name: 'Rösti deluxe' })
    await her.engine.sync()
    const [letter] = await letters(her)
    expect(letter).toMatchObject({ table: 'dishes', kind: 'patch', data: { name: 'Rösti deluxe' } })
    // Her phone has fallen back in line with the cloud: the old name is back on screen.
    expect((await her.db.dishes.get(dish.id))?.name).toBe('Rösti')
    return { her, him, blocked, dish, seq: letter.seq as number }
  }

  it('"Try again" applies it again and sends it', async () => {
    const { her, him, blocked, dish, seq } = await refusedRename()
    blocked.delete(dish.id)
    await her.engine.retryRefused(seq)
    expect((await her.db.dishes.get(dish.id))?.name).toBe('Rösti deluxe')
    await her.engine.sync()
    await him.engine.sync()
    expect((await him.db.dishes.get(dish.id))?.name).toBe('Rösti deluxe')
    expect(await her.db.deadLetters.count()).toBe(0)
  })

  it('"Discard" drops the edit and leaves the row as the cloud has it, even offline', async () => {
    const { her, him, dish, seq } = await refusedRename()
    her.backend.online = false
    await her.engine.discardRefused(seq)
    expect(await her.db.deadLetters.count()).toBe(0)
    expect((await her.db.dishes.get(dish.id))?.name).toBe('Rösti')
    her.backend.online = true
    await her.engine.sync()
    await him.engine.sync()
    expect((await him.db.dishes.get(dish.id))?.name).toBe('Rösti')
  })

  it('both do nothing for a change that is no longer in the list', async () => {
    const { her, seq } = await refusedRename()
    await her.engine.discardRefused(seq)
    await expect(her.engine.discardRefused(seq)).resolves.toBeUndefined()
    await expect(her.engine.retryRefused(seq)).resolves.toBeUndefined()
    expect(await her.db.outbox.count()).toBe(0)
  })
})

describe('a photo the cloud keeps refusing', () => {
  it('stops being sent after five tries, and "Try again" gives it a fresh start', async () => {
    const { her, him } = await makeCouple(cloud)
    let refusing = true
    const upload = her.backend.uploadBlob.bind(her.backend)
    her.backend.uploadBlob = async (path, blob) => {
      if (refusing) throw new BackendError('rejected', 'storage_refused')
      return upload(path, blob)
    }
    const image = { full: new Blob([new Uint8Array(900).fill(5)]), thumb: new Blob([new Uint8Array(90)]), width: 1600, height: 1200 }
    const photo = await savePhoto(her.store, image, { kind: 'proof', source: 'camera' })
    for (let pass = 0; pass < MAX_UPLOAD_ATTEMPTS + 2; pass++) await her.engine.sync()
    expect(await her.db.blobs.get(photo.id)).toMatchObject({ pending: 1, attempts: MAX_UPLOAD_ATTEMPTS })
    expect(her.engine.status.uploads).toBe(1)

    // The cloud takes photos again, but this one has given up.
    refusing = false
    await her.engine.sync()
    expect((await her.db.blobs.get(photo.id))?.pending).toBe(1)

    await her.engine.retryUploads()
    await her.engine.sync()
    expect(await her.db.blobs.get(photo.id)).toMatchObject({ pending: 0, attempts: 0 })
    await him.engine.sync()
    expect(new Uint8Array(await ((await him.db.blobs.get(photo.id))?.full as Blob).arrayBuffer())[0]).toBe(5)
  })
})

describe('saying what a refused change was', () => {
  const kitchen: RefusedLookup = {
    dishes: new Map([['d1', { name: 'Rösti' }]]),
    menus: new Map([['m1', { name: 'Sunday brunch' }]]),
    servings: new Map([
      ['s1', { dishId: 'd1', menuId: null }],
      ['s2', { dishId: null, menuId: 'm1' }],
    ]),
    reviews: new Map([['r1', { dishId: 'd1', servingId: 's1' }]]),
    criteria: new Map([['c1', { label: 'Taste' }]]),
  }
  const letter = (table: DeadLetter['table'], rowId: string, kind: 'put' | 'patch', data: Record<string, unknown> = {}): DeadLetter => ({ seq: 7, table, rowId, kind, data, createdAt: '2026-11-10T07:00:00.000Z', attempts: 3, lastError: 'forbidden', failedAt: '2026-11-10T07:01:00.000Z' })
  const said = (l: DeadLetter) => {
    const { thing, what, name } = describeRefused(l, kitchen)
    return [thing, what, name]
  }

  it('names the dish, menu or criterion', () => {
    expect(said(letter('dishes', 'd1', 'patch', { name: 'Rösti deluxe' }))).toEqual(['dish', 'change', 'Rösti'])
    expect(said(letter('menus', 'm1', 'patch', { archived: true }))).toEqual(['menu', 'change', 'Sunday brunch'])
    expect(said(letter('criteria', 'c1', 'patch', { active: false }))).toEqual(['criterion', 'change', 'Taste'])
    expect(describeRefused(letter('dishes', 'd1', 'patch'), kitchen)).toMatchObject({ seq: 7, failedAt: '2026-11-10T07:01:00.000Z' })
  })

  it('tells new things, edits and removals apart', () => {
    expect(said(letter('dishes', 'd1', 'put', { name: 'Rösti' }))).toEqual(['dish', 'new', 'Rösti'])
    expect(said(letter('dishes', 'd1', 'patch', { deletedAt: '2026-11-10T07:00:00.000Z' }))).toEqual(['dish', 'removal', 'Rösti'])
    expect(said(letter('dishes', 'd1', 'patch', { deletedAt: null }))).toEqual(['dish', 'change', 'Rösti'])
  })

  it('names a meal or a review after its dish or menu', () => {
    expect(said(letter('servings', 's1', 'patch', { craving: 5 }))).toEqual(['meal', 'change', 'Rösti'])
    expect(said(letter('servings', 's2', 'patch', { status: 'planned' }))).toEqual(['meal', 'change', 'Sunday brunch'])
    expect(said(letter('reviews', 'r1', 'patch', { overall: 5 }))).toEqual(['review', 'change', 'Rösti'])
    // A row that is not on this device any more: what the change itself says is used.
    expect(said(letter('servings', 'gone', 'put', { dishId: 'd1', menuId: null }))).toEqual(['meal', 'new', 'Rösti'])
    expect(said(letter('reviews', 'gone', 'put', { dishId: null, servingId: 's2' }))).toEqual(['review', 'new', 'Sunday brunch'])
    expect(said(letter('dishes', 'gone', 'put', { name: '  Fondue ' }))).toEqual(['dish', 'new', 'Fondue'])
  })

  it('copes without a name', () => {
    expect(said(letter('dishes', 'gone', 'patch', { archived: true }))).toEqual(['dish', 'change', null])
    expect(said(letter('photos', 'p1', 'put', { kind: 'proof' }))).toEqual(['photo', 'new', null])
    expect(said(letter('members', 'me', 'patch', { status: 'x' }))).toEqual(['profile', 'change', null])
    expect(said(letter('households', 'h', 'patch', { name: 'Casa' }))).toEqual(['kitchen', 'change', null])
  })
})
