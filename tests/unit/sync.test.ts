import { beforeEach, describe, expect, it } from 'vitest'
import { BackendError } from '../../src/data/backend'
import { FakeCloud } from '../../src/data/fake/cloudCore'
import { savePhoto } from '../../src/data/photos'
import { makeCouple, makePhone } from './helpers'

let cloud: FakeCloud

beforeEach(() => {
  cloud = new FakeCloud()
})

describe('pairing', () => {
  it('gives both phones the kitchen, both profiles and the six default criteria', async () => {
    const { her, him } = await makeCouple(cloud)
    for (const phone of [her, him]) {
      expect(await phone.db.households.count()).toBe(1)
      expect((await phone.db.members.toArray()).map((m) => m.name).sort()).toEqual(['Leo', 'Mia'])
      expect(await phone.db.criteria.count()).toBe(6)
    }
  })

  it('refuses a second kitchen, a third person and a wrong code', async () => {
    const { her } = await makeCouple(cloud)
    const stranger = makePhone(cloud)
    await expect(stranger.backend.createHousehold('Mine', { name: 'X' })).rejects.toMatchObject({ code: 'kitchen_already_exists' })
    await expect(stranger.backend.joinHousehold('WRONGCODE1', { name: 'X' })).rejects.toMatchObject({ code: 'invite_invalid' })
    await expect(her.backend.createInvite('join')).rejects.toMatchObject({ code: 'kitchen_full' })
    expect((await stranger.backend.pull(null)).tables.dishes).toEqual([])
  })
})

describe('sync between two phones', () => {
  it('carries a new dish from her phone to his', async () => {
    const { her, him } = await makeCouple(cloud)
    const dish = await her.dish({ name: 'Älplermagronen' })
    await her.engine.sync()
    await him.engine.sync()
    expect((await him.db.dishes.get(dish.id))?.name).toBe('Älplermagronen')
    expect(her.engine.status).toMatchObject({ state: 'idle', pending: 0 })
  })

  it('works offline and catches up later, without the phones ever being online together', async () => {
    const { her, him } = await makeCouple(cloud)

    // She proposes a dish at 10:00 while his phone is asleep.
    him.backend.online = false
    const dish = await her.dish({ name: 'Rösti' })
    await her.engine.sync()
    her.backend.online = false

    // He edits something else while offline: it queues up.
    const other = await him.dish({ name: 'Fondue' })
    await him.engine.sync()
    expect(him.engine.status).toMatchObject({ state: 'offline', pending: 1 })

    // His phone wakes up while hers is off.
    him.backend.online = true
    await him.engine.sync()
    expect((await him.db.dishes.get(dish.id))?.name).toBe('Rösti')
    expect(him.engine.status).toMatchObject({ state: 'idle', pending: 0 })

    her.backend.online = true
    await her.engine.sync()
    expect((await her.db.dishes.get(other.id))?.name).toBe('Fondue')
  })

  it('merges edits to different fields of the same dish (last writer wins per field)', async () => {
    const { her, him } = await makeCouple(cloud)
    const dish = await her.dish()
    await her.engine.sync()
    await him.engine.sync()

    him.backend.online = false
    await him.store.patch('dishes', dish.id, { description: 'Extra cheese, just for you' })
    await her.store.patch('dishes', dish.id, { name: 'Lasagne al forno' })
    await her.engine.sync()

    him.backend.online = true
    await him.engine.sync()
    await her.engine.sync()

    for (const phone of [her, him]) {
      expect(await phone.db.dishes.get(dish.id)).toMatchObject({
        name: 'Lasagne al forno',
        description: 'Extra cheese, just for you',
      })
    }
  })

  it('settles on one value when both change the same field', async () => {
    const { her, him } = await makeCouple(cloud)
    const dish = await her.dish()
    await her.engine.sync()
    await him.engine.sync()

    await her.store.patch('dishes', dish.id, { name: 'Hers' })
    await him.store.patch('dishes', dish.id, { name: 'His' })
    await her.engine.sync()
    await him.engine.sync() // arrives last, so it wins
    await her.engine.sync()

    expect((await her.db.dishes.get(dish.id))?.name).toBe('His')
    expect((await him.db.dishes.get(dish.id))?.name).toBe('His')
  })

  it('keeps an edit made during a sync pass instead of overwriting it with older cloud data', async () => {
    const { her, him } = await makeCouple(cloud)
    const dish = await her.dish()
    await her.engine.sync()
    await him.engine.sync()

    await her.store.patch('dishes', dish.id, { name: 'Renamed by her' })
    await her.engine.sync()

    // He types a note at the exact moment his phone is pulling her rename.
    const realPull = him.backend.pull.bind(him.backend)
    him.backend.pull = async (since) => {
      const result = await realPull(since)
      await him.store.patch('dishes', dish.id, { description: 'typed mid-sync' })
      him.backend.pull = realPull
      return result
    }
    await him.engine.sync()
    expect(await him.db.dishes.get(dish.id)).toMatchObject({ name: 'Renamed by her', description: 'typed mid-sync' })

    await him.engine.sync()
    await her.engine.sync()
    expect(await her.db.dishes.get(dish.id)).toMatchObject({ name: 'Renamed by her', description: 'typed mid-sync' })
  })

  it('syncs a soft delete', async () => {
    const { her, him } = await makeCouple(cloud)
    const dish = await her.dish()
    await her.engine.sync()
    await him.engine.sync()
    await him.store.remove('dishes', dish.id)
    await him.engine.sync()
    await her.engine.sync()
    expect((await her.db.dishes.get(dish.id))?.deletedAt).toBeTruthy()
  })
})

