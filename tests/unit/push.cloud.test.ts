import { beforeEach, describe, expect, it } from 'vitest'
import { PUSH_TYPES, type PushSubscriptionInput } from '../../src/data/backend'
import { FakeCloud, TEST_PUSH_KEY } from '../../src/data/fake/cloudCore'
import { PushControl, type DeviceSubscription, type Permission, type PushDevice, type PushMemory } from '../../src/data/push'
import { newId, nowIso, type Review, type Serving } from '../../src/data/types'
import { HIS_PIN, makeCouple, makePhone, type Phone } from './helpers'

// Notifications from end to end against the pretend cloud: a device signs up, the other
// person does something, and the cloud "sends" what the real one would hand to the
// browser's push service. Two phones, one kitchen: Mia cooks, Leo eats.
//
// The key a browser signs up with comes from the cloud, never from the build.

const KEY = TEST_PUSH_KEY
/** What the function would make after the owner threw the first pair away. */
const NEXT_KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'

/** A browser's push side, as far as the app can see it. */
class FakeDevice implements PushDevice {
  can = true
  state: Permission = 'default'
  /** What the person will answer when the browser asks. */
  answer: Permission = 'granted'
  asked = 0
  held: DeviceSubscription | null = null
  failSubscribe = false
  private made = 0

  constructor(private readonly name: string) {}

  supported = () => this.can
  permission = () => this.state
  async askPermission() {
    this.asked += 1
    this.state = this.answer
    return this.state
  }
  /** The key the held subscription was made with. */
  madeWith = KEY
  async current(vapidPublicKey: string) {
    return this.held && this.madeWith === vapidPublicKey ? this.held : null
  }
  async subscribe(vapidPublicKey: string) {
    if (this.state !== 'granted') throw new Error('permission was never given')
    if (this.failSubscribe || !vapidPublicKey) throw new Error('push service said no')
    if (this.held && this.madeWith !== vapidPublicKey) this.held = null
    this.held ??= { endpoint: `https://push.example.test/${this.name}/${++this.made}`, p256dh: `key-of-${this.name}`, auth: 'secret' }
    this.madeWith = vapidPublicKey
    return this.held
  }
  async unsubscribe() {
    this.held = null
  }
}

function memory(): PushMemory & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

let cloud: FakeCloud
let her: Phone
let him: Phone
let herId: string
let hisId: string

beforeEach(async () => {
  cloud = new FakeCloud()
  ;({ her, him } = await makeCouple(cloud))
  herId = (await her.store.memberId()) as string
  hisId = (await him.store.memberId()) as string
})

function notifications(phone: Phone, name: string) {
  const device = new FakeDevice(name)
  const notes = memory()
  const control = new PushControl(device, phone.backend, notes, `${name} browser`)
  return { device, notes, control }
}

const sub = (name: string, mutedTypes: PushSubscriptionInput['mutedTypes'] = []): PushSubscriptionInput => ({ endpoint: `https://push.example.test/${name}`, p256dh: 'key', auth: 'secret', mutedTypes })

/** She puts a dish on the wishlist. */
async function propose(by: Phone, name = 'Älplermagronen'): Promise<Serving> {
  const dish = await by.dish({ name })
  const at = nowIso()
  const serving: Serving = {
    id: newId(),
    householdId: dish.householdId,
    dishId: dish.id,
    menuId: null,
    proposedBy: herId,
    cookedBy: herId,
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
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
  await by.store.put('servings', serving)
  await by.engine.sync()
  return serving
}

const tomorrow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(Date.now() + 24 * 3_600_000))

async function change(by: Phone, id: string, changes: Partial<Serving>): Promise<void> {
  await by.store.patch('servings', id, changes)
  await by.engine.sync()
}

const bodies = () => cloud.sentPushes().map((p) => p.message.body)

