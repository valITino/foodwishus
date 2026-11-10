// A backup of the kitchen, as plain data: what goes into the file, what counts as a file
// we can read, and what importing it into a kitchen would do. No database, no zip and no
// clock in here, so every rule can be tested with a handful of rows.
//
// The file itself (a zip holding backup.json and the photos) is put together and read in
// backupFile.ts.
//
// The rules of an import:
//   - People are never imported. The file only remembers who was who, so a review
//     still belongs to the right person in a kitchen with different profiles.
//   - Nothing is deleted and nothing newer is overwritten. A row the kitchen does not
//     have is added. A row it has is left alone unless the file's copy is newer. A row
//     that was deleted in the kitchen comes back.
//   - Every row is re-homed to the kitchen it is imported into.
//   - A row that points to something neither the file nor the kitchen has (a review
//     without its meal) is left out, because the cloud would refuse it.

import { toDay } from '../lib/dates'
import { nameKey } from './pin'
import type { Criterion, Day, Dish, Household, HouseholdSettings, ID, ISO, Member, Menu, Photo, Review, Role, Serving, TableRows } from './types'

export const BACKUP_FORMAT = 'foodwishus-backup'
/** Raise this when the file changes in a way an older app could not read. */
export const BACKUP_VERSION = 1

/** The tables a backup holds, in the order their rows are written: what others point to comes first. */
export const BACKUP_TABLES = ['criteria', 'photos', 'dishes', 'menus', 'servings', 'reviews'] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]
export type BackupRows = { [T in BackupTable]: TableRows[T][] }

export interface BackupPerson {
  id: ID
  name: string
  role: Role
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  /** The version of the app that wrote the file. */
  app: string
  madeAt: ISO
  kitchen: { id: ID; name: string; settings: HouseholdSettings }
  /** Who sat at the table. Used to tell whose dishes and reviews are whose, never to create anyone. */
  people: BackupPerson[]
  /** False for the small file without pictures. */
  withPhotos: boolean
  tables: BackupRows
}

export type BackupProblem =
  /** Not a zip, or a zip that is not one of ours. */
  | 'not_a_backup'
  /** Written by a newer version of the app than this one. */
  | 'too_new'
  /** One of ours, but something in it is missing or has the wrong shape. */
  | 'damaged'

export class BackupError extends Error {
  readonly code: BackupProblem
  /** For "damaged": where in the file, for example "dishes 4, name". */
  readonly where: string | null

  constructor(code: BackupProblem, where: string | null = null) {
    super(where ? `${code}: ${where}` : code)
    this.name = 'BackupError'
    this.code = code
    this.where = where
  }
}

// ------------------------------------------------------------------- export --

export interface KitchenSnapshot {
  household: Pick<Household, 'id' | 'name' | 'settings'>
  members: Member[]
  rows: BackupRows
}

export interface BuildOptions {
  app: string
  madeAt: ISO
  /** The photos whose image bytes go into the file. Null for a backup without photos. */
  photoIds: ReadonlySet<ID> | null
}

/**
 * Everything in the kitchen as one object. Deleted dishes, menus, meals and reviews come
 * along (still marked deleted), so nothing in the file points into the void. Deleted
 * criteria and photos stay behind, and so does every photo without image bytes.
 */
export function buildBackup(kitchen: KitchenSnapshot, options: BuildOptions): Backup {
  const home = kitchen.household.id
  const mine = <T extends { householdId: ID }>(rows: T[]): T[] => rows.filter((row) => row.householdId === home)
  const { rows } = kitchen
  const { photoIds } = options
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: options.app,
    madeAt: options.madeAt,
    kitchen: { id: home, name: kitchen.household.name, settings: kitchen.household.settings ?? {} },
    people: mine(kitchen.members)
      .filter((member) => !member.deletedAt)
      .map((member) => ({ id: member.id, name: member.name, role: member.defaultRole })),
    withPhotos: photoIds !== null,
    tables: {
      criteria: mine(rows.criteria).filter((row) => !row.deletedAt),
      photos: photoIds ? mine(rows.photos).filter((row) => !row.deletedAt && photoIds.has(row.id)) : [],
      dishes: mine(rows.dishes),
      menus: mine(rows.menus),
      servings: mine(rows.servings),
      reviews: mine(rows.reviews),
    },
  }
}

