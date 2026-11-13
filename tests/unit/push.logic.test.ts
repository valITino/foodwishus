import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUSH_TYPES as APP_TYPES } from '../../src/data/backend'
import {
  audience,
  kitchenDay,
  langOf,
  parseEvent,
  plan,
  PUSH_TYPES,
  reviewEvent,
  routeFor,
  servingEvent,
  whenWords,
  words,
  worthTelling,
  type Answer,
  type Device,
  type Kitchen,
  type Meal,
  type Person,
  type PushEvent,
  type PushType,
} from '../../supabase/functions/push/logic'

// The rules of push notifications: which changes are worth telling, to whom, in which
// words. The Edge Function and the pretend cloud both run exactly this code.

const H = '11111111-1111-4111-8111-111111111111'
const MIA = '22222222-2222-4222-8222-222222222222'
const LEO = '33333333-3333-4333-8333-333333333333'
const MEAL = '0f8fad5b-d9cb-469f-a165-70867728950e'
const REVIEW = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-11-10T17:30:00Z') // Tuesday evening in Zurich

const mia: Person = { id: MIA, name: 'Mia', lang: 'en', paused: false }
const leo: Person = { id: LEO, name: 'Leo', lang: 'en', paused: false }
const device = (memberId: string, name: string, mutedTypes: string[] = []): Device => ({ id: `id-${name}`, memberId, endpoint: `https://push.example.test/${name}`, p256dh: 'p', auth: 'a', mutedTypes })
const meal = (changes: Partial<Meal> = {}): Meal => ({ status: 'served', deleted: false, name: 'Älplermagronen', cookId: MIA, plannedDate: '2026-11-10', plannedSlot: 'dinner', proposedAt: '2026-11-09T10:00:00Z', servedAt: '2026-11-10T17:29:00Z', ...changes })
const event = (type: PushType, actorId = MIA): PushEvent => ({ type, householdId: H, actorId, servingId: MEAL, reviewId: type === 'replied' ? REVIEW : null })
const kitchen = (changes: Partial<Kitchen> = {}): Kitchen => ({ people: [mia, leo], devices: [device(MIA, 'mia-phone'), device(LEO, 'leo-phone')], meal: meal(), answer: null, ...changes })

describe('the list of kinds', () => {
  it('is the same in the app and in the cloud', () => {
    expect([...PUSH_TYPES]).toEqual([...APP_TYPES])
  })

  it('is the same in the database: its checks know exactly these five, and its triggers send no other', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/0007_push.sql'), 'utf8')
    const lists = [...sql.matchAll(/array\['proposed'[^\]]*\]/g)].map(([list]) => [...list.matchAll(/'(\w+)'/g)].map(([, kind]) => kind))
    expect(lists.length).toBeGreaterThanOrEqual(2)
    for (const list of lists) expect(list).toEqual([...PUSH_TYPES])
    // Everything the two trigger functions can hand to send_push.
    const triggers = sql.slice(sql.indexOf('create function private.push_on_serving'), sql.indexOf('create trigger push_new'))
    const sent = new Set([...triggers.matchAll(/then '(\w+)'|send_push\('(\w+)'/g)].map(([, a, b]) => a ?? b))
    expect([...sent].sort()).toEqual([...PUSH_TYPES].sort())
  })
})