describe('signing a device up', () => {
  it('asks for permission only after the tap, then the cloud knows where to send', async () => {
    const leo = notifications(him, 'leo-phone')
    // Nothing is known yet, and the start of the app asks nobody anything.
    expect(leo.control.current).toEqual({ status: 'unknown', muted: [] })
    await leo.control.refresh()
    expect(leo.control.current.status).toBe('unknown')
    // The Notifications page opens: the cloud says notifications are set up.
    await leo.control.refresh(true)
    expect(leo.control.current).toEqual({ status: 'off', muted: [] })
    expect(leo.device.asked).toBe(0)
    expect(cloud.pushSubscriptions()).toEqual([])

    expect(await leo.control.turnOn()).toBeNull()
    expect(leo.device.asked).toBe(1)
    expect(leo.control.current.status).toBe('on')
    expect(cloud.pushSubscriptions()).toEqual([{ endpoint: 'https://push.example.test/leo-phone/1', memberId: hisId, mutedTypes: [] }])
  })

  it('"Served" then reaches him, in words that name her and the dish, and never herself', async () => {
    const leo = notifications(him, 'leo-phone')
    const mia = notifications(her, 'mia-phone')
    await leo.control.turnOn()
    await mia.control.turnOn()

    const meal = await propose(her)
    await change(her, meal.id, { status: 'planned', plannedDate: tomorrow(), plannedSlot: 'dinner' })
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })

    const sent = cloud.sentPushes()
    expect(sent.map((p) => [p.memberId, p.message.type])).toEqual([
      [hisId, 'proposed'],
      [hisId, 'planned'],
      [hisId, 'served'],
    ])
    expect(sent[2]).toMatchObject({
      endpoint: 'https://push.example.test/leo-phone/1',
      urgency: 'high',
      message: { title: 'Served!', body: 'Mia served Älplermagronen. Proof needed!', tag: `meal-${meal.id}`, url: `/review/${meal.id}` },
    })
    expect(sent[1].message.body).toBe('Mia planned Älplermagronen for dinner tomorrow. Bring your appetite.')
    // One meal, one tag: the three replace each other on his phone.
    expect(new Set(sent.map((p) => p.message.tag)).size).toBe(1)
  })

  it('the verdict and her answer travel the other way and back', async () => {
    const leo = notifications(him, 'leo-phone')
    const mia = notifications(her, 'mia-phone')
    await leo.control.turnOn()
    await mia.control.turnOn()
    const meal = await propose(her)
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    await him.engine.sync()

    const at = nowIso()
    const review: Review = { id: newId(), householdId: meal.householdId, servingId: meal.id, dishId: meal.dishId, reviewerId: hisId, reaction: 6, extraReactions: [], overall: null, scores: {}, portionsEaten: 1, wouldEatAgain: null, comment: null, chips: [], chefSelfRating: null, chefReaction: null, chefExtraReactions: [], chefReply: null, sealedAt: null, createdAt: at, updatedAt: at, deletedAt: null }
    await him.store.put('reviews', review)
    await him.engine.sync()
    expect(cloud.sentPushes().map((p) => p.message.type)).toEqual(['proposed', 'served'])

    await change(him, meal.id, { status: 'eaten', eatenAt: nowIso() })
    expect(cloud.sentPushes().at(-1)).toMatchObject({ memberId: herId, message: { type: 'reviewed', title: 'The verdict is in', body: 'Leo ate Älplermagronen and handed in the verdict. Dare to look?', url: `/serving/${meal.id}` } })

    await her.engine.sync()
    await her.store.patch('reviews', review.id, { chefSelfRating: 4 })
    await her.engine.sync()
    expect(cloud.sentPushes()).toHaveLength(3)
    await her.store.patch('reviews', review.id, { chefReaction: 6 })
    await her.engine.sync()
    expect(cloud.sentPushes().at(-1)).toMatchObject({ memberId: hisId, message: { type: 'replied', body: 'Mia reacted to your verdict on Älplermagronen.' } })
    await her.store.patch('reviews', review.id, { chefReply: 'Glad you liked it' })
    await her.engine.sync()
    expect(cloud.sentPushes().at(-1)).toMatchObject({ memberId: hisId, message: { type: 'replied', body: 'Mia answered your verdict on Älplermagronen.' } })
    await her.store.patch('reviews', review.id, { chefReply: 'So glad you liked it', chefReaction: 5 })
    await her.engine.sync()
    expect(cloud.sentPushes()).toHaveLength(5)
  })

  it('ordinary edits send nothing', async () => {
    await notifications(him, 'leo-phone').control.turnOn()
    const meal = await propose(her)
    await change(her, meal.id, { note: 'Extra cheese', priority: 'a1' })
    await him.engine.sync()
    await change(him, meal.id, { craving: 5 })
    await change(her, meal.id, { status: 'planned', plannedDate: tomorrow(), plannedSlot: 'dinner' })
    await change(her, meal.id, { plannedSlot: 'lunch' })
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    await change(her, meal.id, { status: 'planned', servedAt: null })
    expect(cloud.sentPushes().map((p) => p.message.type)).toEqual(['proposed', 'planned', 'served'])
  })

  it('speaks German to a profile that reads German', async () => {
    await notifications(him, 'leo-phone').control.turnOn()
    await him.store.patch('members', hisId, { prefs: { lang: 'de' } })
    await him.engine.sync()
    const meal = await propose(her)
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    expect(bodies()).toEqual(['Mia hat Älplermagronen auf die Wunschliste gesetzt. Wie gross ist die Lust?', 'Mia hat Älplermagronen serviert. Beweisfoto bitte!'])
  })
})

