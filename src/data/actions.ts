// Everything the app can do to the kitchen's data. Screens call these; they never
// write to the database directly. Each action updates the phone at once and queues
// the change for the cloud.

import { generateKeyBetween } from 'fractional-indexing'
import { backend, db, isDemo, store } from './app'
import { exportKitchen, importBackup as importOpened, openBackup as openFile, type ExportOptions, type ExportResult, type ImportResult, type OpenedBackup } from './backupFile'
import { savePhoto, type PreparedImage } from './photos'
import { byCriterionOrder, byPriority } from './queries'
import { newId, nowIso, type Criterion, type Day, type Dish, type ID, type ISO, type Member, type Menu, type MenuCourse, type PhotoSource, type ProofPhoto, type Reaction, type Review, type Score5, type Serving, type Slot } from './types'

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
  /** Straight onto the calendar: for a meal that is decided on the spot, without a wish first. */
  plan?: { date: Day; slot: Slot }
}

/** Put a dish or menu on the wishlist, at the bottom. With a plan it goes onto the calendar in the same step. */
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
    status: input.plan ? 'planned' : 'wishlist',
    plannedDate: input.plan?.date ?? null,
    plannedSlot: input.plan?.slot ?? null,
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

/** Bring a skipped serving back to the wishlist. If it had been on the table before it was skipped, that is forgotten. */
export async function reviveServing(id: ID): Promise<void> {
  await store.patch('servings', id, { status: 'wishlist', skippedReason: null, plannedDate: null, plannedSlot: null, servedAt: null })
}

/**
 * Somebody else cooks after all. The hearts start over, because they belong to whoever
 * eats. Once a verdict has been started the roles stay: throws ActionError('cook_fixed').
 */
export async function setCook(id: ID, cookId: ID): Promise<void> {
  const serving = await servingOrThrow(id)
  if ((serving.cookedBy ?? serving.proposedBy) === cookId) return
  if ((await reviewsOf(id)).length > 0) throw new ActionError('cook_fixed')
  await store.patch('servings', id, { cookedBy: cookId, craving: null })
}

/** The Chef says: it is on the table. */
export async function markServed(id: ID): Promise<void> {
  const { memberId } = await me()
  const serving = await db.servings.get(id)
  await store.patch('servings', id, { status: 'served', servedAt: nowIso(), cookedBy: serving?.cookedBy ?? memberId })
}

/** A mis-tap: the meal is not on the table yet. Back to planned, as if "Served" never happened. */
export async function undoServed(id: ID, fallbackDay: Day): Promise<void> {
  const serving = await db.servings.get(id)
  if (serving?.status !== 'served') return
  await store.patch('servings', id, { status: 'planned', servedAt: null, plannedDate: serving.plannedDate ?? fallbackDay, plannedSlot: serving.plannedSlot ?? 'dinner' })
}

export async function updateServingNote(id: ID, note: string): Promise<void> {
  await store.patch('servings', id, { note: note.trim() || null })
}

/**
 * Take a meal away for good, with its photos and what was said about it. An eaten meal
 * can only go while its verdict can still be changed: after the seal it is history and
 * this throws ActionError('review_sealed').
 */
export async function removeServing(id: ID): Promise<void> {
  const serving = await db.servings.get(id)
  if (!serving || serving.deletedAt) return
  const reviews = await reviewsOf(id)
  if (serving.status === 'eaten' && reviews.some((review) => isSealed(review))) throw new ActionError('review_sealed')
  // A sealed verdict of a meal that never happened stays where it is (the cloud would not let it go) and counts nowhere.
  for (const review of reviews) if (!isSealed(review)) await store.remove('reviews', review.id)
  for (const photo of serving.proofPhotos) if (await db.photos.get(photo.photoId)) await store.remove('photos', photo.photoId)
  await store.remove('servings', id)
}

// ------------------------------------------------ serve, proof and review --

/** Why an action said no. Screens turn the code into words. */
export class ActionError extends Error {
  readonly code:
    | 'serving_missing'
    | 'proof_missing'
    | 'reaction_missing'
    | 'review_sealed'
    | 'review_missing'
    | 'cook_fixed'
    | 'criterion_missing'
    | 'criterion_unnamed'
    | 'criterion_twice'
    | 'criterion_used'

  constructor(code: ActionError['code']) {
    super(code)
    this.name = 'ActionError'
    this.code = code
  }
}

