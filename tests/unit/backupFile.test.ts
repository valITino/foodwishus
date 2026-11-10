import { beforeEach, describe, expect, it } from 'vitest'
import { reviewIdFor } from '../../src/data/actions'
import { BackupError, photoEntry } from '../../src/data/backup'
import { exportKitchen, importBackup, openBackup } from '../../src/data/backupFile'
import { META } from '../../src/data/db'
import { FakeCloud } from '../../src/data/fake/cloudCore'
import { savePhoto } from '../../src/data/photos'
import { newId, nowIso, type ID, type Review, type Serving } from '../../src/data/types'
import { crc32, listZip, readZipEntry, ZipError, ZipWriter } from '../../src/data/zip'
import { HER_PIN, makeCouple, makePhone, type Phone } from './helpers'

const bytes = (length: number, fill: number) => new Uint8Array(length).fill(fill)
const jpeg = (length: number, fill: number) => new Blob([bytes(length, fill)], { type: 'image/jpeg' })
const text = (value: string) => new TextEncoder().encode(value)

describe('the zip underneath', () => {
  it('computes the checksum every zip tool expects', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('writes entries and reads them back by name', async () => {
    const zip = new ZipWriter(new Date('2026-11-10T08:00:00Z'))
    await zip.add('backup.json', text('{"hello":"Grüezi"}'))
    await zip.add('photos/a.jpg', jpeg(5000, 7))
    await zip.add('empty.txt', new Uint8Array())
    const file = zip.finish()
    expect(file.type).toBe('application/zip')

    const entries = await listZip(file)
    expect(entries.map((entry) => [entry.name, entry.size, entry.method])).toEqual([
      ['backup.json', 19, 0],
      ['photos/a.jpg', 5000, 0],
      ['empty.txt', 0, 0],
    ])
    expect(new TextDecoder().decode(await readZipEntry(file, entries[0]))).toBe('{"hello":"Grüezi"}')
    const photo = await readZipEntry(file, entries[1])
    expect(photo.length).toBe(5000)
    expect(photo.every((byte) => byte === 7)).toBe(true)
  })

  it('opens with the standard layout: local headers, a table of contents, an end record', async () => {
    const zip = new ZipWriter()
    await zip.add('a.txt', text('abc'))
    const raw = new DataView(await zip.finish().arrayBuffer())
    expect(raw.getUint32(0, true)).toBe(0x04034b50)
    expect(raw.getUint32(14, true)).toBe(crc32(text('abc')))
    expect(raw.getUint32(18, true)).toBe(3)
    const central = 30 + 5 + 3
    expect(raw.getUint32(central, true)).toBe(0x02014b50)
    expect(raw.getUint32(central + 42, true)).toBe(0)
    const end = central + 46 + 5
    expect(raw.getUint32(end, true)).toBe(0x06054b50)
    expect(raw.getUint16(end + 10, true)).toBe(1)
    expect(raw.getUint32(end + 16, true)).toBe(central)
    expect(raw.byteLength).toBe(end + 22)
  })

  it('reads entries another tool compressed', async () => {
    // A zip with one deflated entry, built by hand the way desktop tools write them.
    const plain = text('{"format":"x","padding":"' + 'a'.repeat(400) + '"}')
    const packed = new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    const name = text('backup.json')
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(8, 8, true)
    local.setUint16(26, name.length, true)
    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(10, 8, true)
    central.setUint32(16, crc32(plain), true)
    central.setUint32(20, packed.length, true)
    central.setUint32(24, plain.length, true)
    central.setUint16(28, name.length, true)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, 1, true)
    end.setUint16(10, 1, true)
    end.setUint32(12, 46 + name.length, true)
    end.setUint32(16, 30 + name.length + packed.length, true)
    const file = new Blob([local, name, packed, central, name, end])

    const [entry] = await listZip(file)
    expect(entry).toMatchObject({ name: 'backup.json', method: 8, size: plain.length })
    expect(await readZipEntry(file, entry)).toEqual(plain)
  })

  it('says so when a file is not a zip, is cut off, or has been tampered with', async () => {
    await expect(listZip(new Blob(['just some text, certainly not a zip']))).rejects.toMatchObject({ code: 'not_a_zip' })
    await expect(listZip(new Blob([]))).rejects.toBeInstanceOf(ZipError)

    const zip = new ZipWriter()
    await zip.add('a.txt', text('hello hello hello'))
    const whole = new Uint8Array(await zip.finish().arrayBuffer())
    await expect(listZip(new Blob([whole.slice(0, whole.length - 30)]))).rejects.toMatchObject({ code: 'not_a_zip' })

    whole[30 + 5 + 2] ^= 0xff // one byte of the content flipped
    const file = new Blob([whole])
    await expect(readZipEntry(file, (await listZip(file))[0])).rejects.toMatchObject({ code: 'damaged' })
  })
})