describe('muting', () => {
  it('a muted kind is not sent to that device; the other kinds and the other device still are', async () => {
    const phone = notifications(him, 'leo-phone')
    await phone.control.turnOn()
    const tablet = makePhone(cloud)
    await tablet.adopt(await tablet.backend.signInWithPin('Leo', HIS_PIN))
    const second = notifications(tablet, 'leo-tablet')
    await second.control.turnOn()

    expect(await phone.control.setMuted('proposed', true)).toBe(true)
    expect(phone.control.current.muted).toEqual(['proposed'])
    expect(cloud.pushSubscriptions().find((s) => s.endpoint.includes('leo-phone'))?.mutedTypes).toEqual(['proposed'])

    const meal = await propose(her)
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    expect(cloud.sentPushes().map((p) => [p.endpoint.split('/')[3], p.message.type])).toEqual([
      ['leo-tablet', 'proposed'],
      ['leo-phone', 'served'],
      ['leo-tablet', 'served'],
    ])

    expect(await phone.control.setMuted('proposed', false)).toBe(true)
    expect(cloud.pushSubscriptions().find((s) => s.endpoint.includes('leo-phone'))?.mutedTypes).toEqual([])
  })

  it('a choice made offline is kept on the device and reaches the cloud later', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    him.backend.online = false
    expect(await leo.control.setMuted('planned', true)).toBe(false)
    expect(leo.control.current.muted).toEqual(['planned'])
    expect(cloud.pushSubscriptions()[0].mutedTypes).toEqual([])

    him.backend.online = true
    await leo.control.refresh()
    expect(cloud.pushSubscriptions()[0].mutedTypes).toEqual(['planned'])

    // And it survives closing the app: the next start reads it from the device.
    const again = new PushControl(leo.device, him.backend, leo.notes)
    expect(again.current).toEqual({ status: 'on', muted: ['planned'] })
  })

  it('repairs a row the cloud lost instead of failing', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    cloud.removePushSubscription('nobody', 'https://push.example.test/unknown')
    await him.backend.removePushSubscription('https://push.example.test/leo-phone/1')
    expect(cloud.pushSubscriptions()).toEqual([])

    expect(await leo.control.setMuted('served', true)).toBe(true)
    expect(cloud.pushSubscriptions()).toEqual([{ endpoint: 'https://push.example.test/leo-phone/1', memberId: hisId, mutedTypes: ['served'] }])
  })

  it('muted kinds chosen while off are sent along when notifications are turned on', async () => {
    const leo = notifications(him, 'leo-phone')
    expect(await leo.control.setMuted('replied', true)).toBe(true)
    await leo.control.turnOn()
    expect(cloud.pushSubscriptions()[0].mutedTypes).toEqual(['replied'])
  })
})

