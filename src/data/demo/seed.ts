// Fills the demo kitchen. This first version only creates the kitchen and its two
// people; the sample dishes, meals and reviews are added in seedContent().

import { META, type AppDB } from '../db'
import { newId, nowIso, type Criterion, type Household, type Member } from '../types'

const CRITERIA: [string, string][] = [
  ['Taste', 'tongue'],
  ['Texture', 'layers'],
  ['Smell', 'steam'],
  ['Looks', 'sparkle'],
  ['Portion', 'plate'],
  ['Temperature', 'flame'],
]

export interface DemoKitchen {
  householdId: string
  chefId: string
  tasterId: string
}

/** Create the demo kitchen once. Safe to call on every start. */
export async function ensureDemoKitchen(db: AppDB): Promise<void> {
  if (await db.getMeta<string>(META.householdId)) return

  const at = nowIso()
  const householdId = newId()
  const row = { householdId, createdAt: at, updatedAt: at, deletedAt: null }
  const household: Household = { id: householdId, name: 'Demo kitchen', settings: {}, createdAt: at, updatedAt: at, deletedAt: null }
  const chef: Member = { ...row, id: newId(), name: 'Mia', avatar: 'whisk', color: 'rose', accessory: 'bow', status: 'Chef mode: on. Bring an appetite.', defaultRole: 'chef' }
  const taster: Member = { ...row, id: newId(), name: 'Leo', avatar: 'fork', color: 'sage', accessory: null, status: 'Always Huuungryyyyy', defaultRole: 'taster' }
  const criteria: Criterion[] = CRITERIA.map(([label, icon], sortOrder) => ({ ...row, id: newId(), label, icon, active: true, sortOrder }))

  await db.transaction('rw', db.tables, async () => {
    await db.households.put(household)
    await db.members.bulkPut([chef, taster])
    await db.criteria.bulkPut(criteria)
    await seedContent(db, { householdId, chefId: chef.id, tasterId: taster.id })
    // The demo is seen through the Taster's eyes.
    await db.setMeta(META.memberId, taster.id)
    await db.setMeta(META.householdId, householdId)
  })
}

/** Sample dishes, menus, servings and reviews. Filled in by the demo-content workstream. */
async function seedContent(_db: AppDB, _kitchen: DemoKitchen): Promise<void> {
  // Intentionally empty for now.
}
