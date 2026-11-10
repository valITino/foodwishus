// Every change the app makes goes through here: it lands in the phone's own database
// at once (so the screen updates instantly, online or not) and is queued in the outbox
// for the cloud.

import type { AppDB, OutboxOp } from './db'
import { META } from './db'
import { nowIso, WRITABLE_TABLES, type ID, type SyncTable, type TableRows } from './types'

type Patchable = SyncTable

export class Store {
  /** Called after every local write. The sync engine hooks in here. */
  onWrite: () => void = () => {}
  /** seq of the outbox entry being sent right now. It must not be merged into. */
  inFlightSeq: number | null = null

  /**
   * @param localOnly The demo kitchen: changes stay on this phone and are never queued for the cloud.
   */
  constructor(
    readonly db: AppDB,
    readonly localOnly = false,
  ) {}

  async householdId(): Promise<ID | undefined> {
    return this.db.getMeta<ID>(META.householdId)
  }

  async memberId(): Promise<ID | undefined> {
    return this.db.getMeta<ID>(META.memberId)
  }

  /** Add a new row. */
  async put<T extends SyncTable>(table: T, row: TableRows[T]): Promise<void> {
    if (!WRITABLE_TABLES.includes(table)) throw new Error(`Rows in "${table}" are created by pairing, not by the app.`)
    await this.db.transaction('rw', this.db.table(table), this.db.outbox, async () => {
      await this.db.rows(table).put(row as never)
      await this.enqueue({ table, rowId: row.id, kind: 'put', data: { ...row } })
    })
    this.onWrite()
  }

  /** Change some fields of an existing row. Only the changed fields travel to the cloud. */
  async patch<T extends Patchable>(table: T, id: ID, changes: Partial<TableRows[T]>): Promise<void> {
    const clean = stripUndefined(changes as Record<string, unknown>)
    delete clean.id
    delete clean.householdId
    delete clean.createdAt
    delete clean.updatedAt
    if (Object.keys(clean).length === 0) return
    if (table === 'members' && id !== (await this.memberId())) throw new Error('You can only edit your own profile.')

    await this.db.transaction('rw', this.db.table(table), this.db.outbox, async () => {
      const current = await this.db.rows(table).get(id)
      if (!current) throw new Error(`Cannot change a missing row: ${table}/${id}`)
      await this.db.rows(table).put({ ...current, ...clean, updatedAt: nowIso() })
      await this.enqueue({ table, rowId: id, kind: 'patch', data: clean })
    })
    this.onWrite()
  }

  /** Soft delete: the row stays in the database so the removal can sync. */
  async remove(table: Exclude<SyncTable, 'households' | 'members'>, id: ID): Promise<void> {
    await this.patch(table, id, { deletedAt: nowIso() } as never)
  }

  private async enqueue(op: Pick<OutboxOp, 'table' | 'rowId' | 'kind' | 'data'>): Promise<void> {
    if (this.localOnly) return
    // Rapid edits to the same row (typing, dragging) collapse into one entry. Only the
    // very last entry in the queue may absorb a change, which keeps cause before effect.
    const last = await this.db.outbox.orderBy('seq').last()
    if (
      last &&
      last.seq !== this.inFlightSeq &&
      last.table === op.table &&
      last.rowId === op.rowId &&
      (op.kind === 'patch' || last.kind === 'put')
    ) {
      const data = op.kind === 'put' ? op.data : { ...last.data, ...op.data }
      await this.db.outbox.update(last.seq!, { data, kind: last.kind === 'put' ? 'put' : op.kind })
      return
    }
    await this.db.outbox.add({ ...op, createdAt: nowIso(), attempts: 0 })
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out
}