describe('when it cannot be turned on', () => {
  it('says "not set up" while the cloud has no key, and switches itself on when there is one', async () => {
    cloud.setPushPublicKey(null)
    const leo = notifications(him, 'leo-phone')
    await leo.control.refresh(true)
    expect(leo.control.current.status).toBe('unconfigured')
    expect(await leo.control.turnOn()).toBe('subscribe_failed')
    expect(leo.device.asked).toBe(0)
    expect(leo.device.held).toBeNull()

    // The owner sets notifications up. The next look at the page offers them.
    cloud.setPushPublicKey(KEY)
    await leo.control.refresh(true)
    expect(leo.control.current.status).toBe('off')
    expect(await leo.control.turnOn()).toBeNull()
    expect(leo.device.madeWith).toBe(KEY)
  })

  it('cannot tell while the cloud has never been reached, and says so instead of guessing', async () => {
    const leo = notifications(him, 'leo-phone')
    him.backend.online = false
    await leo.control.refresh(true)
    expect(leo.control.current.status).toBe('unknown')
    expect(await leo.control.turnOn()).toBe('offline')
    expect(leo.device.asked).toBe(0)

    him.backend.online = true
    expect(await leo.control.turnOn()).toBeNull()
    expect(leo.control.current.status).toBe('on')
  })

  it('remembers the key it last heard of, so an offline start still knows where it stands', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.refresh(true)
    him.backend.online = false
    const nextStart = new PushControl(leo.device, him.backend, leo.notes)
    expect(nextStart.current.status).toBe('off')
    await nextStart.refresh(true)
    expect(nextStart.current.status).toBe('off')
  })

  it('says so when the browser cannot do it', async () => {
    const leo = notifications(him, 'leo-phone')
    leo.device.can = false
    await leo.control.refresh()
    expect(leo.control.current.status).toBe('unsupported')
    expect(await leo.control.turnOn()).toBe('subscribe_failed')
    expect(leo.device.asked).toBe(0)
  })

  it('"Block" is remembered by the browser: no second question, and the page says how to undo it', async () => {
    const leo = notifications(him, 'leo-phone')
    leo.device.answer = 'denied'
    expect(await leo.control.turnOn()).toBe('blocked')
    expect(leo.control.current.status).toBe('blocked')
    expect(await leo.control.turnOn()).toBe('blocked')
    expect(leo.device.asked).toBe(1)
    expect(cloud.pushSubscriptions()).toEqual([])

    // Unblocked in the browser's settings: back to "off", ready for another try.
    leo.device.state = 'default'
    leo.device.answer = 'granted'
    await leo.control.refresh()
    expect(leo.control.current.status).toBe('off')
    expect(await leo.control.turnOn()).toBeNull()
  })

  it('a closed question is not a no', async () => {
    const leo = notifications(him, 'leo-phone')
    leo.device.answer = 'default'
    expect(await leo.control.turnOn()).toBe('dismissed')
    expect(leo.control.current.status).toBe('off')
  })

  it('reports a push service that will not answer', async () => {
    const leo = notifications(him, 'leo-phone')
    leo.device.failSubscribe = true
    expect(await leo.control.turnOn()).toBe('subscribe_failed')
    expect(leo.control.current.status).toBe('off')
    expect(cloud.pushSubscriptions()).toEqual([])
  })

  it('never ends up half on: if the cloud cannot be told, the browser lets go again', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.refresh(true)
    him.backend.online = false
    expect(await leo.control.turnOn()).toBe('offline')
    expect(leo.control.current.status).toBe('off')
    expect(leo.device.held).toBeNull()

    him.backend.online = true
    const stranger = makePhone(cloud)
    const lost = notifications(stranger, 'stranger')
    expect(await lost.control.turnOn()).toBe('refused')
    expect(lost.device.held).toBeNull()
    expect(cloud.pushSubscriptions()).toEqual([])
  })
})

