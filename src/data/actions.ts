// Everything the app can do to the kitchen's data. Screens call these; they never
// write to the database directly. Each action updates the phone at once and queues
// the change for the cloud.

import { generateKeyBetween } from 'fractional-indexing'
import { db, store } from './app'
import { byPriority } from './queries'
import { newId, nowIso, type Day, type Dish, type ID, type Member, type Menu, type MenuCourse, type Score5, type Serving, type Slot } from './types'

async function me(): Promise<{ householdId: ID; memberId: ID }> {
  const [householdId, memberId] = await Promise.all([store.householdId(), store.memberId()])
  if (!householdId || !memberId) throw new Error('This phone is not paired with a kitchen yet.')
  return { householdId, memberId }
}

function fresh(householdId: ID) {
  const at = nowIso()
  return { id: newId(), householdId, createdAt: at, updatedAt: at, deletedAt: null }
}

// ------------------------------------------------------------------ dishes --

export type DishInput = Pick<Dish, 'name'> &
  Partial<Pick<Dish, 'description' | 'course' | 'tags' | 'effort' | 'recipe' | 'nutrition' | 'coverPhotoId' | 'icon'>>

export async function createDish(input: DishInput): Promise<Dish> {
  const { householdId, memberId } = await me()
  const dish: Dish = {
    ...fresh(householdId),
    name: input.name.trim(),
    description: input.description ?? null,
    course: input.course ?? 'main',
    tags: input.tags ?? [],
    effort: input.effort ?? null,
    recipe: input.recipe ?? {},
    nutrition: input.nutrition ?? {},
    coverPhotoId: input.coverPhotoId ?? null,
    icon: input.icon ?? null,
    createdBy: memberId,
    archived: false,
  }
  await store.put('dishes', dish)
  return dish
}

export async function updateDish(id: ID, changes: Partial<DishInput> & { archived?: boolean }): Promise<void> {
  await store.patch('dishes', id, changes)
}

export async function deleteDish(id: ID): Promise<void> {
  await store.remove('dishes', id)
}

// ------------------------------------------------------------------- menus --

export interface MenuInput {
  name: string
  description?: string | null
  courses: MenuCourse[]
}

export async function createMenu(input: MenuInput): Promise<Menu> {
  const { householdId, memberId } = await me()
  const menu: Menu = {
    ...fresh(householdId),
    name: input.name.trim(),
    description: input.description ?? null,
    courses: input.courses,
    createdBy: memberId,
    archived: false,
  }
  await store.put('menus', menu)
  return menu
}

export async function updateMenu(id: ID, changes: Partial<MenuInput> & { archived?: boolean }): Promise<void> {
  await store.patch('menus', id, changes)
}

export async function deleteMenu(id: ID): Promise<void> {
  await store.remove('menus', id)
}

// ---------------------------------------------------------------- servings --

async function openServings(): Promise<Serving[]> {
  return (await db.servings.toArray()).filter((s) => !s.deletedAt).sort(byPriority)
}

/** A key between two neighbours that never throws, even if a sync left them out of order. */
function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) return generateKeyBetween(before, null)
  return generateKeyBetween(before, after)
}

export interface ProposeInput {
  dishId?: ID
  menuId?: ID
  note?: string
  suggestedDays?: Day[]
  /** Who will cook. Defaults to the person proposing. */
  cookedBy?: ID
}

/** Put a dish or menu on the wishlist, at the bottom. */
export async function proposeServing(input: ProposeInput): Promise<Serving> {
  if (!input.dishId && !input.menuId) throw new Error('Propose a dish or a menu.')
  const { householdId, memberId } = await me()
  const last = (await openServings()).at(-1)
  const serving: Serving = {
    ...fresh(householdId),
    dishId: input.dishId ?? null,
    menuId: input.menuId ?? null,
    proposedBy: memberId,
    cookedBy: input.cookedBy ?? memberId,
    proposedAt: nowIso(),
    note: input.note?.trim() || null,
    suggestedDays: input.suggestedDays ?? [],
    craving: null,
    priority: keyBetween(last?.priority ?? null, null),
    status: 'wishlist',
    plannedDate: null,
    plannedSlot: null,
    servedAt: null,
    eatenAt: null,
    skippedReason: null,
    proofPhotos: [],
  }
  await store.put('servings', serving)
  return serving
}

export async function setCraving(id: ID, craving: Score5 | null): Promise<void> {
  await store.patch('servings', id, { craving })
}

/**
 * Move a serving in the wishlist order so it sits between two neighbours.
 * Pass null for "before" to move it to the top, null for "after" to move it to the bottom.
 */
export async function moveServing(id: ID, beforeId: ID | null, afterId: ID | null): Promise<void> {
  const [before, after] = await Promise.all([
    beforeId ? db.servings.get(beforeId) : undefined,
    afterId ? db.servings.get(afterId) : undefined,
  ])
  await store.patch('servings', id, { priority: keyBetween(before?.priority ?? null, after?.priority ?? null) })
}

export async function planServing(id: ID, date: Day, slot: Slot): Promise<void> {
  await store.patch('servings', id, { status: 'planned', plannedDate: date, plannedSlot: slot, skippedReason: null })
}

/** Take a planned meal off the calendar and put it back on the wishlist. */
export async function unplanServing(id: ID): Promise<void> {
  await store.patch('servings', id, { status: 'wishlist', plannedDate: null, plannedSlot: null })
}

export async function skipServing(id: ID, reason?: string): Promise<void> {
  await store.patch('servings', id, { status: 'skipped', skippedReason: reason?.trim() || null })
}

/** Bring a skipped serving back to the wishlist. */
export async function reviveServing(id: ID): Promise<void> {
  await store.patch('servings', id, { status: 'wishlist', skippedReason: null, plannedDate: null, plannedSlot: null })
}

/** The Chef says: it is on the table. */
export async function markServed(id: ID): Promise<void> {
  const { memberId } = await me()
  const serving = await db.servings.get(id)
  await store.patch('servings', id, { status: 'served', servedAt: nowIso(), cookedBy: serving?.cookedBy ?? memberId })
}

export async function updateServingNote(id: ID, note: string): Promise<void> {
  await store.patch('servings', id, { note: note.trim() || null })
}

export async function removeServing(id: ID): Promise<void> {
  await store.remove('servings', id)
}

// ---------------------------------------------------------------- profile --

export type ProfileChanges = Partial<Pick<Member, 'name' | 'avatar' | 'color' | 'accessory' | 'status' | 'defaultRole'>>

export async function updateMyProfile(changes: ProfileChanges): Promise<void> {
  const { memberId } = await me()
  const clean: ProfileChanges = { ...changes }
  if (typeof clean.name === 'string') clean.name = clean.name.trim().slice(0, 40)
  if (typeof clean.status === 'string') clean.status = clean.status.trim().slice(0, 60) || null
  await store.patch('members', memberId, clean)
}

export async function renameKitchen(name: string): Promise<void> {
  const { householdId } = await me()
  await store.patch('households', householdId, { name: name.trim().slice(0, 80) })
}