/** foodwishus-backup-2026-11-10.zip, with the day in Zurich. */
export function backupFileName(madeAt: ISO): string {
  return `${BACKUP_FORMAT}-${toDay(madeAt)}.zip`
}

/** Where a photo's image bytes sit inside the zip. */
export const photoEntry = (photoId: ID, variant: 'full' | 'thumb'): string => `photos/${photoId}${variant === 'thumb' ? '_t' : ''}.jpg`

/** The other way round: which photo, and which size, a zip entry holds. Null for anything else. */
export function photoOfEntry(name: string): { photoId: ID; variant: 'full' | 'thumb' } | null {
  const match = /^photos\/([0-9a-f-]{36})(_t)?\.jpg$/i.exec(name)
  return match ? { photoId: match[1].toLowerCase(), variant: match[2] ? 'thumb' : 'full' } : null
}

export interface BackupSummary {
  kitchenName: string
  madeAt: ISO
  dishes: number
  menus: number
  /** Meals that were eaten. */
  meals: number
  /** Wishes and plans: everything that is still to come. */
  wishes: number
  reviews: number
  photos: number
  withPhotos: boolean
  /** The days of the first and the last meal eaten. */
  firstMeal: Day | null
  lastMeal: Day | null
}

/** What a backup holds, in the numbers people ask about. Deleted rows do not count. */
export function summarize(backup: Backup): BackupSummary {
  const alive = <T extends { deletedAt: ISO | null }>(rows: T[]): T[] => rows.filter((row) => !row.deletedAt)
  const servings = alive(backup.tables.servings)
  const eaten = servings.filter((serving) => serving.status === 'eaten')
  const days = eaten.flatMap((serving) => (serving.eatenAt ? [toDay(serving.eatenAt)] : [])).sort()
  return {
    kitchenName: backup.kitchen.name,
    madeAt: backup.madeAt,
    dishes: alive(backup.tables.dishes).length,
    menus: alive(backup.tables.menus).length,
    meals: eaten.length,
    wishes: servings.filter((serving) => serving.status === 'wishlist' || serving.status === 'planned' || serving.status === 'served').length,
    reviews: alive(backup.tables.reviews).length,
    photos: backup.tables.photos.length,
    withPhotos: backup.withPhotos,
    firstMeal: days[0] ?? null,
    lastMeal: days.at(-1) ?? null,
  }
}

// ----------------------------------------------------------------- validate --

type Obj = Record<string, unknown>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const COURSES = ['starter', 'main', 'side', 'dessert', 'breakfast', 'snack', 'drink'] as const
const EFFORTS = ['easy', 'medium', 'fancy'] as const
const SLOTS = ['breakfast', 'lunch', 'dinner', 'dessert'] as const
const STATUSES = ['wishlist', 'planned', 'served', 'eaten', 'skipped'] as const
const PHOTO_KINDS = ['proof', 'cover', 'step', 'avatar'] as const
const PHOTO_SOURCES = ['camera', 'gallery'] as const

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value)
const isIso = (value: unknown): value is ISO => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const isId = (value: unknown): value is ID => typeof value === 'string' && UUID.test(value)

/** Reads fields out of one row and says exactly where it hurts when one is wrong. */
class Reader {
  constructor(
    private readonly row: Obj,
    private readonly where: string,
  ) {}

  private bad(key: string): never {
    throw new BackupError('damaged', `${this.where}, ${key}`)
  }

  private get(key: string): unknown {
    return this.row[key]
  }

  str(key: string, max?: number): string {
    const value = this.get(key)
    if (typeof value !== 'string') return this.bad(key)
    return max ? value.slice(0, max) : value
  }