describe('keeping the cloud and the browser in step', () => {
  it('tells the cloud again at every start, which brings back a row it lost', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    await him.backend.removePushSubscription('https://push.example.test/leo-phone/1')

    const nextStart = new PushControl(leo.device, him.backend, leo.notes)
    expect(nextStart.current.status).toBe('on')
    await nextStart.refresh()
    expect(cloud.pushSubscriptions().map((s) => s.endpoint)).toEqual(['https://push.example.test/leo-phone/1'])
    expect(leo.device.asked).toBe(1)
  })

  it('signs up again quietly when the browser dropped its subscription, and retires the old address', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    leo.device.held = null

    await leo.control.refresh()
    expect(leo.control.current.status).toBe('on')
    expect(leo.device.asked).toBe(1)
    expect(cloud.pushSubscriptions().map((s) => s.endpoint)).toEqual(['https://push.example.test/leo-phone/2'])
  })

  it('signs up again when the kitchen got new keys: the old subscription would never ring', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    expect(leo.device.madeWith).toBe(KEY)

    // The owner throws the keys away. Until there are new ones, nothing can be sent.
    cloud.setPushPublicKey(null)
    await leo.control.refresh()
    expect(leo.control.current.status).toBe('unconfigured')

    // The function has made a new pair. The next start of the app picks it up by itself.
    cloud.setPushPublicKey(NEXT_KEY)
    await leo.control.refresh()
    expect(leo.control.current.status).toBe('on')
    expect(leo.device.madeWith).toBe(NEXT_KEY)
    expect(leo.device.asked).toBe(1)
    expect(cloud.pushSubscriptions().map((s) => s.endpoint)).toEqual(['https://push.example.test/leo-phone/2'])
  })

  it('shows "off" when the subscription is gone and cannot be renewed', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    leo.device.held = null
    leo.device.failSubscribe = true
    await leo.control.refresh()
    expect(leo.control.current.status).toBe('off')
  })

  it('shows "blocked" when the permission was taken away in the browser', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    leo.device.state = 'denied'
    await leo.control.refresh()
    expect(leo.control.current.status).toBe('blocked')
  })

  it('a device that never turned notifications on asks the cloud nothing', async () => {
    // (Not even a login may be created for it: the start screen has to stay free of calls.)
    const calls: string[] = []
    const silent = {
      pushPublicKey: async () => {
        calls.push('key')
        return KEY
      },
      savePushSubscription: async () => void calls.push('save'),
      setPushMuted: async () => void calls.push('mute'),
      removePushSubscription: async () => void calls.push('remove'),
    }
    const control = new PushControl(new FakeDevice('new-phone'), silent, memory())
    await control.refresh()
    await control.setMuted('served', true)
    expect(calls).toEqual([])
    expect(control.current).toEqual({ status: 'unknown', muted: ['served'] })

    // Only opening the Notifications page asks, and then only for the key.
    await control.refresh(true)
    expect(calls).toEqual(['key'])
    expect(control.current.status).toBe('off')
  })

  it('tells whoever is listening when something changes, and only then', async () => {
    const leo = notifications(him, 'leo-phone')
    let heard = 0
    const stop = leo.control.subscribe(() => (heard += 1))
    await leo.control.refresh()
    expect(heard).toBe(0)
    await leo.control.refresh(true)
    expect(heard).toBe(1)
    await leo.control.refresh(true)
    expect(heard).toBe(1)
    await leo.control.turnOn()
    expect(heard).toBe(2)
    await leo.control.setMuted('served', true)
    expect(heard).toBe(3)
    stop()
    await leo.control.turnOff()
    expect(heard).toBe(3)
  })
})

describe('turning off and logging out', () => {
  it('"Turn off" removes the row and the browser lets go', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    await leo.control.turnOff()
    expect(leo.control.current.status).toBe('off')
    expect(leo.device.held).toBeNull()
    expect(cloud.pushSubscriptions()).toEqual([])

    const meal = await propose(her)
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    expect(cloud.sentPushes()).toEqual([])
  })

  it('turning off works without a connection too', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    him.backend.online = false
    await leo.control.turnOff()
    expect(leo.control.current.status).toBe('off')
    expect(leo.device.held).toBeNull()
  })

  it('logging a device out removes its subscription', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    // What logOut() in app.ts does, step by step.
    await leo.control.removeFromCloud()
    expect(cloud.pushSubscriptions()).toEqual([])
    await him.backend.signOutDevice()
    await leo.control.forget()
    expect(leo.device.held).toBeNull()
    expect(leo.notes.data.size).toBe(0)
    expect(leo.control.current).toEqual({ status: 'unknown', muted: [] })
  })

  it('the cloud drops it by itself when the device is logged out from elsewhere', async () => {
    await notifications(him, 'leo-phone').control.turnOn()
    const tablet = makePhone(cloud)
    await tablet.adopt(await tablet.backend.signInWithPin('Leo', HIS_PIN))
    await notifications(tablet, 'leo-tablet').control.turnOn()
    expect(cloud.pushSubscriptions()).toHaveLength(2)

    // "Log out my other devices", from the tablet.
    await tablet.backend.signOutOtherDevices()
    expect(cloud.pushSubscriptions().map((s) => s.endpoint)).toEqual(['https://push.example.test/leo-tablet/1'])
    // The admin's "log out everywhere".
    await her.backend.signOutMember(hisId)
    expect(cloud.pushSubscriptions()).toEqual([])

    const meal = await propose(her)
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    expect(cloud.sentPushes()).toEqual([])
  })

  it('a restore code logs the old devices out, notifications included', async () => {
    await notifications(him, 'lost-phone').control.turnOn()
    const invite = await her.backend.createInvite('restore', hisId)
    const fresh = makePhone(cloud)
    await fresh.adopt(await fresh.backend.joinHousehold(invite.code, { name: 'whoever' }, '864209'))
    expect(cloud.pushSubscriptions()).toEqual([])
  })

  it('a paused profile hears nothing, and can change nothing', async () => {
    const leo = notifications(him, 'leo-phone')
    await leo.control.turnOn()
    await her.backend.setMemberPaused(hisId, true)
    const meal = await propose(her)
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    expect(cloud.sentPushes()).toEqual([])
    await expect(him.backend.setPushMuted('https://push.example.test/leo-phone/1', ['served'])).rejects.toMatchObject({ code: 'not_in_kitchen' })

    await her.backend.setMemberPaused(hisId, false)
    await change(her, meal.id, { status: 'planned', servedAt: null })
    await change(her, meal.id, { status: 'served', servedAt: nowIso() })
    expect(bodies()).toEqual(['Mia served Älplermagronen. Proof needed!'])
  })
})