describe('reading an event from the database', () => {
  const good = { type: 'served', household_id: H, actor_id: MIA, serving_id: MEAL, review_id: null }

  it('takes what the trigger sends', () => {
    expect(parseEvent(good)).toEqual({ type: 'served', householdId: H, actorId: MIA, servingId: MEAL, reviewId: null })
    expect(parseEvent({ ...good, type: 'replied', review_id: REVIEW })).toEqual({ type: 'replied', householdId: H, actorId: MIA, servingId: MEAL, reviewId: REVIEW })
    // Upper-case ids are the same ids.
    expect(parseEvent({ ...good, serving_id: MEAL.toUpperCase() })?.servingId).toBe(MEAL)
  })

  it('refuses everything else', () => {
    expect(parseEvent(null)).toBeNull()
    expect(parseEvent('served')).toBeNull()
    expect(parseEvent({ ...good, type: 'exploded' })).toBeNull()
    expect(parseEvent({ ...good, actor_id: null })).toBeNull()
    expect(parseEvent({ ...good, household_id: 'not-an-id' })).toBeNull()
    expect(parseEvent({ ...good, serving_id: `${MEAL}&select=*` })).toBeNull()
    // An answer without the verdict it answers.
    expect(parseEvent({ ...good, type: 'replied' })).toBeNull()
    expect(parseEvent({ ...good, type: 'replied', review_id: 'x' })).toBeNull()
  })
})

describe('which changes to a meal are worth an event', () => {
  const at = (status: string, deleted = false) => ({ status, deleted })

  it('a new meal on the wishlist is "proposed"', () => {
    expect(servingEvent(null, at('wishlist'))).toBe('proposed')
    expect(servingEvent(null, at('planned'))).toBe('planned')
    expect(servingEvent(null, at('served'))).toBe('served')
    // History arriving after the fact (an import) is not news.
    expect(servingEvent(null, at('eaten'))).toBeNull()
    expect(servingEvent(null, at('skipped'))).toBeNull()
  })

  it('getting a day is "planned", moving the day is not', () => {
    expect(servingEvent(at('wishlist'), at('planned'))).toBe('planned')
    expect(servingEvent(at('skipped'), at('planned'))).toBe('planned')
    expect(servingEvent(at('planned'), at('planned'))).toBeNull()
  })

  it('"Served" is "served", and taking it back is nothing', () => {
    expect(servingEvent(at('planned'), at('served'))).toBe('served')
    expect(servingEvent(at('wishlist'), at('served'))).toBe('served')
    expect(servingEvent(at('served'), at('planned'))).toBeNull()
    expect(servingEvent(at('eaten'), at('served'))).toBeNull()
  })

  it('turning to eaten is "reviewed", once', () => {
    expect(servingEvent(at('served'), at('eaten'))).toBe('reviewed')
    expect(servingEvent(at('planned'), at('eaten'))).toBe('reviewed')
    expect(servingEvent(at('eaten'), at('eaten'))).toBeNull()
  })

  it('everything else is not an event', () => {
    expect(servingEvent(at('wishlist'), at('wishlist'))).toBeNull()
    expect(servingEvent(at('planned'), at('wishlist'))).toBeNull()
    expect(servingEvent(at('planned'), at('skipped'))).toBeNull()
    expect(servingEvent(at('skipped'), at('wishlist'))).toBeNull()
    expect(servingEvent(at('planned'), at('served', true))).toBeNull()
    expect(servingEvent(null, at('wishlist', true))).toBeNull()
  })
})

describe("which changes to a verdict are the cook's answer", () => {
  const nothing = { reaction: false, reply: false, deleted: false }
  const face = { ...nothing, reaction: true }
  const words_ = { ...nothing, reply: true }
  const both = { ...nothing, reaction: true, reply: true }

  it('a first face or first words count', () => {
    expect(reviewEvent(nothing, face, [])).toBe('replied')
    expect(reviewEvent(nothing, words_, [])).toBe('replied')
    expect(reviewEvent(face, both, [])).toBe('replied')
    expect(reviewEvent(nothing, both, [])).toBe('replied')
  })

  it('changing an answer does not, and neither does taking it away', () => {
    expect(reviewEvent(face, face, [])).toBeNull()
    expect(reviewEvent(both, both, [])).toBeNull()
    expect(reviewEvent(both, face, [])).toBeNull()
    expect(reviewEvent(face, nothing, [])).toBeNull()
  })

  it('a menu gets the same answer on every course: that is one answer', () => {
    // The first course got its face a moment ago; the second and third follow.
    expect(reviewEvent(nothing, face, [nothing, nothing])).toBe('replied')
    expect(reviewEvent(nothing, face, [face, nothing])).toBeNull()
    expect(reviewEvent(nothing, face, [face, face])).toBeNull()
    // Words are their own news, once.
    expect(reviewEvent(face, both, [face, face])).toBe('replied')
    expect(reviewEvent(face, both, [both, face])).toBeNull()
    // A deleted verdict of the same meal does not count as answered.
    expect(reviewEvent(nothing, face, [{ ...face, deleted: true }])).toBe('replied')
  })

  it('a deleted verdict announces nothing', () => {
    expect(reviewEvent(nothing, { ...both, deleted: true }, [])).toBeNull()
  })
})