  /** A string that must say something. */
  name(key: string, max: number): string {
    const value = this.str(key).trim().slice(0, max)
    return value ? value : this.bad(key)
  }

  strOrNull(key: string): string | null {
    const value = this.get(key)
    if (value === null || value === undefined) return null
    return typeof value === 'string' ? value : this.bad(key)
  }

  id(key: string): ID {
    const value = this.get(key)
    return isId(value) ? value.toLowerCase() : this.bad(key)
  }

  idOrNull(key: string): ID | null {
    const value = this.get(key)
    if (value === null || value === undefined) return null
    return isId(value) ? value.toLowerCase() : this.bad(key)
  }

  iso(key: string): ISO {
    const value = this.get(key)
    return isIso(value) ? value : this.bad(key)
  }

  isoOrNull(key: string): ISO | null {
    const value = this.get(key)
    if (value === null || value === undefined) return null
    return isIso(value) ? value : this.bad(key)
  }

  bool(key: string, fallback?: boolean): boolean {
    const value = this.get(key)
    if (value === undefined && fallback !== undefined) return fallback
    return typeof value === 'boolean' ? value : this.bad(key)
  }

  boolOrNull(key: string): boolean | null {
    const value = this.get(key)
    if (value === null || value === undefined) return null
    return typeof value === 'boolean' ? value : this.bad(key)
  }

  num(key: string): number {
    const value = this.get(key)
    return typeof value === 'number' && Number.isFinite(value) ? value : this.bad(key)
  }

  numOrNull(key: string): number | null {
    const value = this.get(key)
    if (value === null || value === undefined) return null
    return typeof value === 'number' && Number.isFinite(value) ? value : this.bad(key)
  }

  /** A whole number from min to max, or null. */
  scoreOrNull<T extends number>(key: string, min: number, max: number): T | null {
    const value = this.numOrNull(key)
    if (value === null) return null
    return Number.isInteger(value) && value >= min && value <= max ? (value as T) : this.bad(key)
  }

  oneOf<T extends string>(key: string, choices: readonly T[]): T {
    const value = this.get(key)
    return typeof value === 'string' && (choices as readonly string[]).includes(value) ? (value as T) : this.bad(key)
  }

  oneOfOrNull<T extends string>(key: string, choices: readonly T[]): T | null {
    const value = this.get(key)
    if (value === null || value === undefined) return null
    return this.oneOf(key, choices)
  }

  strings(key: string): string[] {
    const value = this.get(key)
    if (value === undefined) return []
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...(value as string[])] : this.bad(key)
  }

  obj(key: string): Obj {
    const value = this.get(key)
    if (value === undefined || value === null) return {}
    return isObj(value) ? value : this.bad(key)
  }

  list(key: string): Obj[] {
    const value = this.get(key)
    if (value === undefined) return []
    return Array.isArray(value) && value.every(isObj) ? (value as Obj[]) : this.bad(key)
  }

  /** Check something this reader has no method for. */
  must(ok: boolean, key: string): void {
    if (!ok) this.bad(key)
  }

  base(): { id: ID; householdId: ID; createdAt: ISO; updatedAt: ISO; deletedAt: ISO | null } {
    return { id: this.id('id'), householdId: this.id('householdId'), createdAt: this.iso('createdAt'), updatedAt: this.iso('updatedAt'), deletedAt: this.isoOrNull('deletedAt') }
  }
}

const optionalNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

function readCriterion(r: Reader): Criterion {
  return { ...r.base(), label: r.name('label', 40), icon: r.strOrNull('icon') ?? 'spoon', active: r.bool('active', true), sortOrder: Math.round(r.num('sortOrder')) }
}

