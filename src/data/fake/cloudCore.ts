// A pretend cloud that behaves like the real database: one kitchen, two seats, the same
// pairing rules and error codes, the same "server clock stamps every write" behaviour.
// Tests and local development run against it, because they must never touch real data.
// Keep its rules in step with supabase/migrations.

import { BackendError, type Invite, type Membership, type ProfileInput, type PullResult, type PushOp, type RecoveryPeek } from '../backend.ts'
import { SYNC_TABLES, WRITABLE_TABLES, type ID, type ISO, type SyncTable } from '../types.ts'

type Row = Record<string, unknown> & { id: ID }

interface MemberRow extends Row {
  householdId: ID
  userId: string | null
  name: string
  avatar: string
  color: string
  accessory: string | null
  status: string | null
  defaultRole: string
  createdAt: ISO
  updatedAt: ISO
  deletedAt: ISO | null
}

interface InviteRow {
  code: string
  householdId: ID
  kind: 'join' | 'restore'
  memberId: ID | null
  expiresAt: number
  usedAt: number | null
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
const PROFILE_FIELDS = ['name', 'avatar', 'color', 'defaultRole', 'status', 'accessory']

const reject = (code: string): never => {
  throw new BackendError('rejected', code)
}

export class FakeCloud {
  private tables = new Map<SyncTable, Map<ID, Row>>()
  private invites = new Map<string, InviteRow>()
  private recoveryKeys = new Map<ID, string>()
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
    this.recoveryKeys.clear()
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

  private memberOf(userId: string): MemberRow | undefined {
    return this.members().find((m) => m.userId === userId && !m.deletedAt)
  }

  private seats(householdId: ID): MemberRow[] {
    return this.members().filter((m) => m.householdId === householdId && !m.deletedAt)
  }

  private emit(householdId: ID): void {
    for (const fn of this.listeners) fn(householdId)
  }

  // ----------------------------------------------------------------- pairing --

  signIn(): string {
    return this.id()
  }

  membership(userId: string): Membership | null {
    const me = this.memberOf(userId)
    return me ? { householdId: me.householdId, memberId: me.id } : null
  }

  createHousehold(userId: string, name: string, me: ProfileInput): Membership & { recoveryKey: string } {
    if (this.memberOf(userId)) reject('already_in_kitchen')
    if ([...this.table('households').values()].some((h) => !h.deletedAt)) reject('kitchen_already_exists')

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
    const memberId = this.addMember(householdId, userId, { avatar: 'whisk', color: 'rose', defaultRole: 'chef', ...me }, 'Chef')
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
    const recoveryKey = this.code(20)
    this.recoveryKeys.set(householdId, recoveryKey)
    this.emit(householdId)
    return { householdId, memberId, recoveryKey }
  }

  private addMember(householdId: ID, userId: string, me: ProfileInput, fallbackName: string): ID {
    const at = this.now()
    const id = this.id()
    const row: MemberRow = {
      id,
      householdId,
      userId,
      name: me.name?.trim() || fallbackName,
      avatar: me.avatar ?? 'fork',
      color: me.color ?? 'sage',
      accessory: null,
      status: null,
      defaultRole: me.defaultRole ?? 'taster',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    }
    this.table('members').set(id, row)
    return id
  }

  createInvite(userId: string, kind: 'join' | 'restore', memberId?: ID): Invite {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    if (kind === 'join') {
      if (this.seats(me.householdId).length >= 2) reject('kitchen_full')
    } else if (!this.seats(me.householdId).some((m) => m.id === memberId)) {
      reject('member_not_found')
    }
    const code = this.code(10)
    const expiresAt = Date.now() + 48 * 3_600_000
    this.invites.set(code, {
      code,
      householdId: me.householdId,
      kind,
      memberId: kind === 'restore' ? (memberId as ID) : null,
      expiresAt,
      usedAt: null,
    })
    return { code, kind, expiresAt: new Date(expiresAt).toISOString() }
  }

  joinHousehold(userId: string, code: string, me: ProfileInput): Membership & { kind: 'join' | 'restore' } {
    if (this.memberOf(userId)) reject('already_in_kitchen')
    const invite = this.invites.get(normalize(code))
    if (!invite || invite.usedAt || invite.expiresAt < Date.now()) return reject('invite_invalid')

    let memberId: ID
    if (invite.kind === 'join') {
      if (this.seats(invite.householdId).length >= 2) reject('kitchen_full')
      memberId = this.addMember(invite.householdId, userId, me, 'Taster')
    } else {
      const seat = this.seats(invite.householdId).find((m) => m.id === invite.memberId) ?? reject('member_not_found')
      seat.userId = userId
      seat.updatedAt = this.now()
      memberId = seat.id
    }
    invite.usedAt = Date.now()
    this.emit(invite.householdId)
    return { householdId: invite.householdId, memberId, kind: invite.kind }
  }

  private householdForKey(key: string): ID {
    for (const [householdId, stored] of this.recoveryKeys) {
      if (stored === normalize(key)) return householdId
    }
    return reject('recovery_key_invalid')
  }

  recoveryPeek(_userId: string, key: string): RecoveryPeek {
    const householdId = this.householdForKey(key)
    return {
      householdId,
      members: this.seats(householdId).map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, color: m.color })),
    }
  }

  recoverMember(userId: string, key: string, memberId: ID): Membership {
    if (this.memberOf(userId)) reject('already_in_kitchen')
    const householdId = this.householdForKey(key)
    const seat = this.seats(householdId).find((m) => m.id === memberId) ?? reject('member_not_found')
    seat.userId = userId
    seat.updatedAt = this.now()
    this.emit(householdId)
    return { householdId, memberId: seat.id }
  }

  rotateRecoveryKey(userId: string): string {
    const me = this.memberOf(userId) ?? reject('not_in_kitchen')
    const key = this.code(20)
    this.recoveryKeys.set(me.householdId, key)
    return key
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
      if (op.kind !== 'patch' || !existing || (existing as MemberRow).userId !== userId) return
      const allowed = Object.fromEntries(Object.entries(op.data).filter(([k]) => PROFILE_FIELDS.includes(k)))
      if (typeof allowed.status === 'string' && allowed.status.length > 60) reject('status_too_long')
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
          const { userId: _userId, ...visible } = row
          rows.push(structuredClone(visible) as Row)
        }
      }
      tables[name] = rows
    }
    return { serverTime: this.now(), tables }
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
