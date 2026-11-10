import { describe, expect, it } from 'vitest'
import { reviewIdFor } from '../../src/data/actions'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  buildBackup,
  matchPeople,
  parseBackup,
  photoEntry,
  photoOfEntry,
  planImport,
  planIsEmpty,
  summarize,
  type Backup,
  type BackupRows,
  type KitchenNow,
  type KitchenSnapshot,
} from '../../src/data/backup'
import type { Criterion, Dish, ID, Member, Menu, Photo, Review, Serving } from '../../src/data/types'

// A small kitchen with fixed ids, so every rule can be read off the page.
const uuid = (n: number): ID => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HOME = uuid(1)
const MIA = uuid(11)
const LEO = uuid(12)
const TASTE = uuid(21)
const LOOKS = uuid(22)
const ROSTI = uuid(31)
const ZOPF = uuid(32)
const BRUNCH = uuid(41)
const DINNER = uuid(51)
const WISH = uuid(52)
const VERDICT = uuid(61)
const PROOF = uuid(71)
const COVER = uuid(72)

const T0 = '2026-10-01T10:00:00.000Z'
const T1 = '2026-11-01T10:00:00.000Z'
const T2 = '2026-11-09T10:00:00.000Z'

const base = (id: ID, updatedAt = T0, householdId = HOME) => ({ id, householdId, createdAt: T0, updatedAt, deletedAt: null as string | null })

const member = (id: ID, name: string, role: 'chef' | 'taster', householdId = HOME): Member => ({ ...base(id, T0, householdId), name, avatar: 'fork', color: 'sage', accessory: null, status: 'Hungry', defaultRole: role, prefs: {}, isAdmin: role === 'taster', disabledAt: null })
const criterion = (id: ID, label: string, sortOrder: number, extra: Partial<Criterion> = {}): Criterion => ({ ...base(id), label, icon: 'spoon', active: true, sortOrder, ...extra })
const dish = (id: ID, name: string, extra: Partial<Dish> = {}): Dish => ({ ...base(id), name, description: null, course: 'main', tags: ['swiss'], effort: 'easy', recipe: { servings: 2, ingredients: [{ quantity: 500, unit: 'g', name: 'potatoes' }], steps: [{ text: 'Grate.' }, { text: 'Fry.', timerSeconds: 600 }] }, nutrition: { kcalPerServing: 520 }, coverPhotoId: null, icon: 'cloche', createdBy: MIA, archived: false, ...extra })
const menu = (id: ID, name: string, extra: Partial<Menu> = {}): Menu => ({ ...base(id), name, description: null, courses: [{ dishId: ZOPF, order: 0 }], createdBy: MIA, archived: false, ...extra })
const serving = (id: ID, extra: Partial<Serving> = {}): Serving => ({
  ...base(id),
  dishId: ROSTI,
  menuId: null,
  proposedBy: MIA,
  cookedBy: MIA,
  proposedAt: T0,
  note: null,
  suggestedDays: [],
  craving: 4,
  priority: 'a0',
  status: 'wishlist',
  plannedDate: null,
  plannedSlot: null,
  servedAt: null,
  eatenAt: null,
  skippedReason: null,
  proofPhotos: [],
  ...extra,
})
const review = (id: ID, extra: Partial<Review> = {}): Review => ({
  ...base(id),
  servingId: DINNER,
  dishId: ROSTI,
  reviewerId: LEO,
  reaction: 6,
  extraReactions: ['love'],
  overall: 5,
  scores: { [TASTE]: 5, [LOOKS]: 4 },
  portionsEaten: 1.5,
  wouldEatAgain: true,
  comment: 'Crispy.',
  chips: ['perfect'],
  chefSelfRating: 4,
  chefReaction: null,
  chefExtraReactions: [],
  chefReply: null,
  sealedAt: T1,
  ...extra,
})
const photo = (id: ID, kind: Photo['kind'], extra: Partial<Photo> = {}): Photo => ({ ...base(id), kind, width: 1600, height: 1200, bytes: 900, source: 'camera', takenAt: T0, createdBy: LEO, uploaded: true, ...extra })

