// The real cloud. A thin translation layer: all rules live in the database
// (supabase/migrations), all sync logic lives in sync.ts.

import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { BackendError, type Backend, type Invite, type InvitePeek, type Membership, type PersonCard, type ProfileInput, type PullResult, type PushOp, type PushSubscriptionInput, type PushType, type Session } from './backend'
import { camelKeys, reviveRow, snakeKeys } from './case'
import { SYNC_TABLES, type ID, type ISO, type Role } from './types'

const BUCKET = 'photos'

/** Error names raised on purpose by the database functions. */
const KNOWN_CODES = [
  'not_signed_in',
  'already_in_kitchen',
  'kitchen_already_exists',
  'kitchen_full',
  'invite_invalid',
  'member_not_found',
  'not_in_kitchen',
  'bad_invite_kind',
  'name_taken',
  'name_invalid',
  'pin_invalid',
  'pin_too_simple',
  'admin_only',
  'not_yourself',
  'push_invalid',
  'push_missing',
]

type RawMembership = { household_id: ID; member_id: ID; paused?: boolean }
type RawCard = { name: string; avatar: string; color: string; accessory: string | null; default_role: Role } | null

const toMembership = (row: RawMembership): Membership =>
  row.paused ? { householdId: row.household_id, memberId: row.member_id, paused: true } : { householdId: row.household_id, memberId: row.member_id }

const toCard = (row: RawCard): PersonCard | null =>
  row ? { name: row.name, avatar: row.avatar, color: row.color, accessory: row.accessory, defaultRole: row.default_role } : null

/** The profile fields the pairing functions read, in the database's spelling. */
function memberArg(me: ProfileInput): Record<string, unknown> {
  return snakeKeys({ ...me })
}

function looksOffline(message: string | undefined, status?: number): boolean {
  if (status !== undefined && (status === 0 || status === 408 || status === 429 || status >= 500)) return true
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timed? ?out|aborted/i.test(message ?? '')
}

function fromDatabase(error: { message: string; code?: string }, status: number): BackendError {
  if (looksOffline(error.message, status)) return new BackendError('network', 'offline', error.message)
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303' || error.code === '28000') {
    return new BackendError('auth', 'session_invalid', error.message)
  }
  // Two people in one kitchen cannot share a name: the unique index says no.
  if (error.code === '23505' && error.message.includes('members_household_name_key')) return new BackendError('rejected', 'name_taken', error.message)
  const known = KNOWN_CODES.find((code) => error.message === code)
  return new BackendError('rejected', known ?? error.code ?? 'rejected', error.message)
}

function fromStorage(error: { message: string; status?: number; name?: string }): BackendError {
  if (error.name === 'StorageUnknownError' || looksOffline(error.message, error.status)) {
    return new BackendError('network', 'offline', error.message)
  }
  return new BackendError('rejected', 'storage_refused', error.message)
}