describe("the cloud's rules for subscriptions", () => {
  it('hands the public key to any device with a login, and null while notifications are not set up', async () => {
    expect(await him.backend.pushPublicKey()).toBe(KEY)
    expect(await makePhone(cloud).backend.pushPublicKey()).toBe(KEY)
    cloud.setPushPublicKey(null)
    expect(await him.backend.pushPublicKey()).toBeNull()
    cloud.reset()
    expect(cloud.pushPublicKey('anyone')).toBe(KEY)
  })

  it('only somebody in the kitchen can sign a device up', async () => {
    const stranger = makePhone(cloud)
    await expect(stranger.backend.savePushSubscription(sub('stranger'))).rejects.toMatchObject({ kind: 'rejected', code: 'not_in_kitchen' })
    await expect(stranger.backend.setPushMuted('https://push.example.test/x', [])).rejects.toMatchObject({ code: 'not_in_kitchen' })
    expect(cloud.pushSubscriptions()).toEqual([])
  })

  it('refuses addresses and keys that cannot be real', async () => {
    for (const bad of [{ endpoint: 'http://push.example.test/plain' }, { endpoint: 'javascript:alert(1)' }, { endpoint: `https://push.example.test/${'x'.repeat(2000)}` }, { p256dh: '' }, { auth: '' }, { auth: 'x'.repeat(101) }]) {
      await expect(him.backend.savePushSubscription({ ...sub('leo'), ...bad })).rejects.toMatchObject({ code: 'push_invalid' })
    }
    expect(cloud.pushSubscriptions()).toEqual([])
  })

  it('keeps only kinds that exist, each once, in the usual order', async () => {
    await him.backend.savePushSubscription({ ...sub('leo'), mutedTypes: ['served', 'nonsense', 'proposed', 'served'] as never })
    expect(cloud.pushSubscriptions()[0].mutedTypes).toEqual(['proposed', 'served'])
    await him.backend.setPushMuted(sub('leo').endpoint, [...PUSH_TYPES].reverse())
    expect(cloud.pushSubscriptions()[0].mutedTypes).toEqual([...PUSH_TYPES])
  })

  it('one row per device: a renewed address replaces the old one', async () => {
    await him.backend.savePushSubscription(sub('leo-old'))
    await him.backend.savePushSubscription(sub('leo-new', ['served']))
    expect(cloud.pushSubscriptions()).toEqual([{ endpoint: 'https://push.example.test/leo-new', memberId: hisId, mutedTypes: ['served'] }])
  })

  it('one row per browser: it belongs to whoever is logged in on it now', async () => {
    await him.backend.savePushSubscription(sub('shared-browser'))
    await her.backend.savePushSubscription(sub('shared-browser'))
    expect(cloud.pushSubscriptions()).toEqual([{ endpoint: 'https://push.example.test/shared-browser', memberId: herId, mutedTypes: [] }])
  })

  it('nobody mutes or removes the partner\'s device', async () => {
    await him.backend.savePushSubscription(sub('leo'))
    await expect(her.backend.setPushMuted(sub('leo').endpoint, ['served'])).rejects.toMatchObject({ code: 'push_missing' })
    await her.backend.removePushSubscription(sub('leo').endpoint)
    expect(cloud.pushSubscriptions()).toHaveLength(1)
    // Removing your own works, and removing what is not there is not an error.
    await him.backend.removePushSubscription(sub('leo').endpoint)
    await him.backend.removePushSubscription(sub('leo').endpoint)
    expect(cloud.pushSubscriptions()).toEqual([])
  })

  it('a reset forgets devices and what was sent', async () => {
    await him.backend.savePushSubscription(sub('leo'))
    await propose(her)
    expect(cloud.sentPushes()).toHaveLength(1)
    cloud.reset()
    expect(cloud.sentPushes()).toEqual([])
    expect(cloud.pushSubscriptions()).toEqual([])
  })
})