function readDish(r: Reader): Dish {
  const recipe = r.obj('recipe')
  const nutrition = r.obj('nutrition')
  r.must(recipe.ingredients === undefined || (Array.isArray(recipe.ingredients) && recipe.ingredients.every((item) => isObj(item) && typeof item.name === 'string')), 'recipe.ingredients')
  r.must(recipe.steps === undefined || (Array.isArray(recipe.steps) && recipe.steps.every((item) => isObj(item) && typeof item.text === 'string')), 'recipe.steps')
  const steps = recipe.steps as Obj[] | undefined
  const ingredients = recipe.ingredients as Obj[] | undefined
  return {
    ...r.base(),
    name: r.name('name', 120),
    description: r.strOrNull('description'),
    course: r.oneOf('course', COURSES),
    tags: r.strings('tags'),
    effort: r.oneOfOrNull('effort', EFFORTS),
    recipe: clean({
      servings: optionalNumber(recipe.servings),
      prepMinutes: optionalNumber(recipe.prepMinutes),
      cookMinutes: optionalNumber(recipe.cookMinutes),
      ingredients: ingredients?.map((item) => clean({ quantity: optionalNumber(item.quantity), unit: optionalString(item.unit), name: item.name as string })),
      steps: steps?.map((item) => clean({ text: item.text as string, timerSeconds: optionalNumber(item.timerSeconds), photoId: isId(item.photoId) ? item.photoId.toLowerCase() : undefined })),
      notes: optionalString(recipe.notes),
      sourceUrl: optionalString(recipe.sourceUrl),
    }),
    nutrition: clean({
      kcalPerServing: optionalNumber(nutrition.kcalPerServing),
      proteinG: optionalNumber(nutrition.proteinG),
      carbsG: optionalNumber(nutrition.carbsG),
      fatG: optionalNumber(nutrition.fatG),
      isEstimate: typeof nutrition.isEstimate === 'boolean' ? nutrition.isEstimate : undefined,
    }),
    coverPhotoId: r.idOrNull('coverPhotoId'),
    icon: r.strOrNull('icon'),
    createdBy: r.idOrNull('createdBy'),
    archived: r.bool('archived', false),
  }
}

function readMenu(r: Reader): Menu {
  const courses = r.list('courses')
  r.must(
    courses.every((course) => isId(course.dishId) && typeof course.order === 'number'),
    'courses',
  )
  return {
    ...r.base(),
    name: r.name('name', 120),
    description: r.strOrNull('description'),
    courses: courses.map((course) => ({ dishId: (course.dishId as string).toLowerCase(), order: course.order as number })),
    createdBy: r.idOrNull('createdBy'),
    archived: r.bool('archived', false),
  }
}

function readServing(r: Reader): Serving {
  const proofs = r.list('proofPhotos')
  r.must(
    proofs.every((proof) => isId(proof.photoId) && isIso(proof.takenAt) && (PHOTO_SOURCES as readonly unknown[]).includes(proof.source) && (proof.courseDishId === undefined || isId(proof.courseDishId))),
    'proofPhotos',
  )
  const suggestedDays = r.strings('suggestedDays')
  r.must(
    suggestedDays.every((day) => DAY.test(day)),
    'suggestedDays',
  )
  const plannedDate = r.strOrNull('plannedDate')
  r.must(plannedDate === null || DAY.test(plannedDate), 'plannedDate')
  const priority = r.str('priority')
  r.must(priority.length > 0, 'priority')
  return {
    ...r.base(),
    dishId: r.idOrNull('dishId'),
    menuId: r.idOrNull('menuId'),
    proposedBy: r.idOrNull('proposedBy'),
    cookedBy: r.idOrNull('cookedBy'),
    proposedAt: r.iso('proposedAt'),
    note: r.strOrNull('note'),
    suggestedDays,
    craving: r.scoreOrNull('craving', 1, 5),
    priority,
    status: r.oneOf('status', STATUSES),
    plannedDate,
    plannedSlot: r.oneOfOrNull('plannedSlot', SLOTS),
    servedAt: r.isoOrNull('servedAt'),
    eatenAt: r.isoOrNull('eatenAt'),
    skippedReason: r.strOrNull('skippedReason'),
    proofPhotos: proofs.map((proof) => ({
      photoId: (proof.photoId as string).toLowerCase(),
      source: proof.source as Serving['proofPhotos'][number]['source'],
      takenAt: proof.takenAt as ISO,
      ...(proof.courseDishId ? { courseDishId: (proof.courseDishId as string).toLowerCase() } : {}),
    })),
  }
}

