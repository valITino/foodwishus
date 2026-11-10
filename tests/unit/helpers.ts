import { AppDB, META } from '../../src/data/db'
import type { FakeCloud } from '../../src/data/fake/cloudCore'
import { MemoryBackend } from '../../src/data/fake/memoryBackend'
import { Store } from '../../src/data/store'
import { SyncEngine } from '../../src/data/sync'
import { newId, nowIso, type Dish, type ID } from '../../src/data/types'

let counter = 0

export interface Phone {
  db: AppDB
  backend: MemoryBackend
  store: Store
  engine: SyncEngine
  adopt(m: { householdId: ID; memberId: ID }): Promise<void>
  dish(overrides?: Partial<Dish>): Promise<Dish>
}

/** A simulated phone: its own local database, its own connection to the shared cloud. */
export function makePhone(cloud: FakeCloud): Phone {
  const db = new AppDB(`phone-${++counter}-${Math.random().toString(36).slice(2)}`)
  const backend = new MemoryBackend(cloud)
  const store = new Store(db)
  const engine = new SyncEngine(db, backend, store)
  // Tests drive sync passes by hand, so writes must not start background passes.
  store.onWrite = () => {}

  return {
    db,
    backend,
    store,
    engine,
    async adopt(m) {
      await db.setMeta(META.householdId, m.householdId)
      await db.setMeta(META.memberId, m.memberId)
    },
    async dish(overrides = {}) {
      const at = nowIso()
      const dish: Dish = {
        id: newId(),
        householdId: (await store.householdId()) as ID,
        name: 'Lasagne',
        description: null,
        course: 'main',
        tags: [],
        effort: null,
        recipe: {},
        nutrition: {},
        coverPhotoId: null,
        icon: null,
        createdBy: (await store.memberId()) ?? null,
        archived: false,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        ...overrides,
      }
      await store.put('dishes', dish)
      return dish
    },
  }
}

/** Two paired phones: she started the kitchen, he joined with her invite code. */
export async function makeCouple(cloud: FakeCloud): Promise<{ her: Phone; him: Phone; recoveryKey: string }> {
  const her = makePhone(cloud)
  const him = makePhone(cloud)
  const kitchen = await her.backend.createHousehold('Our kitchen', { name: 'Mia', defaultRole: 'chef' })
  await her.adopt(kitchen)
  const invite = await her.backend.createInvite('join')
  await him.adopt(await him.backend.joinHousehold(invite.code, { name: 'Leo', defaultRole: 'taster' }))
  await her.engine.sync()
  await him.engine.sync()
  return { her, him, recoveryKey: kitchen.recoveryKey }
}