const SEAL_AFTER_MS = 24 * 3_600_000

/** After this the Taster's verdict is frozen. The cloud enforces the same rule. */
export function isSealed(review: Pick<Review, 'sealedAt'>, now: number = Date.now()): boolean {
  return review.sealedAt !== null && Date.parse(review.sealedAt) <= now
}

/**
 * One fixed id for "this person's review of this dish at this meal". Two devices of the
 * same person can then never make two reviews: they both write the same row.
 */
export async function reviewIdFor(servingId: ID, dishId: ID, reviewerId: ID): Promise<ID> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`review:${servingId}:${dishId}:${reviewerId}`)))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // a name-based id (version 5 layout)
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The dishes that get their own verdict at this meal: the dish itself, or every course of the menu. */
export async function reviewDishes(serving: Pick<Serving, 'dishId' | 'menuId'>): Promise<ID[]> {
  if (serving.dishId) return [serving.dishId]
  const menu = serving.menuId ? await db.menus.get(serving.menuId) : undefined
  return [...(menu?.courses ?? [])].sort((a, b) => a.order - b.order).map((c) => c.dishId)
}

async function servingOrThrow(id: ID): Promise<Serving> {
  const serving = await db.servings.get(id)
  if (!serving || serving.deletedAt) throw new ActionError('serving_missing')
  return serving
}

/** Everything that was said about one meal, by anyone. */
async function reviewsOf(servingId: ID): Promise<Review[]> {
  return (await db.reviews.where('servingId').equals(servingId).toArray()).filter((review) => !review.deletedAt)
}

export interface ProofInput {
  /** From prepareImage() in photos.ts, which the screen also needs for its preview. */
  image: PreparedImage
  source: PhotoSource
  /** When the picture was taken. Defaults to now. */
  takenAt?: ISO
  /** Set when the photo shows one course of a menu. */
  courseDishId?: ID
}

/** Proof or it didn't happen: attach a photo to the meal. */
export async function addProofPhoto(servingId: ID, input: ProofInput): Promise<ProofPhoto> {
  await servingOrThrow(servingId)
  const takenAt = input.takenAt ?? nowIso()
  const photo = await savePhoto(store, input.image, { kind: 'proof', source: input.source, takenAt })
  const entry: ProofPhoto = { photoId: photo.id, source: input.source, takenAt, ...(input.courseDishId ? { courseDishId: input.courseDishId } : {}) }
  const latest = await servingOrThrow(servingId)
  await store.patch('servings', servingId, { proofPhotos: [...latest.proofPhotos, entry] })
  return entry
}

export async function removeProofPhoto(servingId: ID, photoId: ID): Promise<void> {
  const serving = await servingOrThrow(servingId)
  await store.patch('servings', servingId, { proofPhotos: serving.proofPhotos.filter((p) => p.photoId !== photoId) })
  if (await db.photos.get(photoId)) await store.remove('photos', photoId)
}

/** What the Taster can say about a dish. Everything is optional: one tap on an emoji is a review. */
export type ReviewInput = Partial<Pick<Review, 'reaction' | 'extraReactions' | 'overall' | 'scores' | 'portionsEaten' | 'wouldEatAgain' | 'comment' | 'chips'>>

function tidyReview(input: ReviewInput): ReviewInput {
  const clean: ReviewInput = { ...input }
  if (typeof clean.comment === 'string') clean.comment = clean.comment.trim().slice(0, 500) || null
  if (clean.chips) clean.chips = [...new Set(clean.chips)]
  if (clean.extraReactions) clean.extraReactions = [...new Set(clean.extraReactions)]
  if (typeof clean.portionsEaten === 'number') clean.portionsEaten = Math.min(9, Math.max(0.5, Math.round(clean.portionsEaten * 2) / 2))
  return clean
}

/**
 * Write or change my verdict on one dish of a meal. It can be changed for 24 hours,
 * then it is sealed and this throws ActionError('review_sealed').
 */