// ------------------------------------------------------- export and import --

let cloud: FakeCloud

beforeEach(() => {
  cloud = new FakeCloud()
})

interface Filled {
  dishId: ID
  menuId: ID
  servingId: ID
  wishId: ID
  reviewId: ID
  proofId: ID
  coverId: ID
}

/** A kitchen with a little of everything: two dishes, a menu, an eaten meal with proof and a review, a wish. */
async function fill(phone: Phone): Promise<Filled> {
  const householdId = (await phone.store.householdId()) as ID
  const memberId = (await phone.store.memberId()) as ID
  const at = nowIso()
  const row = () => ({ id: newId(), householdId, createdAt: at, updatedAt: at, deletedAt: null })
  const cover = await savePhoto(phone.store, { full: jpeg(3000, 1), thumb: jpeg(300, 2), width: 1600, height: 1200 }, { kind: 'cover', source: 'gallery' })
  const proof = await savePhoto(phone.store, { full: jpeg(4000, 3), thumb: jpeg(400, 4), width: 1600, height: 1200 }, { kind: 'proof', source: 'camera' })
  const rosti = await phone.dish({ name: 'Rösti', coverPhotoId: cover.id, recipe: { steps: [{ text: 'Grate.' }, { text: 'Fry.' }] } })
  const zopf = await phone.dish({ name: 'Zopf', course: 'breakfast' })
  const menuId = newId()
  await phone.store.put('menus', { ...row(), id: menuId, name: 'Sunday brunch', description: null, courses: [{ dishId: zopf.id, order: 0 }], createdBy: memberId, archived: false })
  const meal: Serving = {
    ...row(),
    dishId: rosti.id,
    menuId: null,
    proposedBy: memberId,
    cookedBy: memberId,
    proposedAt: at,
    note: 'Extra crispy',
    suggestedDays: [],
    craving: 5,
    priority: 'a0',
    status: 'eaten',
    plannedDate: '2026-11-09',
    plannedSlot: 'dinner',
    servedAt: at,
    eatenAt: at,
    skippedReason: null,
    proofPhotos: [{ photoId: proof.id, source: 'camera', takenAt: at }],
  }
  await phone.store.put('servings', meal)
  const wish: Serving = { ...meal, id: newId(), dishId: null, menuId, note: null, status: 'wishlist', plannedDate: null, plannedSlot: null, servedAt: null, eatenAt: null, proofPhotos: [], priority: 'a1' }
  await phone.store.put('servings', wish)
  const criteria = await phone.db.criteria.toArray()
  const verdict: Review = {
    ...row(),
    id: await reviewIdFor(meal.id, rosti.id, memberId),
    servingId: meal.id,
    dishId: rosti.id,
    reviewerId: memberId,
    reaction: 6,
    extraReactions: [],
    overall: 5,
    scores: Object.fromEntries(criteria.map((criterion) => [criterion.id, 4])) as Review['scores'],
    portionsEaten: 2,
    wouldEatAgain: true,
    comment: 'More please',
    chips: [],
    chefSelfRating: null,
    chefReaction: null,
    chefExtraReactions: [],
    chefReply: null,
    sealedAt: new Date(Date.now() - 1000).toISOString(),
  }
  await phone.store.put('reviews', verdict)
  await phone.engine.sync()
  return { dishId: rosti.id, menuId, servingId: meal.id, wishId: wish.id, reviewId: verdict.id, proofId: proof.id, coverId: cover.id }
}

const exported = (phone: Phone, withPhotos = true) => exportKitchen({ db: phone.db, backend: phone.backend }, { withPhotos, now: new Date('2026-11-10T08:00:00Z') })
const open = (phone: Phone, file: Blob) => openBackup(phone.db, file, reviewIdFor)
const firstByte = async (blob: Blob | null | undefined) => new Uint8Array(await (blob as Blob).arrayBuffer())[0]

