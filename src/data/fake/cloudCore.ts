// A pretend cloud that behaves like the real database: one kitchen, two seats, the same
// pairing rules and error codes, the same "server clock stamps every write" behaviour.
// Tests and local development run against it, because they must never touch real data.
// Keep its rules in step with supabase/migrations.

import { langOf, plan, reviewEvent, servingEvent, type AnswerChange, type Delivery, type PushEvent } from '../../../supabase/functions/push/logic.ts'
import { BackendError, PUSH_TYPES, type BackendErrorDetails, type Invite, type InvitePeek, type Membership, type PersonCard, type ProfileInput, type PullResult, type PushOp, type PushSubscriptionInput, type PushType } from '../backend.ts'
import { lockMinutes, nameKey, PIN_TRIES, pinProblem } from '../pin.ts'
import { SYNC_TABLES, WRITABLE_TABLES, type ID, type ISO, type Role, type SyncTable } from '../types.ts'
import { DAILY_TICKETS, type HelperAnswer } from '../../../supabase/functions/ai/contract.ts'
import { helperHandler } from '../../../supabase/functions/ai/handler.ts'
import { pretendFetch, pretendHelper } from './pretendWeb.ts'

type Row = Record<string, unknown> & { id: ID }

interface MemberRow extends Row {
  householdId: ID
  name: string
  avatar: string
  color: string
  accessory: string | null
  status: string | null
  defaultRole: Role
  prefs: Record<string, unknown>
  isAdmin: boolean
  disabledAt: ISO | null
  createdAt: ISO
  updatedAt: ISO
  deletedAt: ISO | null
}

interface InviteRow {
  code: string
  householdId: ID
  kind: 'join' | 'restore'
  memberId: ID | null
  createdBy: ID
  expiresAt: number
  usedAt: number | null
}

interface Attempts {
  failed: number
  lockouts: number
  lockedUntil: number
  lastAttempt: number
}

/** One device that asked for notifications (public.push_subscriptions). */
interface PushRow {
  id: ID
  householdId: ID
  memberId: ID
  /** The login (device) that saved it. Logging that device out removes the row. */
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  mutedTypes: PushType[]
  userAgent: string | null
}

/**
 * A notification the pretend cloud would have sent. The real cloud hands it to the
 * browser's push service; here tests read the list instead of a phone's lock screen.
 */
export interface SentPush extends Omit<Delivery, 'device'> {
  endpoint: string
  memberId: ID
}

/**
 * The public key the pretend cloud hands to browsers that want to sign up: the example
 * key from RFC 8292. Nothing is ever sent with it.
 */
export const TEST_PUSH_KEY = 'BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEFAULT_CRITERIA: [string, string][] = [
  ['Taste', 'tongue'],
  ['Texture', 'layers'],
  ['Smell', 'steam'],
  ['Looks', 'sparkle'],
  ['Portion', 'plate'],
  ['Temperature', 'flame'],
]
const PROFILE_FIELDS = ['name', 'avatar', 'color', 'defaultRole', 'status', 'accessory', 'prefs']

const reject = (code: string, details?: BackendErrorDetails): never => {
  throw new BackendError('rejected', code, undefined, details)
}

const card = (m: MemberRow | undefined): PersonCard | null =>
  m ? { name: m.name, avatar: m.avatar, color: m.color, accessory: m.accessory, defaultRole: m.defaultRole } : null

export class FakeCloud {
  private tables = new Map<SyncTable, Map<ID, Row>>()
  private invites = new Map<string, InviteRow>()
  /** Which profile each login (one per device) belongs to. One profile can have many. */
  private devices = new Map<string, ID>()
  private pins = new Map<ID, string>()
  /** Wrong PIN tries, counted per typed name, whether or not that name exists. */
  private attempts = new Map<string, Attempts>()
  private blobs = new Map<string, { bytes: Uint8Array; type: string }>()
  /** Devices that asked for notifications, by the address of their push service. */
  private pushRows = new Map<string, PushRow>()
  private sent: SentPush[] = []
  /** private.push_config.vapid_public: null while notifications are not set up. */
  private pushKey: string | null = TEST_PUSH_KEY
  /** private.helper_tickets: how many readings each kitchen has used on which day. */
  private helperTickets = new Map<string, number>()
  /** Test hook: where every kitchen's count for today starts. */
  private helperUsed = 0
  /** The function's secret ANTHROPIC_API_KEY: null while the owner has not set one. */
  private helperKey: string | null = 'pretend-key'
  /** True while the pretend Claude API is having an outage. */
  private helperDown = false
  private listeners = new Set<(householdId: ID) => void>()
  private clock = 0