function rows(): BackupRows {
  return {
    criteria: [criterion(TASTE, 'Taste', 0), criterion(LOOKS, 'Looks', 1)],
    photos: [photo(PROOF, 'proof'), photo(COVER, 'cover')],
    dishes: [dish(ROSTI, 'Rösti', { coverPhotoId: COVER }), dish(ZOPF, 'Zopf', { course: 'breakfast' })],
    menus: [menu(BRUNCH, 'Sunday brunch')],
    servings: [serving(DINNER, { status: 'eaten', servedAt: T1, eatenAt: T1, plannedDate: '2026-11-01', plannedSlot: 'dinner', proofPhotos: [{ photoId: PROOF, source: 'camera', takenAt: T1 }] }), serving(WISH, { dishId: null, menuId: BRUNCH, priority: 'a1' })],
    reviews: [review(VERDICT)],
  }
}

const snapshot = (): KitchenSnapshot => ({ household: { id: HOME, name: 'Casa Leo', settings: {} }, members: [member(MIA, 'Mia', 'chef'), member(LEO, 'Leo', 'taster')], rows: rows() })
const bothPhotos = new Set([PROOF, COVER])
const made = (photoIds: ReadonlySet<ID> | null = bothPhotos): Backup => buildBackup(snapshot(), { app: '0.1.0', madeAt: T2, photoIds })
/** What reading the file back gives: the same thing, through JSON and the validator. */
const reread = (backup: Backup): Backup => parseBackup(JSON.parse(JSON.stringify(backup)))

const empty = (): BackupRows => ({ criteria: [], photos: [], dishes: [], menus: [], servings: [], reviews: [] })
const sameKitchen = (changes: Partial<BackupRows> = {}): KitchenNow => ({ householdId: HOME, settings: {}, members: [member(MIA, 'Mia', 'chef'), member(LEO, 'Leo', 'taster')], rows: { ...rows(), ...changes } })
const plan = (backup: Backup, now: KitchenNow, photosInFile: ReadonlySet<ID> = bothPhotos) => planImport(backup, now, { photosInFile, reviewId: reviewIdFor })

describe('building a backup', () => {
  it('holds every table, the kitchen, a format version and the date', () => {
    const backup = made()
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION, app: '0.1.0', madeAt: T2, withPhotos: true, kitchen: { id: HOME, name: 'Casa Leo' } })
    expect(Object.fromEntries(Object.entries(backup.tables).map(([table, list]) => [table, list.length]))).toEqual({ criteria: 2, photos: 2, dishes: 2, menus: 1, servings: 2, reviews: 1 })
  })

  it('remembers who was who, and nothing else about people', () => {
    const backup = made()
    expect(backup.people).toEqual([
      { id: MIA, name: 'Mia', role: 'chef' },
      { id: LEO, name: 'Leo', role: 'taster' },
    ])
    const text = JSON.stringify(backup)
    expect(text).not.toContain('Hungry')
    expect(text).not.toContain('isAdmin')
    expect(text).not.toContain('prefs')
  })

  it('leaves the photos out of the small file, and any photo whose picture is missing', () => {
    expect(made(null)).toMatchObject({ withPhotos: false, tables: { photos: [] } })
    expect(made(new Set([PROOF])).tables.photos.map((p) => p.id)).toEqual([PROOF])
  })

  it('keeps deleted dishes and meals (so nothing points into the void) but not deleted photos or criteria', () => {
    const kitchen = snapshot()
    kitchen.rows.dishes[1].deletedAt = T1
    kitchen.rows.photos[0].deletedAt = T1
    kitchen.rows.criteria[1].deletedAt = T1
    const backup = buildBackup(kitchen, { app: '0.1.0', madeAt: T2, photoIds: bothPhotos })
    expect(backup.tables.dishes).toHaveLength(2)
    expect(backup.tables.photos.map((p) => p.id)).toEqual([COVER])
    expect(backup.tables.criteria.map((c) => c.label)).toEqual(['Taste'])
  })

  it('takes only rows of this kitchen', () => {
    const kitchen = snapshot()
    kitchen.rows.dishes.push(dish(uuid(39), 'Stray', { householdId: uuid(2) }))
    kitchen.members.push(member(uuid(19), 'Stranger', 'taster', uuid(2)))
    const backup = buildBackup(kitchen, { app: '0.1.0', madeAt: T2, photoIds: null })
    expect(backup.tables.dishes.map((d) => d.name)).toEqual(['Rösti', 'Zopf'])
    expect(backup.people).toHaveLength(2)
  })

  it('names the file after the day in Zurich', () => {
    expect(backupFileName('2026-11-10T08:00:00.000Z')).toBe('foodwishus-backup-2026-11-10.zip')
    // Half past eleven at night in UTC is already tomorrow in Zurich.
    expect(backupFileName('2026-11-10T23:30:00.000Z')).toBe('foodwishus-backup-2026-11-11.zip')
  })

  it('knows where a photo sits in the zip, both ways', () => {
    expect(photoEntry(PROOF, 'full')).toBe(`photos/${PROOF}.jpg`)
    expect(photoEntry(PROOF, 'thumb')).toBe(`photos/${PROOF}_t.jpg`)
    expect(photoOfEntry(`photos/${PROOF}_t.jpg`)).toEqual({ photoId: PROOF, variant: 'thumb' })
    expect(photoOfEntry(`photos/${PROOF}.jpg`)).toEqual({ photoId: PROOF, variant: 'full' })
    expect(photoOfEntry('backup.json')).toBeNull()
    expect(photoOfEntry('photos/readme.txt')).toBeNull()
  })

  it('sums itself up in the numbers people ask about', () => {
    const kitchen = snapshot()
    kitchen.rows.dishes.push(dish(uuid(38), 'Gone', { deletedAt: T1 }))
    expect(summarize(buildBackup(kitchen, { app: '0.1.0', madeAt: T2, photoIds: bothPhotos }))).toEqual({
      kitchenName: 'Casa Leo',
      madeAt: T2,
      dishes: 2,
      menus: 1,
      meals: 1,
      wishes: 1,
      reviews: 1,
      photos: 2,
      withPhotos: true,
      firstMeal: '2026-11-01',
      lastMeal: '2026-11-01',
    })
  })
})