export async function saveReview(servingId: ID, dishId: ID, input: ReviewInput): Promise<Review> {
  const { householdId, memberId } = await me()
  await servingOrThrow(servingId)
  const id = await reviewIdFor(servingId, dishId, memberId)
  const clean = tidyReview(input)
  const existing = await db.reviews.get(id)
  if (existing && !existing.deletedAt) {
    if (isSealed(existing)) throw new ActionError('review_sealed')
    await store.patch('reviews', id, clean)
    return { ...existing, ...clean }
  }
  const at = nowIso()
  const review: Review = {
    id,
    householdId,
    servingId,
    dishId,
    reviewerId: memberId,
    reaction: null,
    extraReactions: [],
    overall: null,
    scores: {},
    portionsEaten: 1,
    wouldEatAgain: null,
    comment: null,
    chips: [],
    chefSelfRating: null,
    chefReaction: null,
    chefExtraReactions: [],
    chefReply: null,
    sealedAt: new Date(Date.parse(at) + SEAL_AFTER_MS).toISOString(),
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...clean,
  }
  await store.put('reviews', review)
  return review
}

/** The fast path while still chewing: one emoji for the whole meal (every course of a menu). */
export async function reactToMeal(servingId: ID, reaction: Reaction): Promise<void> {
  const serving = await servingOrThrow(servingId)
  for (const dishId of await reviewDishes(serving)) await saveReview(servingId, dishId, { reaction })
}

/**
 * Done: the meal counts as eaten. Needs at least one proof photo (for a menu: one of the
 * whole table), and a reaction or a rating for every dish. eatenAt defaults to when the first proof photo was taken.
 */
export async function finishMeal(servingId: ID, eatenAt?: ISO): Promise<void> {
  const { memberId } = await me()
  const serving = await servingOrThrow(servingId)
  // A menu needs one picture of the whole table; pictures of single courses are extras.
  const proof = serving.menuId ? serving.proofPhotos.filter((p) => !p.courseDishId) : serving.proofPhotos
  if (proof.length === 0) throw new ActionError('proof_missing')
  for (const dishId of await reviewDishes(serving)) {
    const review = await db.reviews.get(await reviewIdFor(servingId, dishId, memberId))
    if (!review || review.deletedAt || (review.reaction === null && review.overall === null)) throw new ActionError('reaction_missing')
  }
  const at = eatenAt ?? [...serving.proofPhotos].sort((a, b) => a.takenAt.localeCompare(b.takenAt))[0].takenAt
  await store.patch('servings', servingId, { status: 'eaten', eatenAt: at, servedAt: serving.servedAt ?? at })
}

/** Correct when the meal was eaten (the proof photo's time is only a first guess). */
export async function setEatenAt(servingId: ID, eatenAt: ISO): Promise<void> {
  await servingOrThrow(servingId)
  await store.patch('servings', servingId, { eatenAt })
}

/** What the Chef can add to a review: a reaction, a reply, and her own guess at how it went. */
export type ChefAnswer = Partial<Pick<Review, 'chefReaction' | 'chefExtraReactions' | 'chefReply' | 'chefSelfRating'>>

/** The Chef answers, like under a post. Works on sealed reviews too. */
export async function answerReview(reviewId: ID, input: ChefAnswer): Promise<void> {
  const review = await db.reviews.get(reviewId)
  if (!review || review.deletedAt) throw new ActionError('review_missing')
  const clean: ChefAnswer = { ...input }
  if (typeof clean.chefReply === 'string') clean.chefReply = clean.chefReply.trim().slice(0, 500) || null
  if (clean.chefExtraReactions) clean.chefExtraReactions = [...new Set(clean.chefExtraReactions)]
  await store.patch('reviews', reviewId, clean)
}

// ---------------------------------------------------------------- profile --

export type ProfileChanges = Partial<Pick<Member, 'name' | 'avatar' | 'color' | 'accessory' | 'status' | 'defaultRole' | 'prefs'>>

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

// --------------------------------------------------------- review criteria --
//
// What the Taster rates with spoons on the review sheet. A criterion can be added,
// renamed, given another icon, moved and switched off. Switched off means "no longer
// asked": its old scores stay in the reviews and in the Cockpit. Only a criterion that
// was never rated can be removed for good.

export const CRITERION_LABEL_MAX = 40
/** The icon a criterion gets when none is chosen. */
export const CRITERION_DEFAULT_ICON = 'spoon'

const labelKey = (label: string): string => label.trim().toLowerCase()

async function criteriaInOrder(): Promise<Criterion[]> {
  return (await db.criteria.toArray()).filter((criterion) => !criterion.deletedAt).sort(byCriterionOrder)
}

async function criterionOrThrow(id: ID): Promise<Criterion> {
  const criterion = await db.criteria.get(id)
  if (!criterion || criterion.deletedAt) throw new ActionError('criterion_missing')
  return criterion
}

