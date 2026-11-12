// Fills the demo kitchen: Mia the Chef, Leo the Taster, about thirty recipe cards,
// four menus, three months of meals with reviews, a planned week and a wishlist.
// Written in the language the app is set to when the demo is first opened.
//
//   story.ts      what happened and what was said
//   recipes/      the recipe cards
//   history.ts    builds every row in memory (pure, shared with the tests)
//   photos.ts     paints the proof and cover photos afterwards, in the background

import { getLang, type Lang } from '../../i18n'
import { addDays, today } from '../../lib/dates'
import { META, type AppDB } from '../db'
import { newId, type Criterion, type Day, type Household, type Member } from '../types'
import { hm, zurichIso } from './clock'
import { say } from './content'
import { buildDemoRows, KITCHEN_AGE_DAYS, type DemoKitchen } from './history'
import { demoBasket } from './basket'
import { demoNews } from './news'
import { PHOTO_JOBS, seedDemoPhotos } from './photos'
import { CRITERIA, KITCHEN } from './story'

export type { DemoKitchen } from './history'
export { seedDemoPhotos } from './photos'

export interface SeedOptions {
  /** The day the demo is opened. Defaults to today in Zurich. */
  today?: Day
  /** Defaults to the app's current language. */
  lang?: Lang
  /** Only the kitchen and its two people, no dishes, meals or photos. For tests that start from a clean table. */
  empty?: boolean
}

/**
 * Create the demo kitchen once. Safe to call on every start, and from two places at
 * once. The kitchen itself is written in one go; its photos follow in the background.
 */
export async function ensureDemoKitchen(db: AppDB, options: SeedOptions = {}): Promise<void> {
  if (!(await db.getMeta<string>(META.householdId))) {
    const lang = options.lang ?? getLang()
    const day = options.today ?? today()
    // The kitchen is older than the three months of meals shown on the cockpit.
    const at = zurichIso(addDays(day, -KITCHEN_AGE_DAYS), hm(19, 42))
    const joinedAt = zurichIso(addDays(day, -KITCHEN_AGE_DAYS), hm(19, 48))
    const householdId = newId()
    const row = { householdId, createdAt: at, updatedAt: at, deletedAt: null }
    const household: Household = { id: householdId, name: say(KITCHEN.name, lang), settings: {}, createdAt: at, updatedAt: at, deletedAt: null }
    const chef: Member = { ...row, id: newId(), name: 'Mia', avatar: 'whisk', color: 'rose', accessory: 'bow', status: say(KITCHEN.chefStatus, lang), defaultRole: 'chef', prefs: {}, isAdmin: false, disabledAt: null }
    const taster: Member = { ...row, createdAt: joinedAt, updatedAt: joinedAt, id: newId(), name: 'Leo', avatar: 'fork', color: 'sage', accessory: null, status: say(KITCHEN.tasterStatus, lang), defaultRole: 'taster', prefs: {}, isAdmin: true, disabledAt: null }
    const criteria: Criterion[] = CRITERIA.map(([, en, de, icon], sortOrder) => ({ ...row, id: newId(), label: lang === 'de' ? de : en, icon, active: true, sortOrder }))

    await db.transaction('rw', db.tables, async () => {
      // Someone else may have filled the kitchen while this call was getting ready.
      if (await db.getMeta<string>(META.householdId)) return
      await db.households.put(household)
      await db.members.bulkPut([chef, taster])
      await db.criteria.bulkPut(criteria)
      if (!options.empty) await seedContent(db, { householdId, chefId: chef.id, tasterId: taster.id }, { today: day, lang })
      // The demo is seen through the Taster's eyes.
      await db.setMeta(META.memberId, taster.id)
      await db.setMeta(META.householdId, householdId)
    })
  }
  // Not awaited: the kitchen is ready, the photos develop while you look around.
  if (!options.empty) void seedDemoPhotos(db)
}

/** Sample dishes, menus, servings and reviews, written straight into the local tables. */
export async function seedContent(db: AppDB, kitchen: DemoKitchen, options: SeedOptions = {}): Promise<void> {
  const criteria = (await db.criteria.toArray()).filter((c) => c.householdId === kitchen.householdId && !c.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
  const rows = buildDemoRows({ kitchen, criteria, today: options.today ?? today(), lang: options.lang ?? getLang() })
  await db.dishes.bulkPut(rows.dishes)
  await db.menus.bulkPut(rows.menus)
  await db.servings.bulkPut(rows.servings)
  await db.reviews.bulkPut(rows.reviews)
  await db.news.bulkAdd(demoNews(rows, kitchen))
  const shopping = demoBasket(kitchen, options.lang ?? getLang())
  await db.basket.bulkPut(shopping.basket)
  await db.pantry.bulkPut(shopping.pantry)
  await db.setMeta(PHOTO_JOBS, rows.photoJobs)
}
