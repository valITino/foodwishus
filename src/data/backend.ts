// The one seam between the app and "the cloud". The sync engine only ever talks to
// this interface, so it can run against Supabase on real phones and against the
// pretend cloud in tests and local development.

import type { ID, ISO, Role, SyncTable } from './types.ts'

export type BackendErrorKind =
  /** No connection, timeout, 5xx. Try again later; nothing is wrong with the data. */
  | 'network'
  /** The cloud understood and said no (rule violation, bad data). Retrying will not help. */
  | 'rejected'
  /** The login is gone or invalid. Sign in again. */
  | 'auth'
  /** The cloud project is not configured yet (for example anonymous sign-ins are off). */
  | 'setup'

export class BackendError extends Error {
  readonly kind: BackendErrorKind
  /** Stable machine code, such as "kitchen_full" or "invite_invalid". */
  readonly code: string

  constructor(kind: BackendErrorKind, code: string, message?: string) {
    super(message ?? code)
    this.name = 'BackendError'
    this.kind = kind
    this.code = code
  }
}

export const isBackendError = (e: unknown): e is BackendError => e instanceof BackendError

export interface Session {
  userId: string
}

export interface Membership {
  householdId: ID
  memberId: ID
}

export interface ProfileInput {
  name: string
  avatar?: string
  color?: string
  defaultRole?: Role
}

export interface Invite {
  code: string
  kind: 'join' | 'restore'
  expiresAt: ISO
}

export interface RecoveryPeek {
  householdId: ID
  members: { id: ID; name: string; avatar: string; color: string }[]
}

/** One change on its way to the cloud. "put" sends a whole row, "patch" only the changed fields. */
export interface PushOp {
  table: SyncTable
  kind: 'put' | 'patch'
  id: ID
  /** camelCase fields. For "put" the complete row; for "patch" just what changed. */
  data: Record<string, unknown>
}

export interface PullResult {
  serverTime: ISO
  /** camelCase rows that changed since the cursor, per table. */
  tables: Partial<Record<SyncTable, Record<string, unknown>[]>>
}

export interface Backend {
  readonly name: 'supabase' | 'fake' | 'memory'

  /** Returns the current login, creating an anonymous one on first launch. Needs a connection once. */
  ensureSession(): Promise<Session>
  /** Which kitchen this login belongs to, or null when the phone is not paired. */
  membership(): Promise<Membership | null>

  createHousehold(name: string, me: ProfileInput): Promise<Membership & { recoveryKey: string }>
  createInvite(kind: 'join' | 'restore', memberId?: ID): Promise<Invite>
  joinHousehold(code: string, me: ProfileInput): Promise<Membership>
  recoveryPeek(key: string): Promise<RecoveryPeek>
  recoverMember(key: string, memberId: ID): Promise<Membership>
  rotateRecoveryKey(): Promise<string>

  push(op: PushOp): Promise<void>
  pull(since: ISO | null): Promise<PullResult>
  /** Calls onChange whenever something in the kitchen changes. Returns an unsubscribe function. */
  subscribe(householdId: ID, onChange: () => void): () => void

  uploadBlob(path: string, blob: Blob): Promise<void>
  /** Resolves null when the file is not in the cloud (yet). */
  downloadBlob(path: string): Promise<Blob | null>

  signOut(): Promise<void>
}

export const photoPath = (householdId: ID, photoId: ID, variant: 'full' | 'thumb') =>
  `${householdId}/${photoId}${variant === 'thumb' ? '_t' : ''}.jpg`