describe('profiles', () => {
  it('shows his status line on her phone, and only he can change it', async () => {
    const { her, him } = await makeCouple(cloud)
    const hisId = (await him.store.memberId()) as string

    await him.store.patch('members', hisId, { status: 'Always Huuungryyyyy', avatar: 'fork', accessory: 'bow' })
    await him.engine.sync()
    await her.engine.sync()
    expect(await her.db.members.get(hisId)).toMatchObject({ status: 'Always Huuungryyyyy', accessory: 'bow' })

    // She cannot rewrite his status: the app refuses, and so does the cloud if asked directly.
    await expect(her.store.patch('members', hisId, { status: 'Never hungry' })).rejects.toThrow('own profile')
    await her.backend.push({ table: 'members', kind: 'patch', id: hisId, data: { status: 'Never hungry' } })
    await him.engine.sync()
    await her.engine.sync()
    expect((await him.db.members.get(hisId))?.status).toBe('Always Huuungryyyyy')
    expect((await her.db.members.get(hisId))?.status).toBe('Always Huuungryyyyy')
  })

  it('refuses a status longer than 60 characters', async () => {
    const { him } = await makeCouple(cloud)
    const hisId = (await him.store.memberId()) as string
    await expect(him.backend.push({ table: 'members', kind: 'patch', id: hisId, data: { status: 'h'.repeat(61) } })).rejects.toMatchObject({ kind: 'rejected' })
  })
})

describe('outbox', () => {
  it('collapses rapid edits to one row into a single queued change', async () => {
    const { her } = await makeCouple(cloud)
    const dish = await her.dish()
    await her.engine.sync()

    await her.store.patch('dishes', dish.id, { name: 'L' })
    await her.store.patch('dishes', dish.id, { name: 'La' })
    await her.store.patch('dishes', dish.id, { description: 'yum' })
    const queued = await her.db.outbox.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0].data).toEqual({ name: 'La', description: 'yum' })
  })

  it('never reorders: a change to another row in between starts a new entry', async () => {
    const { her } = await makeCouple(cloud)
    const first = await her.dish({ name: 'A' })
    const second = await her.dish({ name: 'B' })
    await her.store.patch('dishes', first.id, { name: 'A2' })
    const queued = await her.db.outbox.orderBy('seq').toArray()
    expect(queued.map((op) => [op.kind, op.rowId])).toEqual([
      ['put', first.id],
      ['put', second.id],
      ['patch', first.id],
    ])
  })

  it('sets a refused change aside after three tries and keeps the rest moving', async () => {
    const { her, him } = await makeCouple(cloud)
    const bad = await her.dish({ name: 'Smuggled', householdId: crypto.randomUUID() })
    const good = await her.dish({ name: 'Honest' })
    await her.engine.sync()

    expect(await her.db.outbox.count()).toBe(0)
    const stuck = await her.db.deadLetters.toArray()
    expect(stuck).toHaveLength(1)
    expect(stuck[0]).toMatchObject({ rowId: bad.id, attempts: 3 })
    expect(her.engine.status.stuck).toBe(1)

    await him.engine.sync()
    expect(await him.db.dishes.get(good.id)).toBeTruthy()
    expect(await him.db.dishes.get(bad.id)).toBeUndefined()
  })

  it('does not lose queued changes when the connection drops halfway', async () => {
    const { her, him } = await makeCouple(cloud)
    const a = await her.dish({ name: 'First' })
    const b = await her.dish({ name: 'Second' })

    const realPush = her.backend.push.bind(her.backend)
    let calls = 0
    her.backend.push = async (op) => {
      if (++calls === 2) throw new BackendError('network', 'offline')
      return realPush(op)
    }
    await her.engine.sync()
    expect(her.engine.status).toMatchObject({ state: 'offline', pending: 1 })

    her.backend.push = realPush
    await her.engine.sync()
    await him.engine.sync()
    expect((await him.db.dishes.bulkGet([a.id, b.id])).map((d) => d?.name)).toEqual(['First', 'Second'])
  })
})