describe('old news is no news', () => {
  const answer: Answer = { hasReaction: true, hasReply: false, deleted: false }

  it('tells what is still true', () => {
    expect(worthTelling(event('proposed'), meal({ status: 'wishlist' }), null, NOW)).toBe(true)
    expect(worthTelling(event('planned'), meal({ status: 'planned' }), null, NOW)).toBe(true)
    expect(worthTelling(event('served'), meal(), null, NOW)).toBe(true)
    expect(worthTelling(event('reviewed', LEO), meal({ status: 'eaten' }), null, NOW)).toBe(true)
    expect(worthTelling(event('replied'), meal({ status: 'eaten' }), answer, NOW)).toBe(true)
  })

  it('keeps quiet when the meal has moved on, is gone or never existed', () => {
    // Proposed and planned in one go: only the plan is told.
    expect(worthTelling(event('proposed'), meal({ status: 'planned' }), null, NOW)).toBe(false)
    // "Served" was a mis-tap and has been taken back.
    expect(worthTelling(event('served'), meal({ status: 'planned' }), null, NOW)).toBe(false)
    expect(worthTelling(event('planned'), meal({ status: 'wishlist' }), null, NOW)).toBe(false)
    expect(worthTelling(event('reviewed'), meal({ status: 'served' }), null, NOW)).toBe(false)
    expect(worthTelling(event('served'), meal({ deleted: true }), null, NOW)).toBe(false)
    expect(worthTelling(event('served'), null, null, NOW)).toBe(false)
  })

  it('keeps quiet about things a phone sent days late', () => {
    expect(worthTelling(event('served'), meal({ servedAt: '2026-11-09T23:00:00Z' }), null, NOW)).toBe(false)
    expect(worthTelling(event('served'), meal({ servedAt: '2026-11-10T06:00:00Z' }), null, NOW)).toBe(true)
    expect(worthTelling(event('proposed'), meal({ status: 'wishlist', proposedAt: '2026-11-07T10:00:00Z' }), null, NOW)).toBe(false)
    // A day that has passed is not a plan any more. Today still is.
    expect(worthTelling(event('planned'), meal({ status: 'planned', plannedDate: '2026-11-09' }), null, NOW)).toBe(false)
    expect(worthTelling(event('planned'), meal({ status: 'planned', plannedDate: '2026-11-10' }), null, NOW)).toBe(true)
    expect(worthTelling(event('planned'), meal({ status: 'planned', plannedDate: null }), null, NOW)).toBe(false)
  })

  it('an answer needs something in it', () => {
    expect(worthTelling(event('replied'), meal({ status: 'eaten' }), null, NOW)).toBe(false)
    expect(worthTelling(event('replied'), meal({ status: 'eaten' }), { hasReaction: false, hasReply: false, deleted: false }, NOW)).toBe(false)
    expect(worthTelling(event('replied'), meal({ status: 'eaten' }), { ...answer, deleted: true }, NOW)).toBe(false)
  })

  it('knows which day it is in the kitchen, not in Greenwich', () => {
    expect(kitchenDay(new Date('2026-11-10T22:59:00Z'))).toBe('2026-11-10')
    expect(kitchenDay(new Date('2026-11-10T23:00:00Z'))).toBe('2026-11-11')
    expect(kitchenDay(new Date('2026-07-10T21:59:00Z'))).toBe('2026-07-10')
    expect(kitchenDay(new Date('2026-07-10T22:00:00Z'))).toBe('2026-07-11')
  })
})