describe('exporting', () => {
  it('packs everything into one named file: the rows as JSON, the photos next to it', async () => {
    const { her } = await makeCouple(cloud)
    const made = await fill(her)
    const progress: [number, number][] = []
    const result = await exportKitchen({ db: her.db, backend: her.backend }, { withPhotos: true, now: new Date('2026-11-10T08:00:00Z'), onProgress: (done, total) => progress.push([done, total]) })

    expect(result.name).toBe('foodwishus-backup-2026-11-10.zip')
    expect(result.summary).toMatchObject({ kitchenName: 'Our kitchen', dishes: 2, menus: 1, meals: 1, wishes: 1, reviews: 1, photos: 2, withPhotos: true })
    expect(result).toMatchObject({ photosSmall: 0, photosMissing: 0 })
    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ])

    const names = (await listZip(result.file)).map((entry) => entry.name).sort()
    expect(names).toEqual(['backup.json', photoEntry(made.coverId, 'full'), photoEntry(made.coverId, 'thumb'), photoEntry(made.proofId, 'full'), photoEntry(made.proofId, 'thumb')].sort())
    expect(await her.db.getMeta(META.lastBackupAt)).toBe('2026-11-10T08:00:00.000Z')
  })

  it('holds no PIN, no device and nothing of a profile but name and role', async () => {
    const { her } = await makeCouple(cloud)
    await fill(her)
    const { file } = await exported(her)
    const json = new TextDecoder().decode(await readZipEntry(file, (await listZip(file)).find((entry) => entry.name === 'backup.json')!))
    expect(json).not.toContain(HER_PIN)
    for (const word of ['pin', 'prefs', 'isAdmin', 'avatar', 'disabledAt']) expect(json).not.toContain(`"${word}"`)
    expect(JSON.parse(json).people).toEqual([
      { id: expect.any(String), name: 'Mia', role: 'chef' },
      { id: expect.any(String), name: 'Leo', role: 'taster' },
    ])
  })

  it('without photos: a small file, and no photo rows either', async () => {
    const { her } = await makeCouple(cloud)
    await fill(her)
    const result = await exported(her, false)
    expect((await listZip(result.file)).map((entry) => entry.name)).toEqual(['backup.json'])
    expect(result.summary).toMatchObject({ photos: 0, withPhotos: false, dishes: 2 })
    expect(result.file.size).toBeLessThan(20_000)
  })

  it('fetches full-size photos this device only has as thumbnails, and says when it cannot', async () => {
    const { her, him } = await makeCouple(cloud)
    const made = await fill(her)
    await him.engine.sync()
    // His phone keeps old photos as thumbnails only.
    await him.db.blobs.update(made.proofId, { full: null })
    await him.db.blobs.delete(made.coverId)

    const online = await exported(him)
    expect(online).toMatchObject({ photosSmall: 0, photosMissing: 0 })
    const entries = await listZip(online.file)
    expect((await readZipEntry(online.file, entries.find((entry) => entry.name === photoEntry(made.proofId, 'full'))!))[0]).toBe(3)
    expect((await readZipEntry(online.file, entries.find((entry) => entry.name === photoEntry(made.coverId, 'full'))!)).length).toBe(3000)

    him.backend.online = false
    const offline = await exported(him)
    expect(offline).toMatchObject({ photosSmall: 1, photosMissing: 1 })
    expect(offline.summary.photos).toBe(1)
    expect((await listZip(offline.file)).map((entry) => entry.name).sort()).toEqual(['backup.json', photoEntry(made.proofId, 'thumb')].sort())
  })
})

