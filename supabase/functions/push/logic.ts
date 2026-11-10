// The thinking behind push notifications, free of Deno, the database and the network,
// so every rule can be unit-tested (tests/unit/push.logic.test.ts):
//
//   - which changes are worth an event (the triggers in 0007_push.sql decide the same
//     way; the pretend cloud in src/data/fake uses these functions directly),
//   - whether an event is still true by the time it is handled,
//   - who gets told (the other person, on the devices that did not mute this kind),
//   - the words, in the language of whoever reads them.
//
// This file must stay self-contained: the function is deployed from this folder alone.

export const PUSH_TYPES = ['proposed', 'planned', 'served', 'reviewed', 'replied'] as const
/**
 * proposed: a dish or menu was put on the wishlist.   planned: a meal got its day.
 * served: "Served, proof needed!"   reviewed: the verdict was handed in.
 * replied: the cook answered the verdict.
 */
export type PushType = (typeof PUSH_TYPES)[number]
export type Lang = 'en' | 'de'

export const isPushType = (value: unknown): value is PushType => PUSH_TYPES.includes(value as PushType)

// ------------------------------------------------------------------ events --

/** One thing that happened in the kitchen. Sent by the database, read by the function. */
export interface PushEvent {
  type: PushType
  householdId: string
  /** The member who did it. They are never told about it themselves. */
  actorId: string
  /** The meal it is about. */
  servingId: string
  /** "replied" only: the verdict that was answered. */
  reviewId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (value: unknown): string | null => (typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null)

/** Read what the database trigger sent. Null when it is not an event we know. */
export function parseEvent(body: unknown): PushEvent | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = body as Record<string, unknown>
  const householdId = uuid(raw.household_id)
  const actorId = uuid(raw.actor_id)
  const servingId = uuid(raw.serving_id)
  const reviewId = raw.review_id == null ? null : uuid(raw.review_id)
  if (!isPushType(raw.type) || !householdId || !actorId || !servingId) return null
  if (raw.type === 'replied' && !reviewId) return null
  return { type: raw.type, householdId, actorId, servingId, reviewId: raw.type === 'replied' ? reviewId : null }
}

// ------------------------------------------------------- which events fire --

export interface MealChange {
  status: string
  deleted: boolean
}

/**
 * What a change to a meal is worth telling, if anything. `before` is null for a new row.
 * Editing a note, a craving or the order is never an event; neither is taking a mis-tapped
 * "Served" back, or moving a planned meal to another day.
 */
export function servingEvent(before: MealChange | null, after: MealChange): PushType | null {
  if (after.deleted) return null
  if (!before) {
    if (after.status === 'wishlist') return 'proposed'
    return after.status === 'planned' || after.status === 'served' ? after.status : null
  }
  if (before.status === after.status) return null
  if (after.status === 'planned') return before.status === 'wishlist' || before.status === 'skipped' ? 'planned' : null
  if (after.status === 'served') return before.status === 'eaten' ? null : 'served'
  if (after.status === 'eaten') return 'reviewed'
  return null
}

export interface AnswerChange {
  /** The cook picked a face. */
  reaction: boolean
  /** The cook wrote a few words. */
  reply: boolean
  deleted: boolean
}

/**
 * Whether a change to a verdict is the cook's answer arriving: a face or words where
 * there were none. `others` are the other verdicts of the same meal. A menu gets the same
 * answer on every course, and that is one answer, not one per course.
 */
export function reviewEvent(before: AnswerChange, after: AnswerChange, others: readonly AnswerChange[]): PushType | null {
  if (after.deleted) return null
  const rest = others.filter((other) => !other.deleted)
  const face = !before.reaction && after.reaction && !rest.some((other) => other.reaction)
  const words = !before.reply && after.reply && !rest.some((other) => other.reply)
  return face || words ? 'replied' : null
}

// ------------------------------------------------------------ still true? --

/** A meal as far as a notification cares. */
export interface Meal {
  status: string
  deleted: boolean
  /** The dish's or the menu's name. Null when it has been deleted. */
  name: string | null
  /** Who cooks it. */
  cookId: string | null
  /** "2026-11-13" */
  plannedDate: string | null
  plannedSlot: string | null
  proposedAt: string | null
  servedAt: string | null
}

/** The cook's answer to one verdict. */
export interface Answer {
  hasReaction: boolean
  hasReply: boolean
  deleted: boolean
}

const HOUR = 3_600_000
const ZURICH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The calendar day in the kitchen's time zone: "2026-11-13". */
export const kitchenDay = (now: Date): string => ZURICH_DAY.format(now)