describe('who gets told', () => {
  it('the other person, on each of their devices, and never the one who did it', () => {
    const devices = [device(MIA, 'mia-phone'), device(LEO, 'leo-phone'), device(LEO, 'leo-tablet')]
    expect(audience(event('served'), [mia, leo], devices).map((a) => a.device.endpoint)).toEqual(['https://push.example.test/leo-phone', 'https://push.example.test/leo-tablet'])
    expect(audience(event('reviewed', LEO), [mia, leo], devices).map((a) => a.device.endpoint)).toEqual(['https://push.example.test/mia-phone'])
  })

  it('not a device that muted this kind, not a paused profile, not a device of nobody', () => {
    const devices = [device(LEO, 'leo-phone', ['served']), device(LEO, 'leo-tablet', ['planned']), device('someone-else', 'stray')]
    expect(audience(event('served'), [mia, leo], devices).map((a) => a.device.id)).toEqual(['id-leo-tablet'])
    expect(audience(event('planned'), [mia, leo], devices).map((a) => a.device.id)).toEqual(['id-leo-phone'])
    expect(audience(event('served'), [mia, { ...leo, paused: true }], devices)).toEqual([])
  })

  it('one device, one notification, even if the list names it twice', () => {
    expect(audience(event('served'), [mia, leo], [device(LEO, 'leo-phone'), device(LEO, 'leo-phone')])).toHaveLength(1)
  })

  it('reads the language off the profile, English unless it says German', () => {
    expect(langOf({ lang: 'de' })).toBe('de')
    expect(langOf({ lang: 'en' })).toBe('en')
    expect(langOf({ lang: 'fr' })).toBe('en')
    expect(langOf({})).toBe('en')
    expect(langOf(null)).toBe('en')
  })
})