export class SupabaseBackend implements Backend {
  readonly name = 'supabase' as const
  private readonly client: SupabaseClient

  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }

  async ensureSession(): Promise<Session> {
    const { data, error } = await this.client.auth.getSession()
    if (data.session) return { userId: data.session.user.id }
    if (error) {
      // Offline with an expired token is not "signed out": the saved login is still good.
      // Creating a new anonymous login here would silently unpair the phone.
      if (isAuthRetryableFetchError(error) || looksOffline(error.message, error.status)) {
        throw new BackendError('network', 'offline', error.message)
      }
      await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    }

    const res = await this.client.auth.signInAnonymously()
    if (res.error || !res.data.user) {
      const err = res.error
      if (err && (err.code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(err.message))) {
        throw new BackendError('setup', 'anonymous_disabled', err.message)
      }
      if (!err || isAuthRetryableFetchError(err) || looksOffline(err.message, err.status)) {
        throw new BackendError('network', 'offline', err?.message)
      }
      throw new BackendError('auth', err.code ?? 'sign_in_failed', err.message)
    }
    return { userId: res.data.user.id }
  }

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    await this.ensureSession()
    const { data, error, status } = await this.client.rpc(fn, args)
    if (error) throw fromDatabase(error, status)
    return data as T
  }

  async membership(): Promise<Membership | null> {
    const row = await this.rpc<RawMembership | null>('my_membership')
    return row ? toMembership(row) : null
  }

  async kitchenExists(): Promise<boolean> {
    return Boolean(await this.rpc<boolean>('kitchen_exists'))
  }

  async createHousehold(name: string, me: ProfileInput, pin: string): Promise<Membership> {
    return toMembership(await this.rpc<RawMembership>('create_household', { p_household_name: name, p_member: memberArg(me), p_pin: pin }))
  }

  async createInvite(kind: 'join' | 'restore', memberId?: ID): Promise<Invite> {
    const row = await this.rpc<{ code: string; kind: 'join' | 'restore'; expires_at: ISO }>('create_invite', {
      p_kind: kind,
      p_member_id: memberId ?? null,
    })
    return { code: row.code, kind: row.kind, expiresAt: row.expires_at }
  }

  async peekInvite(code: string): Promise<InvitePeek> {
    const row = await this.rpc<{ kind: 'join' | 'restore'; kitchen_name: string; host: RawCard; profile: RawCard }>('peek_invite', { p_code: code })
    return { kind: row.kind, kitchenName: row.kitchen_name, host: toCard(row.host), profile: toCard(row.profile) }
  }

  async joinHousehold(code: string, me: ProfileInput, pin: string): Promise<Membership & { kind: 'join' | 'restore' }> {
    const row = await this.rpc<RawMembership & { kind: 'join' | 'restore' }>('join_household', { p_code: code, p_member: memberArg(me), p_pin: pin })
    return { ...toMembership(row), kind: row.kind }
  }

  async signInWithPin(name: string, pin: string): Promise<Membership> {
    // A wrong PIN comes back as an answer, not as an error: the database has to keep
    // its count of wrong tries, and an error would undo that.
    const row = await this.rpc<
      | ({ ok: true } & RawMembership)
      | { ok: false; reason: 'wrong'; tries_left: number }
      | { ok: false; reason: 'locked'; retry_at: ISO }
      | { ok: false; reason: 'paused' }
    >('sign_in_with_pin', { p_name: name, p_pin: pin })
    if (row.ok) return toMembership(row)
    if (row.reason === 'locked') throw new BackendError('rejected', 'pin_locked', undefined, { retryAt: row.retry_at })
    if (row.reason === 'paused') throw new BackendError('rejected', 'account_paused')
    throw new BackendError('rejected', 'pin_wrong', undefined, { triesLeft: row.tries_left })
  }

  async setPin(pin: string): Promise<void> {
    await this.rpc<null>('set_pin', { p_pin: pin })
  }

  async signOutDevice(): Promise<void> {
    await this.rpc<null>('sign_out_device')
  }

  async signOutOtherDevices(): Promise<number> {
    return Number(await this.rpc<number>('sign_out_other_devices'))
  }

  async setMemberPaused(memberId: ID, paused: boolean): Promise<void> {
    await this.rpc<null>('set_member_paused', { p_member_id: memberId, p_paused: paused })
  }

  async signOutMember(memberId: ID): Promise<number> {
    return Number(await this.rpc<number>('sign_out_member', { p_member_id: memberId }))
  }

  async savePushSubscription(subscription: PushSubscriptionInput): Promise<void> {
    await this.rpc<null>('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.p256dh,
      p_auth: subscription.auth,
      p_muted_types: subscription.mutedTypes,
      p_user_agent: subscription.userAgent ?? null,
    })
  }

  async setPushMuted(endpoint: string, mutedTypes: PushType[]): Promise<void> {
    await this.rpc<null>('set_push_muted', { p_endpoint: endpoint, p_muted_types: mutedTypes })
  }

  async removePushSubscription(endpoint: string): Promise<void> {
    await this.rpc<null>('remove_push_subscription', { p_endpoint: endpoint })
  }

  async push(op: PushOp): Promise<void> {
    await this.ensureSession()
    const data = snakeKeys(op.data)
    // The server owns this column; sending it would only be overwritten.
    delete data.updated_at
    const query =
      op.kind === 'put'
        ? this.client.from(op.table).upsert({ ...data, id: op.id }, { onConflict: 'id' })
        : this.client.from(op.table).update(data).eq('id', op.id)
    const { error, status } = await query
    if (error) throw fromDatabase(error, status)
  }

  async pull(since: ISO | null): Promise<PullResult> {
    const raw = await this.rpc<Record<string, unknown>>('sync_pull', { p_since: since })
    const tables: PullResult['tables'] = {}
    for (const table of SYNC_TABLES) {
      const rows = (raw[table] as Record<string, unknown>[] | undefined) ?? []
      tables[table] = rows.map((row) => reviveRow(table, camelKeys(row)))
    }
    const seat = raw.seat === 'paused' || raw.seat === 'gone' ? raw.seat : 'ok'
    return { serverTime: raw.server_time as ISO, tables, seat }
  }

  subscribe(householdId: ID, onChange: () => void): () => void {
    const channel = this.client.channel(`kitchen:${householdId}`)
    for (const table of SYNC_TABLES) {
      const filter = table === 'households' ? `id=eq.${householdId}` : `household_id=eq.${householdId}`
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => onChange())
    }
    channel.subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }

  async uploadBlob(path: string, blob: Blob): Promise<void> {
    await this.ensureSession()
    const { error } = await this.client.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',
    })
    if (error) throw fromStorage(error as { message: string; status?: number; name?: string })
  }

  async downloadBlob(path: string): Promise<Blob | null> {
    await this.ensureSession()
    const { data, error } = await this.client.storage.from(BUCKET).download(path)
    if (error) {
      const e = error as { message: string; status?: number; name?: string }
      if (e.status === 404 || e.status === 400 || /not.?found/i.test(e.message)) return null
      throw fromStorage(e)
    }
    return data
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut({ scope: 'local' })
  }
}