function readReview(r: Reader): Review {
  const scores = r.obj('scores')
  r.must(
    Object.entries(scores).every(([id, score]) => isId(id) && typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5),
    'scores',
  )
  const portionsEaten = r.num('portionsEaten')
  r.must(portionsEaten > 0 && portionsEaten <= 9, 'portionsEaten')
  return {
    ...r.base(),
    servingId: r.id('servingId'),
    dishId: r.idOrNull('dishId'),
    reviewerId: r.idOrNull('reviewerId'),
    reaction: r.scoreOrNull('reaction', 1, 6),
    extraReactions: r.strings('extraReactions') as Review['extraReactions'],
    overall: r.scoreOrNull('overall', 1, 5),
    scores: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id.toLowerCase(), score])) as Review['scores'],
    portionsEaten,
    wouldEatAgain: r.boolOrNull('wouldEatAgain'),
    comment: r.strOrNull('comment'),
    chips: r.strings('chips'),
    chefSelfRating: r.scoreOrNull('chefSelfRating', 1, 5),
    chefReaction: r.scoreOrNull('chefReaction', 1, 6),
    chefExtraReactions: r.strings('chefExtraReactions') as Review['chefExtraReactions'],
    chefReply: r.strOrNull('chefReply'),
    sealedAt: r.isoOrNull('sealedAt'),
  }
}

function readPhoto(r: Reader): Photo {
  return {
    ...r.base(),
    kind: r.oneOf('kind', PHOTO_KINDS),
    width: r.numOrNull('width'),
    height: r.numOrNull('height'),
    bytes: r.numOrNull('bytes'),
    source: r.oneOfOrNull('source', PHOTO_SOURCES),
    takenAt: r.isoOrNull('takenAt'),
    createdBy: r.idOrNull('createdBy'),
    uploaded: r.bool('uploaded', false),
  }
}

/** Drop the keys that are undefined, so an optional field is either there or not. */
function clean<T extends Obj>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> }
}

const READERS: { [T in BackupTable]: (reader: Reader) => TableRows[T] } = {
  criteria: readCriterion,
  photos: readPhoto,
  dishes: readDish,
  menus: readMenu,
  servings: readServing,
  reviews: readReview,
}

function readTable<T extends BackupTable>(tables: Obj, table: T): TableRows[T][] {
  const rows = tables[table]
  if (!Array.isArray(rows)) throw new BackupError('damaged', table)
  const seen = new Set<ID>()
  return rows.map((row, index) => {
    const where = `${table} ${index + 1}`
    if (!isObj(row)) throw new BackupError('damaged', where)
    const read = READERS[table](new Reader(row, where))
    if (seen.has(read.id)) throw new BackupError('damaged', `${where}, id`)
    seen.add(read.id)
    return read
  })
}

/**
 * Turn what was read from backup.json into a Backup, or throw a BackupError that says
 * why not. Every row is rebuilt from the fields this version knows, so nothing odd in a
 * file can travel on to the cloud.
 */