describe('the words', () => {
  const facts = { actor: 'Mia', dish: 'Älplermagronen', readerCooks: false, when: '', hasReply: true }

  it('"Served" names the person and the dish', () => {
    expect(words('served', 'en', facts)).toEqual({ title: 'Served!', body: 'Mia served Älplermagronen. Proof needed!' })
    expect(words('served', 'de', facts)).toEqual({ title: 'Serviert!', body: 'Mia hat Älplermagronen serviert. Beweisfoto bitte!' })
  })

  it('says when a meal is planned', () => {
    expect(whenWords('2026-11-10', 'dinner', '2026-11-10', 'en')).toBe('for dinner today')
    expect(whenWords('2026-11-11', 'lunch', '2026-11-10', 'en')).toBe('for lunch tomorrow')
    expect(whenWords('2026-11-13', 'dinner', '2026-11-10', 'en')).toBe('for dinner on Friday')
    expect(whenWords('2026-11-24', 'breakfast', '2026-11-10', 'en')).toBe('for breakfast on 24 November')
    expect(whenWords('2026-11-13', null, '2026-11-10', 'en')).toBe('for Friday')
    expect(whenWords('2026-11-10', 'dinner', '2026-11-10', 'de')).toBe('für heute zum Abendessen')
    expect(whenWords('2026-11-11', 'dessert', '2026-11-10', 'de')).toBe('für morgen zum Dessert')
    expect(whenWords('2026-11-13', 'dinner', '2026-11-10', 'de')).toBe('für Freitag zum Abendessen')
    expect(whenWords('2026-11-24', 'lunch', '2026-11-10', 'de')).toBe('für den 24. November zum Mittagessen')
    expect(whenWords(null, 'dinner', '2026-11-10', 'en')).toBe('')
    expect(whenWords('soon', 'dinner', '2026-11-10', 'en')).toBe('')

    expect(words('planned', 'en', { ...facts, when: 'for dinner on Friday' }).body).toBe('Mia planned Älplermagronen for dinner on Friday. Bring your appetite.')
    expect(words('planned', 'de', { ...facts, when: 'für Freitag zum Abendessen' }).body).toBe('Mia hat Älplermagronen für Freitag zum Abendessen eingeplant. Bring Hunger mit.')
    expect(words('planned', 'en', { ...facts, when: '' }).body).toBe('Mia planned Älplermagronen. Bring your appetite.')
  })

  it('speaks to the cook differently than to the eater', () => {
    expect(words('proposed', 'en', facts).body).toBe('Mia put Älplermagronen on the wishlist. How much do you want it?')
    expect(words('proposed', 'en', { ...facts, actor: 'Leo', readerCooks: true }).body).toBe('Leo wishes for Älplermagronen. Your move.')
    expect(words('proposed', 'de', { ...facts, actor: 'Leo', readerCooks: true }).body).toBe('Leo wünscht sich Älplermagronen. Du bist dran.')
    expect(words('planned', 'en', { ...facts, actor: 'Leo', readerCooks: true, when: 'for dinner tomorrow' }).body).toBe('Leo planned Älplermagronen for dinner tomorrow. Apron ready?')
  })

  it('tells a face from words in the answer', () => {
    expect(words('replied', 'en', facts).body).toBe('Mia answered your verdict on Älplermagronen.')
    expect(words('replied', 'en', { ...facts, hasReply: false }).body).toBe('Mia reacted to your verdict on Älplermagronen.')
    expect(words('replied', 'de', facts).body).toBe('Mia hat auf dein Urteil zu Älplermagronen geantwortet.')
    expect(words('reviewed', 'en', { ...facts, actor: 'Leo' })).toEqual({ title: 'The verdict is in', body: 'Leo ate Älplermagronen and handed in the verdict. Dare to look?' })
  })

  it('has something to say when the dish or the name is gone', () => {
    expect(words('served', 'en', { ...facts, dish: null, actor: ' ' }).body).toBe('Someone served something delicious. Proof needed!')
    expect(words('served', 'de', { ...facts, dish: '', actor: '' }).body).toBe('Jemand hat etwas Feines serviert. Beweisfoto bitte!')
  })

  it('follows the house rules in both languages: short, no em dashes, no arrows, Swiss spelling', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const type of PUSH_TYPES) {
        for (const readerCooks of [true, false]) {
          for (const hasReply of [true, false]) {
            const { title, body } = words(type, lang, { ...facts, readerCooks, hasReply, when: whenWords('2026-11-13', 'dinner', '2026-11-10', lang) })
            const all = `${title} ${body}`
            expect(all, all).not.toMatch(/[—–→·ß]/)
            expect(title.length, title).toBeLessThanOrEqual(30)
            expect(body.length, body).toBeLessThanOrEqual(120)
            expect(body, body).toContain('Älplermagronen')
            expect(body, body).toContain('Mia')
            // Sentence case: no shouting, no Title Case Like This.
            expect(title, title).not.toMatch(/[A-ZÄÖÜ]{3,}/)
          }
        }
      }
    }
  })
})

