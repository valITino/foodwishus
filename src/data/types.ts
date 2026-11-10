// The shared vocabulary of FoodwishUs. Every workstream imports from here.
// Rows are camelCase in the app and snake_case in Postgres (see case.ts).

export type ID = string
/** ISO 8601 timestamp, always UTC. */
export type ISO = string
/** Calendar day in Europe/Zurich, "2026-11-10". */
export type Day = string

export type Role = 'chef' | 'taster'
export type Course = 'starter' | 'main' | 'side' | 'dessert' | 'breakfast' | 'snack' | 'drink'
export type Effort = 'easy' | 'medium' | 'fancy'
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'dessert'
export type ServingStatus = 'wishlist' | 'planned' | 'served' | 'eaten' | 'skipped'
export type Score5 = 1 | 2 | 3 | 4 | 5
/** 1 Kitchen disaster … 6 Super delicious. */
export type Reaction = 1 | 2 | 3 | 4 | 5 | 6
export type ExtraReaction = 'love' | 'fire' | 'chef-queen' | 'needs-salt' | 'too-spicy' | 'again'
export type PhotoKind = 'proof' | 'cover' | 'step' | 'avatar'
export type PhotoSource = 'camera' | 'gallery'

/** Columns every synced row carries. updatedAt is the server's clock once synced. */
export interface SyncRow {
  id: ID
  householdId: ID
  createdAt: ISO
  updatedAt: ISO
  deletedAt: ISO | null
}

export interface HouseholdSettings {
  /** Custom labels for the six emoji reactions, keyed "1".."6". */
  reactionLabels?: Partial<Record<string, string>>
}

export interface Household {
  id: ID
  name: string
  settings: HouseholdSettings
  createdAt: ISO
  updatedAt: ISO
  deletedAt: ISO | null
}

/**
 * A person's own settings. They live on the profile, so they follow the person to every
 * phone and tablet they log in on.
 */
export interface MemberPrefs {
  theme?: 'auto' | 'light' | 'dark'
  lang?: 'en' | 'de'
  showCalories?: boolean
}

export interface Member extends SyncRow {
  name: string
  /** Which character the avatar shows, for example "fork" or "whisk". */
  avatar: string
  /** The colour of the avatar's plate. */
  color: string
  /** Something the avatar wears, for example "bow". */
  accessory: string | null
  /** A short line the partner sees, for example "Always Huuungryyyyy". At most 60 characters. */
  status: string | null
  defaultRole: Role
  prefs: MemberPrefs
  /** The person who opened the kitchen. Invites, pauses and lets the partner back in. */
  isAdmin: boolean
  /** Set while the admin has paused this profile: no log-in, no reading, no writing. */
  disabledAt: ISO | null
}

export interface Ingredient {
  quantity?: number
  unit?: string
  name: string
}

export interface Step {
  text: string
  timerSeconds?: number
  photoId?: ID
}

export interface Recipe {
  servings?: number
  prepMinutes?: number
  cookMinutes?: number
  ingredients?: Ingredient[]
  steps?: Step[]
  notes?: string
  sourceUrl?: string
}

export interface Nutrition {
  kcalPerServing?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  isEstimate?: boolean
}

export interface Dish extends SyncRow {
  name: string
  description: string | null
  course: Course
  tags: string[]
  effort: Effort | null
  recipe: Recipe
  nutrition: Nutrition
  coverPhotoId: ID | null
  icon: string | null
  createdBy: ID | null
  archived: boolean
}

export interface MenuCourse {
  dishId: ID
  order: number
}

export interface Menu extends SyncRow {
  name: string
  description: string | null
  courses: MenuCourse[]
  createdBy: ID | null
  archived: boolean
}

export interface ProofPhoto {
  photoId: ID
  source: PhotoSource
  takenAt: ISO
  /** Set when the photo shows one course of a menu. */
  courseDishId?: ID
}

export interface Serving extends SyncRow {
  dishId: ID | null
  menuId: ID | null
  proposedBy: ID | null
  cookedBy: ID | null
  proposedAt: ISO
  note: string | null
  suggestedDays: Day[]
  craving: Score5 | null
  /** Fractional index. Sort with plain string comparison, never localeCompare. */
  priority: string
  status: ServingStatus
  plannedDate: Day | null
  plannedSlot: Slot | null
  servedAt: ISO | null
  eatenAt: ISO | null
  skippedReason: string | null
  proofPhotos: ProofPhoto[]
}

export interface Review extends SyncRow {
  servingId: ID
  dishId: ID | null
  reviewerId: ID | null
  reaction: Reaction | null
  extraReactions: ExtraReaction[]
  overall: Score5 | null
  /** criterionId -> score */
  scores: Record<ID, Score5>
  portionsEaten: number
  wouldEatAgain: boolean | null
  comment: string | null
  chips: string[]
  chefSelfRating: Score5 | null
  chefReaction: Reaction | null
  chefExtraReactions: ExtraReaction[]
  chefReply: string | null
  /** After this moment the Taster's verdict is frozen (the server enforces it). */
  sealedAt: ISO | null
}

export interface Criterion extends SyncRow {
  label: string
  icon: string
  active: boolean
  sortOrder: number
}

export interface Photo extends SyncRow {
  kind: PhotoKind
  width: number | null
  height: number | null
  bytes: number | null
  source: PhotoSource | null
  takenAt: ISO | null
  createdBy: ID | null
  /** True once the image bytes are in cloud storage and the partner can fetch them. */
  uploaded: boolean
}

export interface TableRows {
  households: Household
  members: Member
  criteria: Criterion
  dishes: Dish
  menus: Menu
  servings: Serving
  reviews: Review
  photos: Photo
}

export type SyncTable = keyof TableRows

/** Order matters: parents before children, so a first sync never trips a foreign key. */
export const SYNC_TABLES: readonly SyncTable[] = [
  'households',
  'members',
  'criteria',
  'dishes',
  'menus',
  'servings',
  'reviews',
  'photos',
]

/** Tables the app may create rows in. Kitchens and members are made by pairing only. */
export const WRITABLE_TABLES: readonly SyncTable[] = ['criteria', 'dishes', 'menus', 'servings', 'reviews', 'photos']

export const newId = (): ID => crypto.randomUUID()
export const nowIso = (): ISO => new Date().toISOString()
