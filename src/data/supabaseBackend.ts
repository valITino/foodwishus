// The real cloud. A thin translation layer: all rules live in the database
// (supabase/migrations), all sync logic lives in sync.ts.

import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { BackendError, type Backend, type Invite, type Membership, type ProfileInput, type PullResult, type PushOp, type RecoveryPeek, type Session } from './backend'
import { camelKeys, reviveRow, snakeKeys } from './case'
import { SYNC_TABLES, type ID, type ISO } from './types'

const BUCKET = 'photos'

/** Error names raised on purpose by the database functions. */
const KNOWN_CODES = [
  'not_signed_in',
  'already_in_kitchen',
  'kitchen_already_exists',
  'kitchen_full',
  'invite_invalid',
  'member_not_found',
  'recovery_key_invalid',
  'not_in_kitchen',
  'bad_invite_kind',
]

function looksOffline(message: string | undefined, status?: number): boolean {
  if (status !== undefined && (status === 0 || status === 408 || status === 429 || status >= 500)) return true
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timed? ?out|aborted/i.test(message ?? '')
}

function fromDatabase(error: { message: string; code?: string }, status: number): BackendError {
  if (looksOffline(error.message, status)) return new BackendError('network', 'offline', error.message)
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303' || error.code === '28000') {
    return new BackendError('auth', 'session_invalid', error.message)
  }
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
    const row = await this.rpc<{ household_id: ID; member_id: ID } | null>('my_membership')
    return row ? { householdId: row.household_id, memberId: row.member_id } : null
  }

  async createHousehold(name: string, me: ProfileInput) {
    const row = await this.rpc<{ household_id: ID; member_id: ID; recovery_key: string }>('create_household', {
      p_household_name: name,
      p_member: snakeKeys({ ...me }),
    })
    return { householdId: row.household_id, memberId: row.member_id, recoveryKey: row.recovery_key }
  }

  async createInvite(kind: 'join' | 'restore', memberId?: ID): Promise<Invite> {
    const row = await this.rpc<{ code: string; kind: 'join' | 'restore'; expires_at: ISO }>('create_invite', {
      p_kind: kind,
      p_member_id: memberId ?? null,
    })
    return { code: row.code, kind: row.kind, expiresAt: row.expires_at }
  }

  async joinHousehold(code: string, me: ProfileInput): Promise<Membership & { kind: 'join' | 'restore' }> {
    const row = await this.rpc<{ household_id: ID; member_id: ID; kind: 'join' | 'restore' }>('join_household', {
      p_code: code,
      p_member: snakeKeys({ ...me }),
    })
    return { householdId: row.household_id, memberId: row.member_id, kind: row.kind }
  }

  async recoveryPeek(key: string): Promise<RecoveryPeek> {
    const row = await this.rpc<{ household_id: ID; members: RecoveryPeek['members'] }>('recovery_peek', { p_key: key })
    return { householdId: row.household_id, members: row.members }
  }

  async recoverMember(key: string, memberId: ID): Promise<Membership> {
    const row = await this.rpc<{ household_id: ID; member_id: ID }>('recover_member', {
      p_key: key,
      p_member_id: memberId,
    })
    return { householdId: row.household_id, memberId: row.member_id }
  }

  async rotateRecoveryKey(): Promise<string> {
    return (await this.rpc<{ recovery_key: string }>('rotate_recovery_key')).recovery_key
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
    return { serverTime: raw.server_time as ISO, tables }
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