const within = (at: string | null, ms: number, now: Date): boolean => at === null || Number.isNaN(Date.parse(at)) || now.getTime() - Date.parse(at) <= ms

/**
 * Events arrive a moment after the change, sometimes much later (a phone that was offline
 * for days sends everything at once). Old news is not worth a notification:
 * "Proof needed!" for last week's dinner helps nobody.
 */
export function worthTelling(event: PushEvent, meal: Meal | null, answer: Answer | null, now: Date): boolean {
  if (!meal || meal.deleted) return false
  switch (event.type) {
    case 'proposed':
      return meal.status === 'wishlist' && within(meal.proposedAt, 48 * HOUR, now)
    case 'planned':
      return meal.status === 'planned' && meal.plannedDate !== null && meal.plannedDate >= kitchenDay(now)
    case 'served':
      return meal.status === 'served' && within(meal.servedAt, 12 * HOUR, now)
    case 'reviewed':
      return meal.status === 'eaten'
    case 'replied':
      return answer !== null && !answer.deleted && (answer.hasReaction || answer.hasReply)
  }
}

// ----------------------------------------------------------- who gets told --

export interface Person {
  id: string
  name: string
  lang: Lang
  /** The admin has paused this profile: it hears nothing. */
  paused: boolean
}

/** One device that asked for notifications. */
export interface Device {
  id: string
  memberId: string
  endpoint: string
  p256dh: string
  auth: string
  mutedTypes: readonly string[]
}

/** The language a profile reads in. English unless it says German. */
export const langOf = (prefs: unknown): Lang => ((prefs as { lang?: unknown } | null)?.lang === 'de' ? 'de' : 'en')

/** Everybody but the one who did it, on every device that did not mute this kind of news. */
export function audience(event: PushEvent, people: readonly Person[], devices: readonly Device[]): { person: Person; device: Device }[] {
  const listening = people.filter((person) => person.id !== event.actorId && !person.paused)
  const seen = new Set<string>()
  const out: { person: Person; device: Device }[] = []
  for (const device of devices) {
    const person = listening.find((p) => p.id === device.memberId)
    if (!person || device.mutedTypes.includes(event.type) || seen.has(device.endpoint)) continue
    seen.add(device.endpoint)
    out.push({ person, device })
  }
  return out
}

// --------------------------------------------------------------- the words --