describe('photos', () => {
  it('uploads from one phone and arrives on the other, bytes intact', async () => {
    const { her, him } = await makeCouple(cloud)
    const full = new Blob([new Uint8Array(2048).fill(7)], { type: 'image/jpeg' })
    const thumb = new Blob([new Uint8Array(256).fill(9)], { type: 'image/jpeg' })

    him.backend.online = false
    const photo = await savePhoto(him.store, { full, thumb, width: 1600, height: 1200 }, { kind: 'proof', source: 'camera' })
    await him.engine.sync()
    expect(him.engine.status).toMatchObject({ state: 'offline', uploads: 1 })

    him.backend.online = true
    await him.engine.sync()
    expect(him.engine.status).toMatchObject({ state: 'idle', uploads: 0, pending: 0 })
    expect((await him.db.photos.get(photo.id))?.uploaded).toBe(true)

    await her.engine.sync()
    const received = await her.db.blobs.get(photo.id)
    expect(received?.full?.size).toBe(2048)
    expect(received?.thumb?.size).toBe(256)
    expect(new Uint8Array(await (received?.thumb as Blob).arrayBuffer())[0]).toBe(9)
    expect((await her.db.photos.get(photo.id))?.uploaded).toBe(true)
  })
})

describe('restore and lock-out', () => {
  it('moves a profile to a new phone and locks the old one out without losing its unsent work', async () => {
    const { her, him } = await makeCouple(cloud)
    const hisMemberId = (await him.store.memberId()) as string

    const invite = await her.backend.createInvite('restore', hisMemberId)
    const newPhone = makePhone(cloud)
    const membership = await newPhone.backend.joinHousehold(invite.code, { name: 'ignored' })
    expect(membership.memberId).toBe(hisMemberId)
    await newPhone.adopt(membership)
    await newPhone.engine.sync()
    expect((await newPhone.db.members.toArray()).map((m) => m.name).sort()).toEqual(['Leo', 'Mia'])

    await him.dish({ name: 'Written on the old phone' })
    await him.engine.sync()
    expect(him.engine.status.state).toBe('locked-out')
    expect(await him.db.outbox.count()).toBe(1)
    expect(await him.db.deadLetters.count()).toBe(0)
  })

  it('lets the recovery key bring a profile back when both phones are gone', async () => {
    const { her, recoveryKey } = await makeCouple(cloud)
    await her.dish({ name: 'Zopf' })
    await her.engine.sync()

    const fresh = makePhone(cloud)
    await expect(fresh.backend.recoveryPeek('AAAAAAAAAAAAAAAAAAAA')).rejects.toMatchObject({ code: 'recovery_key_invalid' })
    const pretty = `${recoveryKey.slice(0, 5)}-${recoveryKey.slice(5, 10)}-${recoveryKey.slice(10).toLowerCase()}`
    const peek = await fresh.backend.recoveryPeek(pretty)
    const mia = peek.members.find((m) => m.name === 'Mia')
    await fresh.adopt(await fresh.backend.recoverMember(pretty, mia?.id as string))
    await fresh.engine.sync()
    expect((await fresh.db.dishes.toArray()).map((d) => d.name)).toEqual(['Zopf'])
  })
})