/** A tidy label, or an ActionError: criterion_unnamed when empty, criterion_twice when another one is called the same. */
async function freeLabel(label: string, exceptId?: ID): Promise<string> {
  const clean = label.trim().replace(/\s+/g, ' ').slice(0, CRITERION_LABEL_MAX)
  if (!clean) throw new ActionError('criterion_unnamed')
  if ((await criteriaInOrder()).some((other) => other.id !== exceptId && labelKey(other.label) === labelKey(clean))) throw new ActionError('criterion_twice')
  return clean
}

export interface CriterionInput {
  label: string
  icon?: string
}

/** Add a criterion at the end of the list. It is asked from the next review on. */
export async function addCriterion(input: CriterionInput): Promise<Criterion> {
  const { householdId } = await me()
  const label = await freeLabel(input.label)
  const last = (await criteriaInOrder()).at(-1)
  const criterion: Criterion = { ...fresh(householdId), label, icon: input.icon ?? CRITERION_DEFAULT_ICON, active: true, sortOrder: (last?.sortOrder ?? -1) + 1 }
  await store.put('criteria', criterion)
  return criterion
}

/** Rename a criterion or give it another icon. Old scores stay with it. */
export async function updateCriterion(id: ID, changes: Partial<CriterionInput>): Promise<void> {
  const criterion = await criterionOrThrow(id)
  const patch: Partial<Criterion> = {}
  if (changes.label !== undefined) {
    const label = await freeLabel(changes.label, id)
    if (label !== criterion.label) patch.label = label
  }
  if (changes.icon !== undefined && changes.icon !== criterion.icon) patch.icon = changes.icon
  await store.patch('criteria', id, patch)
}

/** Switch a criterion off (no longer asked, history stays) or on again. */
export async function setCriterionActive(id: ID, active: boolean): Promise<void> {
  const criterion = await criterionOrThrow(id)
  if (criterion.active !== active) await store.patch('criteria', id, { active })
}

/** Move a criterion to another place in the list (0 is the top). The review sheet asks in this order. */
export async function moveCriterion(id: ID, toIndex: number): Promise<void> {
  const list = await criteriaInOrder()
  const from = list.findIndex((criterion) => criterion.id === id)
  if (from < 0) throw new ActionError('criterion_missing')
  const to = Math.min(list.length - 1, Math.max(0, Math.round(toIndex)))
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  // Number the whole list afresh, send only the numbers that changed, and save them in
  // one step: saved one by one, two rows share a number for a moment and swap on screen.
  const renumbered = [...list.entries()].filter(([sortOrder, criterion]) => criterion.sortOrder !== sortOrder)
  await store.patchAll(
    'criteria',
    renumbered.map(([sortOrder, criterion]) => ({ id: criterion.id, changes: { sortOrder } })),
  )
}

/** How many reviews hold a score for this criterion. */
async function timesRated(id: ID): Promise<number> {
  return (await db.reviews.toArray()).filter((review) => !review.deletedAt && review.scores[id] !== undefined).length
}

/**
 * Remove a criterion for good. Only one that was never rated can go; anything with
 * history throws ActionError('criterion_used') and can be switched off instead.
 */
export async function removeCriterion(id: ID): Promise<void> {
  await criterionOrThrow(id)
  if ((await timesRated(id)) > 0) throw new ActionError('criterion_used')
  await store.remove('criteria', id)
}

// ------------------------------------------------------------------ backup --
//
// One file with everything in the kitchen (backupFile.ts packs and reads it, backup.ts
// holds the rules). People, PINs and devices are never part of it.

export type { ExportResult, ImportResult, OpenedBackup } from './backupFile'
export { BackupError } from './backup'

/** Pack the kitchen into one zip to keep. Works offline; photos this device does not hold are then left small or out. */
export async function exportBackup(options: ExportOptions): Promise<ExportResult> {
  // The demo kitchen has no cloud to fetch from: everything it has is on this device.
  return exportKitchen({ db, backend: isDemo ? null : backend }, options)
}

/** Read a backup file far enough to show what is in it and what importing it would do. Throws BackupError. */
export async function openBackup(file: Blob): Promise<OpenedBackup> {
  await me()
  return openFile(db, file, reviewIdFor)
}

/** Import an opened backup into this kitchen: merge by id, never delete, never touch people. */
export async function importBackup(opened: OpenedBackup, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  await me()
  return importOpened(store, opened, reviewIdFor, onProgress)
}