export function parseBackup(value: unknown): Backup {
  if (!isObj(value) || value.format !== BACKUP_FORMAT) throw new BackupError('not_a_backup')
  const { version } = value
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new BackupError('damaged', 'version')
  if (version > BACKUP_VERSION) throw new BackupError('too_new')
  if (!isIso(value.madeAt)) throw new BackupError('damaged', 'madeAt')
  if (!isObj(value.kitchen) || !isId(value.kitchen.id) || typeof value.kitchen.name !== 'string') throw new BackupError('damaged', 'kitchen')
  if (!Array.isArray(value.people) || !value.people.every((person) => isObj(person) && isId(person.id) && typeof person.name === 'string' && (person.role === 'chef' || person.role === 'taster'))) {
    throw new BackupError('damaged', 'people')
  }
  if (!isObj(value.tables)) throw new BackupError('damaged', 'tables')
  const tables = value.tables
  const settings = isObj(value.kitchen.settings) ? value.kitchen.settings : {}
  const labels = isObj(settings.reactionLabels) ? Object.fromEntries(Object.entries(settings.reactionLabels).filter(([key, label]) => /^[1-6]$/.test(key) && typeof label === 'string')) : undefined
  return {
    format: BACKUP_FORMAT,
    version,
    app: typeof value.app === 'string' ? value.app : '',
    madeAt: value.madeAt,
    kitchen: { id: value.kitchen.id.toLowerCase(), name: value.kitchen.name, settings: labels && Object.keys(labels).length > 0 ? { reactionLabels: labels as Record<string, string> } : {} },
    people: (value.people as Obj[]).map((person) => ({ id: (person.id as string).toLowerCase(), name: person.name as string, role: person.role as Role })),
    withPhotos: value.withPhotos !== false,
    tables: {
      criteria: readTable(tables, 'criteria'),
      photos: readTable(tables, 'photos'),
      dishes: readTable(tables, 'dishes'),
      menus: readTable(tables, 'menus'),
      servings: readTable(tables, 'servings'),
      reviews: readTable(tables, 'reviews'),
    },
  }
}

// --------------------------------------------------------------------- plan --

export interface KitchenNow {
  householdId: ID
  settings: HouseholdSettings
  /** The people at the table (not deleted). */
  members: Pick<Member, 'id' | 'name' | 'defaultRole'>[]
  /** Every row on this device, deleted ones too. */
  rows: BackupRows
}

/** new: the kitchen does not have it. newer: the file's copy is newer. back: it was deleted here and returns. */
export type WriteReason = 'new' | 'newer' | 'back'

export type PlannedWrite = { [T in BackupTable]: { table: T; row: TableRows[T]; reason: WriteReason } }[BackupTable]

export interface TableCount {
  /** Not in the kitchen yet. */
  add: number
  /** In the kitchen, but the file's copy is newer. */
  update: number
  /** Deleted in the kitchen, alive in the file. */
  back: number
  /** In the kitchen already, as new as the file's copy or newer. */
  keep: number
}

export interface ImportPlan {
  /** True when the file was made in the kitchen it is being imported into. */
  sameKitchen: boolean
  /** What to write, in order. Photos carry their image bytes in the file. */
  writes: PlannedWrite[]
  /** Per table, counting only rows people can see (not the deleted ones that come along). */
  counts: Record<BackupTable, TableCount>
  /** Rows left out because what they belong to is missing, for example a review without its meal. */
  leftOut: number
  /** The kitchen's own names for the reactions, taken over when this kitchen has none. */
  settings: HouseholdSettings | null
}

export interface PlanOptions {
  /** The photos whose image bytes are really in the file. Photo rows without bytes are left out. */
  photosInFile: ReadonlySet<ID>
  /** The fixed id of one person's review of one dish at one meal (reviewIdFor in actions.ts). */
  reviewId: (servingId: ID, dishId: ID, reviewerId: ID) => Promise<ID>
}

/**
 * Who in this kitchen each person in the file is: the same profile, else the same name,
 * else the only free seat with the same role, else the last free seat. Null when nobody fits.
 */
export function matchPeople(people: BackupPerson[], members: KitchenNow['members']): Map<ID, ID | null> {
  const match = new Map<ID, ID | null>()
  const taken = new Set<ID>()
  const free = () => members.filter((member) => !taken.has(member.id))
  const open = () => people.filter((person) => !match.has(person.id))
  const pair = (person: BackupPerson, member: { id: ID } | undefined) => {
    if (!member) return
    match.set(person.id, member.id)
    taken.add(member.id)
  }
  for (const person of open())
    pair(
      person,
      free().find((member) => member.id === person.id),
    )
  for (const person of open())
    pair(
      person,
      free().find((member) => nameKey(member.name) === nameKey(person.name)),
    )
  for (const person of open()) {
    const sameRole = free().filter((member) => member.defaultRole === person.role)
    const others = open().filter((other) => other.role === person.role)
    if (sameRole.length === 1 && others.length === 1) pair(person, sameRole[0])
  }
  if (open().length === 1 && free().length === 1) pair(open()[0], free()[0])
  for (const person of open()) match.set(person.id, null)
  return match
}