describe('importing', () => {
  it('refuses what is not a backup, with a reason', async () => {
    const { her } = await makeCouple(cloud)
    await expect(open(her, new Blob(['Dear diary']))).rejects.toMatchObject({ code: 'not_a_backup' })

    const other = new ZipWriter()
    await other.add('holiday.txt', text('sun'))
    await expect(open(her, other.finish())).rejects.toMatchObject({ code: 'not_a_backup' })

    const garbled = new ZipWriter()
    await garbled.add('backup.json', text('{"format":"foodwishus-backup", oops'))
    await expect(open(her, garbled.finish())).rejects.toMatchObject({ code: 'damaged' })

    const future = new ZipWriter()
    await future.add('backup.json', text(JSON.stringify({ format: 'foodwishus-backup', version: 99 })))
    const error = await open(her, future.finish()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BackupError)
    expect(error).toMatchObject({ code: 'too_new' })

    await fill(her)
    const whole = new Uint8Array(await (await exported(her)).file.arrayBuffer())
    await expect(open(her, new Blob([whole.slice(0, whole.length - 200)]))).rejects.toMatchObject({ code: 'not_a_backup' })
  })

  it('shows what the file holds and what would happen, without changing anything', async () => {
    const { her } = await makeCouple(cloud)
    await fill(her)
    const { file } = await exported(her)

    const elsewhere = new FakeCloud()
    const fresh = makePhone(elsewhere)
    await fresh.adopt(await fresh.backend.createHousehold('New home', { name: 'Mia', defaultRole: 'chef' }, HER_PIN))
    await fresh.engine.sync()
    const before = await fresh.db.dishes.count()

    const opened = await open(fresh, file)
    expect(opened.summary).toMatchObject({ kitchenName: 'Our kitchen', madeAt: '2026-11-10T08:00:00.000Z', dishes: 2, meals: 1, photos: 2 })
    expect(opened.plan.sameKitchen).toBe(false)
    expect(opened.plan.counts.dishes.add).toBe(2)
    expect(opened.plan.counts.photos.add).toBe(2)
    // The new kitchen has its own six criteria with the same names: none is added twice.
    expect(opened.plan.counts.criteria).toEqual({ add: 0, update: 0, back: 0, keep: 6 })
    expect(await fresh.db.dishes.count()).toBe(before)
    expect(await fresh.db.outbox.count()).toBe(0)
  })

  it('restores everything into an empty kitchen, photos included, and it all syncs to the partner', async () => {
    const { her } = await makeCouple(cloud)
    const made = await fill(her)
    const { file } = await exported(her)

    // A brand-new cloud: another kitchen id, other profiles, other criteria ids.
    const elsewhere = new FakeCloud()
    const { her: mia, him: leo } = await makeCouple(elsewhere)
    const home = (await mia.store.householdId()) as ID
    const miaId = (await mia.store.memberId()) as ID

    const progress: number[] = []
    const result = await importBackup(mia.store, await open(mia, file), reviewIdFor, (done) => progress.push(done))
    expect(result).toEqual({ written: { criteria: 0, photos: 2, dishes: 2, menus: 1, servings: 2, reviews: 1 }, photosDamaged: 0 })
    expect(progress.at(-1)).toBe(8)

    await mia.engine.sync()
    expect(await mia.db.deadLetters.count()).toBe(0)
    expect(await mia.db.outbox.count()).toBe(0)
    await leo.engine.sync()

    for (const phone of [mia, leo]) {
      const dish = await phone.db.dishes.get(made.dishId)
      expect(dish).toMatchObject({ name: 'Rösti', householdId: home, createdBy: miaId, coverPhotoId: made.coverId })
      expect(await phone.db.menus.get(made.menuId)).toMatchObject({ name: 'Sunday brunch', householdId: home })
      expect(await phone.db.servings.get(made.servingId)).toMatchObject({ status: 'eaten', note: 'Extra crispy', cookedBy: miaId, proofPhotos: [{ photoId: made.proofId }] })
      expect(await phone.db.servings.get(made.wishId)).toMatchObject({ status: 'wishlist', menuId: made.menuId })
      expect(await phone.db.photos.get(made.proofId)).toMatchObject({ kind: 'proof', householdId: home, uploaded: true })
      expect(await firstByte((await phone.db.blobs.get(made.proofId))?.full)).toBe(3)
      expect(await firstByte((await phone.db.blobs.get(made.coverId))?.thumb)).toBe(2)
      expect(await phone.db.criteria.count()).toBe(6)
      expect(await phone.db.members.count()).toBe(2)
    }

    // The review moved to Mia's profile in this kitchen, with its scores under this kitchen's criteria.
    const reviews = await leo.db.reviews.toArray()
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ id: await reviewIdFor(made.servingId, made.dishId, miaId), reviewerId: miaId, overall: 5, comment: 'More please' })
    const criteria = new Set((await leo.db.criteria.toArray()).map((criterion) => criterion.id))
    expect(Object.keys(reviews[0].scores)).toHaveLength(6)
    expect(Object.keys(reviews[0].scores).every((id) => criteria.has(id))).toBe(true)
  })

  it('can run twice: the second time there is nothing left to do', async () => {
    const { her } = await makeCouple(cloud)
    await fill(her)
    const { file } = await exported(her)
    const elsewhere = new FakeCloud()
    const { her: mia } = await makeCouple(elsewhere)

    await importBackup(mia.store, await open(mia, file), reviewIdFor)
    await mia.engine.sync()
    const again = await open(mia, file)
    expect(again.plan.writes).toEqual([])
    const second = await importBackup(mia.store, again, reviewIdFor)
    expect(Object.values(second.written).every((count) => count === 0)).toBe(true)
    expect(await mia.db.outbox.count()).toBe(0)
    expect(await mia.db.reviews.count()).toBe(1)
  })

  it('into the same kitchen: keeps newer work, brings back what was deleted, deletes nothing', async () => {
    const { her, him } = await makeCouple(cloud)
    const made = await fill(her)
    const { file } = await exported(her)

    // Since the backup: the dish was renamed, the wish was removed, and a new dish was added.
    await her.store.patch('dishes', made.dishId, { name: 'Rösti deluxe' })
    await her.store.remove('servings', made.wishId)
    const newer = await her.dish({ name: 'Fondue' })
    await her.engine.sync()

    const opened = await open(her, file)
    expect(opened.plan.sameKitchen).toBe(true)
    expect(opened.plan.writes.map((write) => [write.table, write.reason])).toEqual([['servings', 'back']])
    await importBackup(her.store, opened, reviewIdFor)
    await her.engine.sync()
    await him.engine.sync()

    expect((await him.db.dishes.get(made.dishId))?.name).toBe('Rösti deluxe')
    expect((await him.db.dishes.get(newer.id))?.deletedAt).toBeNull()
    expect((await him.db.servings.get(made.wishId))?.deletedAt).toBeNull()
    expect(await her.db.deadLetters.count()).toBe(0)
  })

  it('a damaged picture is left out and nothing points to it', async () => {
    const { her } = await makeCouple(cloud)
    const made = await fill(her)
    const { file } = await exported(her)
    const whole = new Uint8Array(await file.arrayBuffer())
    for (const variant of ['full', 'thumb'] as const) {
      const entry = (await listZip(file)).find((e) => e.name === photoEntry(made.coverId, variant))!
      whole[entry.offset + 30 + entry.name.length + 5] ^= 0xff
    }

    const elsewhere = new FakeCloud()
    const { her: mia } = await makeCouple(elsewhere)
    const result = await importBackup(mia.store, await open(mia, new Blob([whole])), reviewIdFor)
    expect(result.photosDamaged).toBe(1)
    expect(result.written.photos).toBe(1)
    expect((await mia.db.dishes.get(made.dishId))?.coverPhotoId).toBeNull()
    expect(await mia.db.photos.get(made.coverId)).toBeUndefined()
    await mia.engine.sync()
    expect(await mia.db.deadLetters.count()).toBe(0)
  })

  it('reads a backup that was unpacked and zipped again inside a folder', async () => {
    const { her } = await makeCouple(cloud)
    const made = await fill(her)
    const { file } = await exported(her)
    const repacked = new ZipWriter()
    for (const entry of await listZip(file)) await repacked.add(`my-backup/${entry.name}`, await readZipEntry(file, entry))

    const elsewhere = new FakeCloud()
    const { her: mia } = await makeCouple(elsewhere)
    const opened = await open(mia, repacked.finish())
    expect(opened.plan.counts.photos.add).toBe(2)
    await importBackup(mia.store, opened, reviewIdFor)
    expect(await firstByte((await mia.db.blobs.get(made.proofId))?.full)).toBe(3)
  })

  it('in the demo kitchen (no cloud) the photos are simply there, with nothing waiting', async () => {
    const { her } = await makeCouple(cloud)
    const made = await fill(her)
    const { file } = await exported(her)

    const { AppDB } = await import('../../src/data/db')
    const { Store } = await import('../../src/data/store')
    const db = new AppDB(`demo-${Math.random().toString(36).slice(2)}`)
    const home = newId()
    const at = nowIso()
    await db.households.put({ id: home, name: 'Demo', settings: {}, createdAt: at, updatedAt: at, deletedAt: null })
    await db.setMeta(META.householdId, home)
    await db.setMeta(META.memberId, newId())
    const store = new Store(db, true)

    await importBackup(store, await openBackup(db, file, reviewIdFor), reviewIdFor)
    expect(await db.photos.get(made.proofId)).toMatchObject({ uploaded: true, householdId: home })
    expect(await db.blobs.get(made.proofId)).toMatchObject({ pending: 0 })
    expect(await db.outbox.count()).toBe(0)
    expect(await db.dishes.count()).toBe(2)
  })
})