describe('reading a backup', () => {
  it('reads back exactly what was written', () => {
    expect(reread(made())).toEqual(made())
  })

  const refuses = (value: unknown, code: string, where?: string | RegExp) => {
    let caught: unknown
    try {
      parseBackup(value)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(BackupError)
    expect((caught as BackupError).code).toBe(code)
    if (where !== undefined) expect((caught as BackupError).where).toMatch(where)
  }
  const broken = (change: (backup: Backup & Record<string, unknown>) => void): unknown => {
    const copy = JSON.parse(JSON.stringify(made())) as Backup & Record<string, unknown>
    change(copy)
    return copy
  }

  it('refuses a file from a newer version of the app', () => {
    refuses(
      broken((b) => (b.version = BACKUP_VERSION + 1)),
      'too_new',
    )
  })

  it('refuses things that are not a backup at all', () => {
    refuses(null, 'not_a_backup')
    refuses('hello', 'not_a_backup')
    refuses({ format: 'something-else', version: 1 }, 'not_a_backup')
    refuses([], 'not_a_backup')
  })

  it('refuses a damaged file and says where it hurts', () => {
    refuses(
      broken((b) => (b.version = 0)),
      'damaged',
      'version',
    )
    refuses(
      broken((b) => delete (b as Record<string, unknown>).madeAt),
      'damaged',
      'madeAt',
    )
    refuses(
      broken((b) => delete (b as Record<string, unknown>).tables),
      'damaged',
      'tables',
    )
    refuses(
      broken((b) => ((b.tables as Record<string, unknown>).menus = 'none')),
      'damaged',
      'menus',
    )
    refuses(
      broken((b) => ((b.tables.dishes[1] as unknown as Record<string, unknown>).name = '')),
      'damaged',
      'dishes 2, name',
    )
    refuses(
      broken((b) => ((b.tables.dishes[0] as unknown as Record<string, unknown>).course = 'feast')),
      'damaged',
      'dishes 1, course',
    )
    refuses(
      broken((b) => ((b.tables.servings[0] as unknown as Record<string, unknown>).status = 'devoured')),
      'damaged',
      'servings 1, status',
    )
    refuses(
      broken((b) => ((b.tables.reviews[0] as unknown as Record<string, unknown>).overall = 9)),
      'damaged',
      'reviews 1, overall',
    )
    refuses(
      broken((b) => ((b.tables.reviews[0] as unknown as Record<string, unknown>).scores = { [TASTE]: 'yum' })),
      'damaged',
      'reviews 1, scores',
    )
    refuses(
      broken((b) => ((b.tables.photos[0] as unknown as Record<string, unknown>).id = 'not-an-id')),
      'damaged',
      'photos 1, id',
    )
    refuses(
      broken((b) => ((b.tables.servings[0] as unknown as Record<string, unknown>).updatedAt = 'yesterday')),
      'damaged',
      'servings 1, updatedAt',
    )
    refuses(
      broken((b) => b.tables.dishes.push(b.tables.dishes[0])),
      'damaged',
      'dishes 3, id',
    )
    refuses(
      broken((b) => ((b.people as unknown[])[0] = { id: MIA })),
      'damaged',
      'people',
    )
  })

  it('keeps only the fields this version knows, so nothing odd travels on to the cloud', () => {
    const backup = parseBackup(
      broken((b) => {
        const row = b.tables.dishes[0] as unknown as Record<string, unknown>
        row.secretColumn = 'drop table'
        ;(row.recipe as Record<string, unknown>).oddity = { nested: true }
      }),
    )
    expect(backup.tables.dishes[0]).not.toHaveProperty('secretColumn')
    expect(backup.tables.dishes[0].recipe).not.toHaveProperty('oddity')
    expect(backup.tables.dishes[0]).toEqual(made().tables.dishes[0])
  })
})

describe('planning an import', () => {
  it('into an empty kitchen: everything is added, people are matched by name, rows are re-homed', async () => {
    const there = uuid(2)
    const mia2 = uuid(13)
    const leo2 = uuid(14)
    const now: KitchenNow = { householdId: there, settings: {}, members: [member(leo2, 'Leo', 'taster', there), member(mia2, 'mia ', 'chef', there)], rows: empty() }
    const result = await plan(reread(made()), now)

    expect(result.sameKitchen).toBe(false)
    expect(result.leftOut).toBe(0)
    expect(Object.fromEntries(Object.entries(result.counts).map(([table, c]) => [table, c.add]))).toEqual({ criteria: 2, photos: 2, dishes: 2, menus: 1, servings: 2, reviews: 1 })
    expect(result.writes.every((write) => write.reason === 'new' && write.row.householdId === there)).toBe(true)
    // Parents first, so the cloud never sees a meal before its dish.
    expect([...new Set(result.writes.map((write) => write.table))]).toEqual(['criteria', 'photos', 'dishes', 'menus', 'servings', 'reviews'])

    const written = <T>(table: string, id: ID) => result.writes.find((write) => write.table === table && write.row.id === id)?.row as T
    expect(written<Dish>('dishes', ROSTI)).toMatchObject({ createdBy: mia2, coverPhotoId: COVER })
    expect(written<Serving>('servings', DINNER)).toMatchObject({ proposedBy: mia2, cookedBy: mia2 })
    expect(written<Photo>('photos', PROOF)).toMatchObject({ createdBy: leo2 })

    // The review belongs to Leo's profile here, under the id that profile's reviews get.
    const moved = result.writes.find((write) => write.table === 'reviews')?.row as Review
    expect(moved.reviewerId).toBe(leo2)
    expect(moved.id).toBe(await reviewIdFor(DINNER, ROSTI, leo2))
    expect(moved.scores).toEqual({ [TASTE]: 5, [LOOKS]: 4 })
  })

  it('says whose things would arrive without an owner, so the partner can be invited first', async () => {
    const there = uuid(2)
    // Everybody found a seat: nobody to warn about.
    const both: KitchenNow = { householdId: there, settings: {}, members: [member(uuid(13), 'Mia', 'chef', there), member(uuid(14), 'Leo', 'taster', there)], rows: empty() }
    expect((await plan(reread(made()), both)).strangers).toEqual([])
    expect((await plan(reread(made()), sameKitchen())).strangers).toEqual([])

    // Only the chef is here so far: Leo's review and photos would lose their name.
    const alone: KitchenNow = { householdId: there, settings: {}, members: [member(uuid(13), 'Mia', 'chef', there)], rows: empty() }
    const result = await plan(reread(made()), alone)
    expect(result.strangers).toEqual(['Leo'])
    expect((result.writes.find((write) => write.table === 'reviews')?.row as Review).reviewerId).toBeNull()
    expect((result.writes.find((write) => write.row.id === ROSTI)?.row as Dish).createdBy).toBe(uuid(13))

    // Nothing of theirs is written (it is all here already): no warning either.
    const kept = { ...sameKitchen(), members: [member(MIA, 'Mia', 'chef')] }
    expect((await plan(reread(made()), kept)).strangers).toEqual([])
  })

  it('never creates people, however the file describes them', async () => {
    const now: KitchenNow = { householdId: uuid(2), settings: {}, members: [member(uuid(14), 'Somebody', 'chef', uuid(2))], rows: empty() }
    const result = await plan(reread(made()), now)
    expect(result.writes.some((write) => (write.table as string) === 'members' || (write.table as string) === 'households')).toBe(false)
  })

  it('into the kitchen it came from: nothing to do', async () => {
    const result = await plan(reread(made()), sameKitchen())
    expect(result.sameKitchen).toBe(true)
    expect(planIsEmpty(result)).toBe(true)
    expect(result.counts.dishes).toEqual({ add: 0, update: 0, back: 0, keep: 2 })
    expect(result.counts.reviews.keep).toBe(1)
    expect(result.counts.photos.keep).toBe(2)
  })

  it('leaves a row alone unless the file has the newer copy', async () => {
    const older = sameKitchen()
    older.rows.dishes[0] = dish(ROSTI, 'Rösti from long ago', { updatedAt: '2026-09-01T10:00:00.000Z' })
    older.rows.dishes[1] = dish(ZOPF, 'Zopf, improved', { updatedAt: T2 })
    const result = await plan(reread(made()), older)
    expect(result.writes.map((write) => [write.table, write.reason, (write.row as Dish).name])).toEqual([['dishes', 'newer', 'Rösti']])
    expect(result.counts.dishes).toEqual({ add: 0, update: 1, back: 0, keep: 1 })
  })

  it('brings back what was deleted in the kitchen since the backup', async () => {
    const now = sameKitchen()
    now.rows.dishes[1] = dish(ZOPF, 'Zopf', { deletedAt: T2, updatedAt: T2 })
    const result = await plan(reread(made()), now)
    expect(result.writes.map((write) => [write.table, write.reason, write.row.deletedAt])).toEqual([['dishes', 'back', null]])
    expect(result.counts.dishes.back).toBe(1)
  })

  it('never deletes: a row that is deleted in the file stays as it is in the kitchen', async () => {
    const kitchen = snapshot()
    kitchen.rows.dishes[1] = dish(ZOPF, 'Zopf', { deletedAt: T2, updatedAt: T2 })
    const backup = reread(buildBackup(kitchen, { app: '0.1.0', madeAt: T2, photoIds: bothPhotos }))
    const result = await plan(backup, sameKitchen())
    expect(planIsEmpty(result)).toBe(true)
    expect(result.counts.dishes).toEqual({ add: 0, update: 0, back: 0, keep: 1 })

    // In a kitchen that never had it, the deleted dish comes along (still deleted) so the menu's course points somewhere.
    const fresh = await plan(backup, { householdId: uuid(2), settings: {}, members: [], rows: empty() })
    const zopf = fresh.writes.find((write) => write.row.id === ZOPF)
    expect(zopf?.row.deletedAt).toBe(T2)
    expect(fresh.counts.dishes.add).toBe(1)
  })

  it('counts scores under the criterion with the same name instead of adding a second one', async () => {
    const there = uuid(2)
    const theirTaste = uuid(23)
    const now: KitchenNow = { householdId: there, settings: {}, members: [member(uuid(14), 'Leo', 'taster', there)], rows: { ...empty(), criteria: [criterion(theirTaste, 'taste', 0, { householdId: there }), criterion(uuid(24), 'Crunch', 1, { householdId: there })] } }
    const result = await plan(reread(made()), now)
    const added = result.writes.filter((write) => write.table === 'criteria').map((write) => write.row as Criterion)
    expect(added.map((c) => [c.label, c.sortOrder])).toEqual([['Looks', 2]])
    expect(result.counts.criteria).toEqual({ add: 1, update: 0, back: 0, keep: 1 })
    expect((result.writes.find((write) => write.table === 'reviews')?.row as Review).scores).toEqual({ [theirTaste]: 5, [LOOKS]: 4 })
  })

  it('without photos: nothing points to a picture that will not be there', async () => {
    const result = await plan(reread(made(null)), { householdId: uuid(2), settings: {}, members: [], rows: empty() }, new Set())
    expect(result.counts.photos.add).toBe(0)
    expect((result.writes.find((write) => write.row.id === ROSTI)?.row as Dish).coverPhotoId).toBeNull()
    expect((result.writes.find((write) => write.row.id === DINNER)?.row as Serving).proofPhotos).toEqual([])
  })

  it('keeps pointing to photos the kitchen already has, even when the file left them out', async () => {
    const older = sameKitchen()
    older.rows.dishes[0] = dish(ROSTI, 'Rösti', { coverPhotoId: COVER, updatedAt: '2026-09-01T10:00:00.000Z' })
    const result = await plan(reread(made(null)), older, new Set())
    expect((result.writes[0].row as Dish).coverPhotoId).toBe(COVER)
  })

  it('leaves out a photo row whose picture is not in the file, and what pointed to it', async () => {
    const result = await plan(reread(made()), { householdId: uuid(2), settings: {}, members: [], rows: empty() }, new Set([PROOF]))
    expect(result.writes.filter((write) => write.table === 'photos').map((write) => write.row.id)).toEqual([PROOF])
    expect(result.leftOut).toBe(1)
    expect((result.writes.find((write) => write.row.id === ROSTI)?.row as Dish).coverPhotoId).toBeNull()
    expect((result.writes.find((write) => write.row.id === DINNER)?.row as Serving).proofPhotos).toHaveLength(1)
  })

  it('a photo deleted in the kitchen returns only with something that shows it', async () => {
    // The proof photo was removed from the meal on purpose. The meal is as new as the file's: the photo stays gone.
    const now = sameKitchen()
    now.rows.photos[0] = photo(PROOF, 'proof', { deletedAt: T2, updatedAt: T2 })
    expect(planIsEmpty(await plan(reread(made()), now))).toBe(true)

    // The whole meal was deleted: it comes back, and its photo with it.
    now.rows.servings[0] = { ...now.rows.servings[0], deletedAt: T2, updatedAt: T2 }
    const result = await plan(reread(made()), now)
    expect(result.writes.map((write) => [write.table, write.reason])).toEqual([
      ['photos', 'back'],
      ['servings', 'back'],
    ])
  })

  it('leaves out what would dangle: a review without its meal, a meal without its dish', async () => {
    const backup = reread(made())
    backup.tables.reviews.push(review(uuid(62), { servingId: uuid(59) }), review(uuid(63), { dishId: uuid(39) }))
    backup.tables.servings.push(serving(uuid(53), { dishId: uuid(39) }))
    const result = await plan(backup, { householdId: uuid(2), settings: {}, members: [], rows: empty() })
    expect(result.leftOut).toBe(3)
    expect(result.counts.reviews.add).toBe(1)
    expect(result.counts.servings.add).toBe(2)
  })

  it("takes over the kitchen's own names for the reactions only when this kitchen has none", async () => {
    const kitchen = snapshot()
    kitchen.household.settings = { reactionLabels: { '6': 'Mamma mia' } }
    const backup = reread(buildBackup(kitchen, { app: '0.1.0', madeAt: T2, photoIds: bothPhotos }))
    expect((await plan(backup, sameKitchen())).settings).toEqual({ reactionLabels: { '6': 'Mamma mia' } })
    expect((await plan(backup, { ...sameKitchen(), settings: { reactionLabels: { '1': 'Oh no' } } })).settings).toBeNull()
    expect((await plan(reread(made()), sameKitchen())).settings).toBeNull()
  })
})

describe('telling who is who', () => {
  const people = [
    { id: MIA, name: 'Mia', role: 'chef' as const },
    { id: LEO, name: 'Leo', role: 'taster' as const },
  ]
  const seat = (id: ID, name: string, defaultRole: 'chef' | 'taster') => ({ id, name, defaultRole })

  it('the same profile first, then the same name', () => {
    expect([...matchPeople(people, [seat(LEO, 'Leonardo', 'taster'), seat(uuid(13), 'MIA', 'chef')])]).toEqual([
      [LEO, LEO],
      [MIA, uuid(13)],
    ])
  })

  it('then the only free seat with the same role, then the last free seat', () => {
    expect(matchPeople(people, [seat(uuid(13), 'Anna', 'chef'), seat(uuid(14), 'Ben', 'taster')]).get(LEO)).toBe(uuid(14))
    // Both are tasters now: Leo keeps his name, so the other seat must be Mia's.
    expect(matchPeople(people, [seat(uuid(13), 'Anna', 'taster'), seat(uuid(14), 'Leo', 'taster')]).get(MIA)).toBe(uuid(13))
  })

  it('nobody, when nobody fits', () => {
    expect(matchPeople(people, [seat(uuid(13), 'Anna', 'chef')])).toEqual(
      new Map([
        [MIA, uuid(13)],
        [LEO, null],
      ]),
    )
    expect(matchPeople(people, [])).toEqual(
      new Map([
        [MIA, null],
        [LEO, null],
      ]),
    )
    // Two strangers with the same role: guessing would mix up whose review is whose.
    const twins = [
      { id: MIA, name: 'Mia', role: 'taster' as const },
      { id: LEO, name: 'Leo', role: 'taster' as const },
    ]
    expect([...matchPeople(twins, [seat(uuid(13), 'Anna', 'taster'), seat(uuid(14), 'Ben', 'taster')]).values()]).toEqual([null, null])
  })
})
