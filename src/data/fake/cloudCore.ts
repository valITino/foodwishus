// A pretend cloud that behaves like the real database: one kitchen, two seats, the same
// pairing rules and error codes, the same "server clock stamps every write" behaviour.
// Tests and local development run against it, because they must never touch real data.
// Keep its rules in step with supabase/migrations.

import { BackendError, type BackendErrorDetails, type Invite, type InvitePeek, type Membership, type PersonCard, type ProfileInput, type PullResult, type PushOp } from '../backend.ts'
import { lockMinutes, nameKey, PIN_TRIES, pinProblem } from '../pin.ts'
import { SYNC_TABLES, WRITABLE_TABLES, type ID, type ISO, type Role, type SyncTable } from '../types.ts'

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
  }

  private dropDevices(memberId: ID, except?: string): number {
    let count = 0
    for (const [login, member] of this.devices) {
      if (member !== memberId || login === except) continue
      this.devices.delete(login)
      count += 1
    }
    return count
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

function defined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}