describe('from one event to the messages', () => {
  it('"Served" reaches the eater once, urgently, and opens the camera', () => {
    const out = plan(event('served'), kitchen(), NOW)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      device: device(LEO, 'leo-phone'),
      message: { type: 'served', title: 'Served!', body: 'Mia served Älplermagronen. Proof needed!', tag: `meal-${MEAL}`, url: `/review/${MEAL}` },
      urgency: 'high',
      topic: '0f8fad5bd9cb469fa16570867728950e',
      ttl: 6 * 3600,
    })
  })

  it('"Served" is not for the cook: a meal the eater put on the table himself asks nobody for proof', () => {
    // Leo logged a meal Mia cooked, or took his photo before anything else.
    expect(plan(event('served', LEO), kitchen(), NOW)).toEqual([])
    // The other way round it is the usual call for proof.
    expect(plan(event('served', LEO), kitchen({ meal: meal({ cookId: LEO }) }), NOW).map((d) => [d.device.memberId, d.message.body])).toEqual([[MIA, 'Leo served Älplermagronen. Proof needed!']])
    // His verdict still reaches her.
    expect(plan(event('reviewed', LEO), kitchen({ meal: meal({ status: 'eaten' }) }), NOW).map((d) => d.device.memberId)).toEqual([MIA])
  })

  it('everything else opens the meal page and can wait a moment', () => {
    const planned = plan(event('planned'), kitchen({ meal: meal({ status: 'planned', plannedDate: '2026-11-13' }) }), NOW)
    expect(planned.map((d) => [d.message.url, d.urgency, d.message.body])).toEqual([[`/serving/${MEAL}`, 'normal', 'Mia planned Älplermagronen for dinner on Friday. Bring your appetite.']])
    const reviewed = plan(event('reviewed', LEO), kitchen({ meal: meal({ status: 'eaten' }) }), NOW)
    expect(reviewed.map((d) => [d.device.memberId, d.message.url, d.message.title])).toEqual([[MIA, `/serving/${MEAL}`, 'The verdict is in']])
    expect(routeFor('served', MEAL, true)).toBe(`/serving/${MEAL}`)
  })

  it('every reader gets their own language', () => {
    const out = plan(event('served'), kitchen({ people: [mia, { ...leo, lang: 'de' }], devices: [device(LEO, 'leo-phone'), device(LEO, 'leo-tablet')] }), NOW)
    expect(out.map((d) => d.message.body)).toEqual(['Mia hat Älplermagronen serviert. Beweisfoto bitte!', 'Mia hat Älplermagronen serviert. Beweisfoto bitte!'])
    expect(new Set(out.map((d) => d.message.tag)).size).toBe(1)
  })

  it('the answer names the meal and tells a face from words', () => {
    const base = { meal: meal({ status: 'eaten', name: 'Sunday roast' }) }
    expect(plan(event('replied'), kitchen({ ...base, answer: { hasReaction: true, hasReply: false, deleted: false } }), NOW)[0].message.body).toBe('Mia reacted to your verdict on Sunday roast.')
    expect(plan(event('replied'), kitchen({ ...base, answer: { hasReaction: true, hasReply: true, deleted: false } }), NOW)[0].message.body).toBe('Mia answered your verdict on Sunday roast.')
  })

  it('sends nothing when there is nothing to say or nobody to say it to', () => {
    expect(plan(event('served'), kitchen({ meal: meal({ status: 'planned' }) }), NOW)).toEqual([])
    expect(plan(event('served'), kitchen({ meal: null }), NOW)).toEqual([])
    expect(plan(event('served'), kitchen({ devices: [device(MIA, 'mia-phone')] }), NOW)).toEqual([])
    expect(plan(event('served'), kitchen({ devices: [device(LEO, 'leo-phone', ['served'])] }), NOW)).toEqual([])
    // Somebody who does not sit in this kitchen cannot announce anything in it.
    expect(plan(event('served', '99999999-9999-4999-8999-999999999999'), kitchen(), NOW)).toEqual([])
  })

  it('fits into one push message with room to spare', () => {
    const long = 'Ü'.repeat(120)
    const [delivery] = plan(event('planned'), kitchen({ people: [{ ...mia, name: 'M'.repeat(40) }, { ...leo, lang: 'de' }], meal: meal({ status: 'planned', name: long, plannedDate: '2026-11-24' }) }), NOW)
    expect(new TextEncoder().encode(JSON.stringify(delivery.message)).length).toBeLessThan(1000)
  })
})