const emptyCount = (): TableCount => ({ add: 0, update: 0, back: 0, keep: 0 })
const labelKey = (label: string): string => label.trim().toLowerCase()

/** Work out what importing this backup into this kitchen would do. Changes nothing. */
export async function planImport(backup: Backup, now: KitchenNow, options: PlanOptions): Promise<ImportPlan> {
  const sameKitchen = backup.kitchen.id === now.householdId
  const people = matchPeople(backup.people, now.members)
  /** Somebody who is not in the file's list (they left before it was made) is nobody here. */
  const person = (id: ID | null): ID | null => (id === null ? null : (people.get(id) ?? now.members.find((member) => member.id === id)?.id ?? null))

  const planned = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])) as unknown as { [T in BackupTable]: PlannedWrite[] }
  const counts = Object.fromEntries(BACKUP_TABLES.map((table) => [table, emptyCount()])) as Record<BackupTable, TableCount>
  let leftOut = 0

  const have = Object.fromEntries(BACKUP_TABLES.map((table) => [table, new Map(now.rows[table].map((row) => [row.id, row]))])) as unknown as { [T in BackupTable]: Map<ID, TableRows[T]> }

  /** Decide what happens to one row and note it. Returns why it is written, or null when the kitchen's copy stays. */
  function settle<T extends BackupTable>(table: T, row: TableRows[T]): WriteReason | null {
    const local = have[table].get(row.id)
    const visible = !row.deletedAt
    let reason: WriteReason | null = null
    if (!local) reason = 'new'
    else if (!visible) reason = null // the kitchen has it and the file says "deleted": an import never deletes
    else if (local.deletedAt) reason = 'back'
    else if (Date.parse(row.updatedAt) > Date.parse(local.updatedAt)) reason = 'newer'

    if (reason) planned[table].push({ table, row, reason } as PlannedWrite)
    if (visible) {
      const count = counts[table]
      if (reason === 'new') count.add += 1
      else if (reason === 'newer') count.update += 1
      else if (reason === 'back') count.back += 1
      else count.keep += 1
    }
    return reason
  }

  // Criteria. A kitchen that already asks about "Taste" does not get a second "Taste":
  // the file's scores are counted under the one that is here.
  const criterion = new Map<ID, ID>()
  const byLabel = new Map(now.rows.criteria.filter((row) => !row.deletedAt).map((row) => [labelKey(row.label), row.id]))
  let nextOrder = now.rows.criteria.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
  for (const row of [...backup.tables.criteria].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (row.deletedAt) continue
    const twin = have.criteria.has(row.id) ? row.id : byLabel.get(labelKey(row.label))
    if (twin && twin !== row.id) {
      criterion.set(row.id, twin)
      counts.criteria.keep += 1
      continue
    }
    criterion.set(row.id, row.id)
    const homed = { ...row, householdId: now.householdId }
    settle('criteria', have.criteria.has(row.id) ? homed : { ...homed, sortOrder: nextOrder++ })
    byLabel.set(labelKey(row.label), row.id)
  }

  // Photos that will be in the kitchen afterwards: the ones it has, and the ones whose
  // pictures are in the file. Anything that points to another photo loses the pointer.
  const filePhotos = backup.tables.photos.filter((row) => !row.deletedAt && options.photosInFile.has(row.id))
  const photos = new Set<ID>([...now.rows.photos.filter((row) => !row.deletedAt).map((row) => row.id), ...filePhotos.map((row) => row.id)])
  /** Photos that something written by this import shows. */
  const shown = new Set<ID>()

  const dishes = new Set<ID>(have.dishes.keys())
  for (const row of backup.tables.dishes) {
    const steps = row.recipe.steps?.map((step) => (step.photoId && !photos.has(step.photoId) ? { text: step.text, ...(step.timerSeconds === undefined ? {} : { timerSeconds: step.timerSeconds }) } : step))
    const dish: Dish = {
      ...row,
      householdId: now.householdId,
      createdBy: person(row.createdBy),
      coverPhotoId: row.coverPhotoId && photos.has(row.coverPhotoId) ? row.coverPhotoId : null,
      recipe: steps ? { ...row.recipe, steps } : row.recipe,
    }
    if (settle('dishes', dish)) {
      if (dish.coverPhotoId) shown.add(dish.coverPhotoId)
      for (const step of dish.recipe.steps ?? []) if (step.photoId) shown.add(step.photoId)
    }
    dishes.add(row.id)
  }

  const menus = new Set<ID>(have.menus.keys())
  for (const row of backup.tables.menus) {
    settle('menus', { ...row, householdId: now.householdId, createdBy: person(row.createdBy) })
    menus.add(row.id)
  }

  const servings = new Set<ID>(have.servings.keys())
  for (const row of backup.tables.servings) {
    const dishId = row.dishId && dishes.has(row.dishId) ? row.dishId : null
    const menuId = row.menuId && menus.has(row.menuId) ? row.menuId : null
    if (!dishId && !menuId) {
      if (!have.servings.has(row.id) && !row.deletedAt) leftOut += 1
      continue
    }
    const serving: Serving = {
      ...row,
      householdId: now.householdId,
      dishId,
      menuId,
      proposedBy: person(row.proposedBy),
      cookedBy: person(row.cookedBy),
      proofPhotos: row.proofPhotos.filter((proof) => photos.has(proof.photoId)),
    }
    if (settle('servings', serving)) for (const proof of serving.proofPhotos) shown.add(proof.photoId)
    servings.add(row.id)
  }

  for (const row of backup.tables.reviews) {
    if (!servings.has(row.servingId) || !row.dishId || !dishes.has(row.dishId)) {
      if (!have.reviews.has(row.id) && !row.deletedAt) leftOut += 1
      continue
    }
    const reviewerId = person(row.reviewerId)
    // A review's id is made from who reviewed what. Under another profile it gets that
    // profile's id, so the person can still change it and never ends up with two.
    const id = reviewerId && reviewerId !== row.reviewerId ? await options.reviewId(row.servingId, row.dishId, reviewerId) : row.id
    const scores: Review['scores'] = {}
    for (const [criterionId, score] of Object.entries(row.scores)) scores[criterion.get(criterionId) ?? criterionId] = score
    settle('reviews', { ...row, id, householdId: now.householdId, reviewerId, scores })
  }

  // Photos last, because only now it is known which deleted ones are wanted again.
  for (const row of backup.tables.photos) {
    if (row.deletedAt) continue
    const local = have.photos.get(row.id)
    if (!options.photosInFile.has(row.id)) {
      if (!local) leftOut += 1
      continue
    }
    // A photo the kitchen has keeps its own copy: pictures do not change once they are taken.
    if (local && !local.deletedAt) counts.photos.keep += 1
    // Deleted here on purpose, and nothing that comes back shows it: it stays deleted.
    else if (local && !shown.has(row.id)) continue
    else settle('photos', { ...row, householdId: now.householdId, createdBy: person(row.createdBy) })
  }

  const theirLabels = backup.kitchen.settings.reactionLabels ?? {}
  const ourLabels = now.settings.reactionLabels ?? {}
  const settings = Object.keys(theirLabels).length > 0 && Object.keys(ourLabels).length === 0 ? { ...now.settings, reactionLabels: theirLabels } : null

  return { sameKitchen, writes: BACKUP_TABLES.flatMap((table) => planned[table]), counts, leftOut, settings }
}

/** Nothing would change: everything in the file is in the kitchen already. */
export function planIsEmpty(plan: ImportPlan): boolean {
  return plan.writes.length === 0 && plan.settings === null
}