const SLOTS: Record<Lang, Record<string, string>> = {
  en: { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', dessert: 'dessert' },
  de: { breakfast: 'zum Frühstück', lunch: 'zum Mittagessen', dinner: 'zum Abendessen', dessert: 'zum Dessert' },
}

/** "for dinner tomorrow", "für Freitag zum Abendessen". Empty when the day is unknown. */
export function whenWords(plannedDate: string | null, plannedSlot: string | null, today: string, lang: Lang): string {
  const noon = plannedDate ? Date.parse(`${plannedDate}T12:00:00Z`) : Number.NaN
  if (Number.isNaN(noon)) return ''
  const away = Math.round((noon - Date.parse(`${today}T12:00:00Z`)) / (24 * HOUR))
  const slot = plannedSlot ? SLOTS[lang][plannedSlot] : undefined
  const locale = lang === 'de' ? 'de-CH' : 'en-GB'
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(noon)
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(noon)
  const soon = away > 1 && away < 7
  if (lang === 'de') {
    const day = away === 0 ? 'heute' : away === 1 ? 'morgen' : soon ? weekday : `den ${dayMonth}`
    return `für ${day}${slot ? ` ${slot}` : ''}`
  }
  const on = away === 0 ? 'today' : away === 1 ? 'tomorrow' : soon ? weekday : dayMonth
  // "for dinner today", but "for dinner on Friday".
  const link = away === 0 || away === 1 ? ' ' : ' on '
  return slot ? `for ${slot}${link}${on}` : `for ${on}`
}

export interface Facts {
  /** Who did it. */
  actor: string
  /** The dish or menu. Null when it is gone. */
  dish: string | null
  /** True when the reader is the one who cooks this meal. */
  readerCooks: boolean
  /** planned: from whenWords(). */
  when: string
  /** replied: true when there are words, false when it is only a face. */
  hasReply: boolean
}

/** Title and body, short enough for a lock screen. No em dashes, no arrows. */
export function words(type: PushType, lang: Lang, facts: Facts): { title: string; body: string } {
  const who = facts.actor.trim() || (lang === 'de' ? 'Jemand' : 'Someone')
  const dish = facts.dish?.trim() || (lang === 'de' ? 'etwas Feines' : 'something delicious')
  if (lang === 'de') {
    switch (type) {
      case 'proposed':
        return facts.readerCooks
          ? { title: 'Ein Wunsch an die Küche', body: `${who} wünscht sich ${dish}. Du bist dran.` }
          : { title: 'Neu auf der Wunschliste', body: `${who} hat ${dish} auf die Wunschliste gesetzt. Wie gross ist die Lust?` }
      case 'planned':
        return { title: 'Abgemacht', body: `${who} hat ${dish}${facts.when ? ` ${facts.when}` : ''} eingeplant. ${facts.readerCooks ? 'Schürze bereit?' : 'Bring Hunger mit.'}` }
      case 'served':
        return { title: 'Serviert!', body: `${who} hat ${dish} serviert. Beweisfoto bitte!` }
      case 'reviewed':
        return { title: 'Das Urteil ist da', body: `${who} hat ${dish} gegessen und das Urteil abgegeben. Traust du dich?` }
      case 'replied':
        return { title: 'Antwort aus der Küche', body: facts.hasReply ? `${who} hat auf dein Urteil zu ${dish} geantwortet.` : `${who} hat auf dein Urteil zu ${dish} reagiert.` }
    }
  }
  switch (type) {
    case 'proposed':
      return facts.readerCooks
        ? { title: 'A wish for the kitchen', body: `${who} wishes for ${dish}. Your move.` }
        : { title: 'New on the wishlist', body: `${who} put ${dish} on the wishlist. How much do you want it?` }
    case 'planned':
      return { title: "It's a date", body: `${who} planned ${dish}${facts.when ? ` ${facts.when}` : ''}. ${facts.readerCooks ? 'Apron ready?' : 'Bring your appetite.'}` }
    case 'served':
      return { title: 'Served!', body: `${who} served ${dish}. Proof needed!` }
    case 'reviewed':
      return { title: 'The verdict is in', body: `${who} ate ${dish} and handed in the verdict. Dare to look?` }
    case 'replied':
      return { title: 'An answer from the kitchen', body: facts.hasReply ? `${who} answered your verdict on ${dish}.` : `${who} reacted to your verdict on ${dish}.` }
  }
}

// ------------------------------------------------------------- the message --

/** What travels to the phone. The service worker (src/sw/notify.ts) turns it into a notification. */
export interface PushMessage {
  type: PushType
  title: string
  body: string
  /** One per meal: a newer notification about the same meal replaces the older one. */
  tag: string
  /** The page a tap opens, as an in-app route. */
  url: string
}

export interface Delivery {
  device: Device
  message: PushMessage
  /** "high" wakes a sleeping phone at once. Only "Served" is that urgent. */
  urgency: 'normal' | 'high'
  /** Push services keep only the newest waiting message per topic: one per meal. */
  topic: string
  /** How long the push service keeps trying to deliver, in seconds. */
  ttl: number
}

const TTL_HOURS: Record<PushType, number> = { proposed: 48, planned: 24, served: 6, reviewed: 48, replied: 48 }

/** The page a tap opens. "Served" goes straight to the camera for whoever eats. */
export function routeFor(type: PushType, servingId: string, readerCooks: boolean): string {
  return type === 'served' && !readerCooks ? `/review/${servingId}` : `/serving/${servingId}`
}

/** Everything the function looked up about the kitchen for one event. */
export interface Kitchen {
  people: readonly Person[]
  devices: readonly Device[]
  meal: Meal | null
  answer: Answer | null
}

/**
 * From one event to the messages to send: none when the news is stale or nobody listens,
 * otherwise exactly one per device of the other person.
 */
export function plan(event: PushEvent, kitchen: Kitchen, now: Date): Delivery[] {
  const actor = kitchen.people.find((person) => person.id === event.actorId)
  // An event about a kitchen the actor does not sit in is not ours to announce.
  if (!actor) return []
  const { meal, answer } = kitchen
  if (!meal || !worthTelling(event, meal, answer, now)) return []

  return audience(event, kitchen.people, kitchen.devices).map(({ person, device }) => {
    const readerCooks = meal.cookId === person.id
    const said = words(event.type, person.lang, {
      actor: actor.name,
      dish: meal.name,
      readerCooks,
      when: whenWords(meal.plannedDate, meal.plannedSlot, kitchenDay(now), person.lang),
      hasReply: answer?.hasReply ?? false,
    })
    return {
      device,
      message: { type: event.type, ...said, tag: `meal-${event.servingId}`, url: routeFor(event.type, event.servingId, readerCooks) },
      urgency: event.type === 'served' ? 'high' : 'normal',
      topic: event.servingId.replaceAll('-', ''),
      ttl: TTL_HOURS[event.type] * 3600,
    }
  })
}