  constructor() {
    this.reset()
  }

  reset(): void {
    this.tables.clear()
    for (const t of SYNC_TABLES) this.tables.set(t, new Map())
    this.invites.clear()
    this.devices.clear()
    this.pins.clear()
    this.attempts.clear()
    this.blobs.clear()
    this.pushRows.clear()
    this.sent = []
    this.pushKey = TEST_PUSH_KEY
    this.helperTickets.clear()
    this.helperUsed = 0
    this.helperKey = 'pretend-key'
    this.helperDown = false
  }

  /** A strictly increasing server clock, like clock_timestamp() in Postgres. */
  private now(): ISO {
    this.clock = Math.max(this.clock + 1, Date.now())
    return new Date(this.clock).toISOString()
  }

  private id(): ID {
    return crypto.randomUUID()
  }

  private code(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length))
    return Array.from(bytes, (b) => ALPHABET[b % 32]).join('')
  }

  private table(name: SyncTable): Map<ID, Row> {
    return this.tables.get(name) as Map<ID, Row>
  }

  private members(): MemberRow[] {
    return [...this.table('members').values()] as MemberRow[]
  }

  /** The profile this login belongs to, paused or not. */
  private seatOf(userId: string): MemberRow | undefined {
    const memberId = this.devices.get(userId)
    return memberId ? this.members().find((m) => m.id === memberId && !m.deletedAt) : undefined
  }

  /** The profile this login may act as: logged in and not paused. */
  private memberOf(userId: string): MemberRow | undefined {
    const seat = this.seatOf(userId)
    return seat && !seat.disabledAt ? seat : undefined
  }

  private admin(userId: string): MemberRow {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    return me.isAdmin ? me : reject('admin_only')
  }

  private seats(householdId: ID): MemberRow[] {
    return this.members().filter((m) => m.householdId === householdId && !m.deletedAt)
  }

  private touch(member: MemberRow): void {
    member.updatedAt = this.now()
    this.emit(member.householdId)
  }

  private checkPin(pin: string): void {
    const problem = pinProblem(pin)
    if (problem) reject(problem)
  }

  private emit(householdId: ID): void {
    for (const fn of this.listeners) fn(householdId)
  }

  // ----------------------------------------------------------------- pairing --

  signIn(): string {
    return this.id()
  }

  membership(userId: string): Membership | null {
    const me = this.seatOf(userId)
    if (!me) return null
    return me.disabledAt ? { householdId: me.householdId, memberId: me.id, paused: true } : { householdId: me.householdId, memberId: me.id }
  }

  kitchenExists(_userId: string): boolean {
    return [...this.table('households').values()].some((h) => !h.deletedAt)
  }

  createHousehold(userId: string, name: string, me: ProfileInput, pin: string): Membership {
    if (this.seatOf(userId)) reject('already_in_kitchen')
    this.checkPin(pin)
    if (this.kitchenExists(userId)) reject('kitchen_already_exists')

    const at = this.now()
    const householdId = this.id()
    this.table('households').set(householdId, {
      id: householdId,
      name: name.trim() || 'Our kitchen',
      settings: {},
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    })
    // Whoever opens the kitchen is its admin.
    const memberId = this.addMember(householdId, { avatar: 'whisk', color: 'rose', defaultRole: 'chef', ...me }, 'Chef', true)
    DEFAULT_CRITERIA.forEach(([label, icon], sortOrder) => {
      const id = this.id()
      this.table('criteria').set(id, {
        id,
        householdId,
        label,
        icon,
        active: true,
        sortOrder,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      })
    })
    this.pins.set(memberId, pin)
    this.devices.set(userId, memberId)
    this.emit(householdId)
    return { householdId, memberId }
  }

  private addMember(householdId: ID, me: ProfileInput, fallbackName: string, isAdmin: boolean): ID {
    const at = this.now()
    const id = this.id()
    const row: MemberRow = {
      id,
      householdId,
      name: me.name?.trim().slice(0, 40) || fallbackName,
      avatar: me.avatar ?? 'fork',
      color: me.color ?? 'sage',
      accessory: me.accessory ?? null,
      status: me.status?.trim().slice(0, 60) || null,
      defaultRole: me.defaultRole ?? 'taster',
      prefs: {},
      isAdmin,
      disabledAt: null,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    }
    this.table('members').set(id, row)
    return id
  }

  createInvite(userId: string, kind: 'join' | 'restore', memberId?: ID): Invite {
    const me = this.admin(userId)
    if (kind === 'join') {
      if (this.seats(me.householdId).length >= 2) reject('kitchen_full')
    } else {
      if (memberId === me.id) reject('not_yourself')
      if (!this.seats(me.householdId).some((m) => m.id === memberId)) reject('member_not_found')
    }
    const code = this.code(10)
    const expiresAt = Date.now() + 48 * 3_600_000
    this.invites.set(code, {
      code,
      householdId: me.householdId,
      kind,
      memberId: kind === 'restore' ? (memberId as ID) : null,
      createdBy: me.id,
      expiresAt,
      usedAt: null,
    })
    return { code, kind, expiresAt: new Date(expiresAt).toISOString() }
  }

  private validInvite(code: string): InviteRow {
    const invite = this.invites.get(normalize(code))
    if (!invite || invite.usedAt || invite.expiresAt < Date.now()) return reject('invite_invalid')
    return invite
  }

  peekInvite(_userId: string, code: string): InvitePeek {
    const invite = this.validInvite(code)
    const seats = this.seats(invite.householdId)
    return {
      kind: invite.kind,
      kitchenName: String(this.table('households').get(invite.householdId)?.name ?? ''),
      host: card(seats.find((m) => m.id === invite.createdBy)),
      profile: invite.kind === 'restore' ? card(seats.find((m) => m.id === invite.memberId)) : null,
    }
  }

  joinHousehold(userId: string, code: string, me: ProfileInput, pin: string): Membership & { kind: 'join' | 'restore' } {
    if (this.seatOf(userId)) reject('already_in_kitchen')
    const invite = this.validInvite(code)
    this.checkPin(pin)

    let memberId: ID
    if (invite.kind === 'join') {
      const seats = this.seats(invite.householdId)
      if (seats.length >= 2) reject('kitchen_full')
      const wanted = nameKey(me.name ?? '') || 'taster'
      if (seats.some((m) => nameKey(m.name) === wanted)) reject('name_taken')
      memberId = this.addMember(invite.householdId, me, 'Taster', false)
    } else {
      const seat = this.seats(invite.householdId).find((m) => m.id === invite.memberId) ?? reject('member_not_found')
      // Back in with a fresh start: the forgotten PIN and its wrong tries are history,
      // and so is every device that was still logged in (it may be the lost phone).
      this.attempts.delete(nameKey(seat.name))
      this.dropDevices(seat.id)
      memberId = seat.id
    }
    this.pins.set(memberId, pin)
    this.devices.set(userId, memberId)
    invite.usedAt = Date.now()
    this.emit(invite.householdId)
    return { householdId: invite.householdId, memberId, kind: invite.kind }
  }

  signInWithPin(userId: string, name: string, pin: string): Membership {
    if (this.seatOf(userId)) reject('already_in_kitchen')
    const key = nameKey(name).slice(0, 40)
    const now = Date.now()
    const tries = this.attempts.get(key) ?? { failed: 0, lockouts: 0, lockedUntil: 0, lastAttempt: now }
    if (tries.lockedUntil > now) reject('pin_locked', { retryAt: new Date(tries.lockedUntil).toISOString() })

    const found = this.members().find((m) => !m.deletedAt && nameKey(m.name) === key && this.pins.get(m.id) === pin)
    if (!found) {
      // The same answer for a wrong PIN and for a name nobody has: strangers learn nothing.
      tries.failed += 1
      tries.lastAttempt = now
      this.attempts.set(key, tries)
      if (tries.failed >= PIN_TRIES) {
        tries.failed = 0
        tries.lockouts += 1
        tries.lockedUntil = now + lockMinutes(tries.lockouts) * 60_000
        reject('pin_locked', { retryAt: new Date(tries.lockedUntil).toISOString() })
      }
      return reject('pin_wrong', { triesLeft: PIN_TRIES - tries.failed })
    }

    this.attempts.delete(key)
    if (found.disabledAt) reject('account_paused')
    this.devices.set(userId, found.id)
    return { householdId: found.householdId, memberId: found.id }
  }

  setPin(userId: string, pin: string): void {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    this.checkPin(pin)
    this.pins.set(me.id, pin)
    this.attempts.delete(nameKey(me.name))
  }

  signOutDevice(userId: string): void {
    this.devices.delete(userId)
    this.dropPushes(userId)
  }

  private dropDevices(memberId: ID, except?: string): number {
    let count = 0
    for (const [login, member] of this.devices) {
      if (member !== memberId || login === except) continue
      this.devices.delete(login)
      this.dropPushes(login)
      count += 1
    }
    return count
  }

  /** A device that is logged out, by whomever, gets no more notifications. */
  private dropPushes(userId: string): void {
    for (const [endpoint, row] of this.pushRows) if (row.userId === userId) this.pushRows.delete(endpoint)
  }

  signOutOtherDevices(userId: string): number {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    return this.dropDevices(me.id, userId)
  }

  // ------------------------------------------------------------------- admin --

  private partnerOf(admin: MemberRow, memberId: ID): MemberRow {
    if (memberId === admin.id) reject('not_yourself')
    return this.seats(admin.householdId).find((m) => m.id === memberId) ?? reject('member_not_found')
  }

  setMemberPaused(userId: string, memberId: ID, paused: boolean): void {
    const partner = this.partnerOf(this.admin(userId), memberId)
    if (Boolean(partner.disabledAt) === paused) return
    partner.disabledAt = paused ? this.now() : null
    this.touch(partner)
  }

  signOutMember(userId: string, memberId: ID): number {
    return this.dropDevices(this.partnerOf(this.admin(userId), memberId).id)
  }

  /**
   * The owner's master key, for when both people are locked out. In the real cloud this
   * can only be run from the Supabase dashboard (private.rescue_code), never from the app.
   */
  rescueCode(name: string): string {
    const seat = this.members().find((m) => !m.deletedAt && nameKey(m.name) === nameKey(name)) ?? reject('member_not_found')
    const code = this.code(10)
    this.invites.set(code, { code, householdId: seat.householdId, kind: 'restore', memberId: seat.id, createdBy: seat.id, expiresAt: Date.now() + 48 * 3_600_000, usedAt: null })
    return code
  }

  // ----------------------------------------------------------- notifications --

  /** For any device with a login, like public.push_public_key(). */
  pushPublicKey(_userId: string): string | null {
    return this.pushKey
  }

  /**
   * Test hook: what the owner does from the SQL editor. Null is "not set up yet" (or the
   * keys were thrown away); another key is what the function made after that.
   */
  setPushPublicKey(key: string | null): void {
    this.pushKey = key
  }

  // ---------------------------------------------------------------- the helper --

  /** public.ai_ticket(): one of today's readings for the caller's kitchen. Returns how many are left. */
  aiTicket(userId: string): number {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date())
    const key = `${me.householdId}:${day}`
    const used = this.helperTickets.get(key) ?? this.helperUsed
    if (used >= DAILY_TICKETS) reject('ai_limit')
    this.helperTickets.set(key, used + 1)
    return DAILY_TICKETS - used - 1
  }

  /** Test hook: what the owner does in the dashboard (set or remove the key), and an outage of the AI. */
  setHelper(state: { key?: string | null; down?: boolean; used?: number }): void {
    if (state.key !== undefined) this.helperKey = state.key
    if (state.down !== undefined) this.helperDown = state.down
    if (state.used !== undefined) {
      this.helperUsed = state.used
      this.helperTickets.clear()
    }
  }

  /**
   * The Edge Function "ai", run in place: the same handler as on Supabase, with a
   * pretend web and a stand-in for the AI (pretendWeb.ts).
   */
  async helper(userId: string | null, body: unknown): Promise<{ status: number; answer: HelperAnswer }> {
    const handle = helperHandler({
      fetch: pretendFetch(),
      askFetch: pretendHelper({ down: this.helperDown }),
      apiKey: this.helperKey,
      ticket: async (authorization) => {
        try {
          return { ok: true, left: this.aiTicket(authorization.replace(/^Bearer\s+/i, '')) }
        } catch (error) {
          if (error instanceof BackendError && error.code === 'ai_limit') return { ok: false, code: 'limit' }
          return { ok: false, code: 'not_member' }
        }
      },
    })
    const response = await handle(new Request('https://pretend.cloud/functions/v1/ai', { method: 'POST', headers: { 'content-type': 'application/json', ...(userId ? { authorization: `Bearer ${userId}` } : {}) }, body: JSON.stringify(body) }))
    return { status: response.status, answer: (await response.json()) as HelperAnswer }
  }

  savePushSubscription(userId: string, subscription: PushSubscriptionInput): void {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    const { endpoint, p256dh, auth } = subscription ?? {}
    const fine =
      typeof endpoint === 'string' && /^https:\/\//.test(endpoint) && endpoint.length <= 2000 &&
      typeof p256dh === 'string' && p256dh !== '' && p256dh.length <= 200 &&
      typeof auth === 'string' && auth !== '' && auth.length <= 100
    if (!fine) reject('push_invalid')
    // One row per device: the browser may have swapped its subscription for a new one.
    for (const [other, row] of this.pushRows) if (row.userId === userId && other !== endpoint) this.pushRows.delete(other)
    // One row per browser: whoever is logged in on it now owns it.
    this.pushRows.set(endpoint, {
      id: this.pushRows.get(endpoint)?.id ?? this.id(),
      householdId: me.householdId,
      memberId: me.id,
      userId,
      endpoint,
      p256dh,
      auth,
      mutedTypes: knownTypes(subscription.mutedTypes),
      userAgent: typeof subscription.userAgent === 'string' ? subscription.userAgent.slice(0, 300) : null,
    })
  }

  setPushMuted(userId: string, endpoint: string, mutedTypes: PushType[]): void {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    const row = this.pushRows.get(endpoint)
    if (!row || row.memberId !== me.id) return reject('push_missing')
    row.mutedTypes = knownTypes(mutedTypes)
  }

  removePushSubscription(userId: string, endpoint: string): void {
    const row = this.pushRows.get(endpoint)
    if (!row) return
    if (row.userId === userId || row.memberId === this.memberOf(userId)?.id) this.pushRows.delete(endpoint)
  }

  /** Test hook: every device signed up for notifications right now. */
  pushSubscriptions(): { endpoint: string; memberId: ID; mutedTypes: PushType[] }[] {
    return [...this.pushRows.values()].map(({ endpoint, memberId, mutedTypes }) => ({ endpoint, memberId, mutedTypes: [...mutedTypes] }))
  }

  /** Test hook: every notification "sent" since the last reset, oldest first. */
  sentPushes(): SentPush[] {
    return structuredClone(this.sent)
  }

  /**
   * What the database trigger and the push function do together in the real cloud
   * (0007_push.sql, supabase/functions/push): look up who should hear about the event and
   * "send" each of their devices one notification. Same rules, same words.
   */
  private announce(event: PushEvent): void {
    const serving = this.table('servings').get(event.servingId)
    const review = event.reviewId ? this.table('reviews').get(event.reviewId) : undefined
    const named = serving?.dishId ? this.table('dishes').get(serving.dishId as ID) : serving?.menuId ? this.table('menus').get(serving.menuId as ID) : undefined
    const deliveries = plan(
      event,
      {
        people: this.seats(event.householdId).map((m) => ({ id: m.id, name: m.name, lang: langOf(m.prefs), paused: Boolean(m.disabledAt) })),
        devices: [...this.pushRows.values()].filter((row) => row.householdId === event.householdId),
        meal: serving
          ? {
              status: String(serving.status),
              deleted: Boolean(serving.deletedAt),
              name: named && !named.deletedAt ? String(named.name) : null,
              cookId: (serving.cookedBy as ID | null) ?? (serving.proposedBy as ID | null) ?? null,
              plannedDate: (serving.plannedDate as string | null) ?? null,
              plannedSlot: (serving.plannedSlot as string | null) ?? null,
              proposedAt: (serving.proposedAt as ISO | null) ?? null,
              servedAt: (serving.servedAt as ISO | null) ?? null,
            }
          : null,
        answer: review ? { hasReaction: answerOf(review).reaction, hasReply: answerOf(review).reply, deleted: Boolean(review.deletedAt) } : null,
      },
      new Date(),
    )
    for (const { device, ...rest } of deliveries) this.sent.push({ ...rest, endpoint: device.endpoint, memberId: device.memberId })
  }

  // -------------------------------------------------------------------- sync --

  push(userId: string, op: PushOp): void {
    const me = this.memberOf(userId) ?? reject('forbidden')
    const table = this.table(op.table)
    const existing = table.get(op.id)
    const at = this.now()

    if (op.table === 'households') {
      if (op.kind !== 'patch' || op.id !== me.householdId || !existing) reject('forbidden')
      const { name, settings } = op.data
      table.set(op.id, { ...(existing as Row), ...defined({ name, settings }), updatedAt: at })
    } else if (op.table === 'members') {
      // Each person may edit only their own profile fields.
      if (op.kind !== 'patch' || !existing || existing.id !== me.id) return
      const allowed = Object.fromEntries(Object.entries(op.data).filter(([k]) => PROFILE_FIELDS.includes(k)))
      if (typeof allowed.status === 'string' && allowed.status.length > 60) reject('status_too_long')
      if (typeof allowed.name === 'string') {
        const wanted = nameKey(allowed.name)
        if (!wanted || allowed.name.length > 40) reject('name_invalid')
        // Names are how people log in, so two people cannot share one.
        if (this.seats(me.householdId).some((m) => m.id !== me.id && nameKey(m.name) === wanted)) reject('name_taken')
      }
      table.set(op.id, { ...existing, ...allowed, updatedAt: at })
    } else {
      if (!WRITABLE_TABLES.includes(op.table)) reject('forbidden')
      if (existing && existing.householdId !== me.householdId) reject('forbidden')
      if (op.kind === 'put') {
        if (op.data.householdId !== me.householdId) reject('forbidden')
        table.set(op.id, {
          ...(op.data as Row),
          id: op.id,
          householdId: me.householdId,
          createdAt: (existing?.createdAt as ISO | undefined) ?? (op.data.createdAt as ISO | undefined) ?? at,
          updatedAt: at,
        })
      } else {
        if (!existing) return // an update that matches no row is not an error, as in SQL
        const { id: _id, householdId: _h, createdAt: _c, ...changes } = op.data
        table.set(op.id, { ...existing, ...changes, updatedAt: at })
      }
      // The triggers of 0007_push.sql: some changes are worth a notification.
      const row = table.get(op.id) as Row
      if (op.table === 'servings') {
        const type = servingEvent(existing ? mealOf(existing) : null, mealOf(row))
        if (type) this.announce({ type, householdId: me.householdId, actorId: me.id, servingId: op.id, reviewId: null })
      } else if (op.table === 'reviews' && existing) {
        const others = [...table.values()].filter((r) => r.servingId === row.servingId && r.id !== row.id).map(answerOf)
        const type = reviewEvent(answerOf(existing), answerOf(row), others)
        if (type) this.announce({ type, householdId: me.householdId, actorId: me.id, servingId: row.servingId as ID, reviewId: op.id })
      }
    }
    this.emit(me.householdId)
  }

  pull(userId: string, since: ISO | null): PullResult {
    const me = this.memberOf(userId)
    const tables: PullResult['tables'] = {}
    for (const name of SYNC_TABLES) {
      const rows: Row[] = []
      if (me) {
        for (const row of this.table(name).values()) {
          const mine = name === 'households' ? row.id === me.householdId : row.householdId === me.householdId
          if (!mine) continue
          if (since && (row.updatedAt as ISO) <= since) continue
          rows.push(structuredClone(row))
        }
      }
      tables[name] = rows
    }
    const seat = this.seatOf(userId)
    return { serverTime: this.now(), tables, seat: !seat ? 'gone' : seat.disabledAt ? 'paused' : 'ok' }
  }

  subscribe(listener: (householdId: ID) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ------------------------------------------------------------------ photos --

  uploadBlob(userId: string, path: string, bytes: Uint8Array, type: string): void {
    const me = this.memberOf(userId)
    if (!me || path.split('/')[0] !== me.householdId) reject('forbidden')
    this.blobs.set(path, { bytes, type })
  }

  downloadBlob(userId: string, path: string): { bytes: Uint8Array; type: string } | null {
    const me = this.memberOf(userId)
    if (!me || path.split('/')[0] !== me.householdId) return null
    return this.blobs.get(path) ?? null
  }
}

const normalize = (code: string) => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()

/** Only kinds of notification that exist, each once. */
const knownTypes = (types: unknown): PushType[] => PUSH_TYPES.filter((type) => Array.isArray(types) && types.includes(type))

const mealOf = (row: Row) => ({ status: String(row.status), deleted: Boolean(row.deletedAt) })

const answerOf = (row: Row): AnswerChange => ({
  reaction: row.chefReaction != null,
  reply: typeof row.chefReply === 'string' && row.chefReply.trim() !== '',
  deleted: Boolean(row.deletedAt),
})

function defined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}
