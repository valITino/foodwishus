import { describe, expect, it } from 'vitest'
import type { ProofPhoto, Review, Serving } from '../../src/data/types'
import { reviewCopy } from '../../src/features/review/copy'
import {
  awaitsGuess,
  canJudge,
  captureTime,
  celebrates,
  chefAnswer,
  earliestSeal,
  exifMoment,
  eatenGuess,
  EXTRA_EMOJI,
  EXTRA_REACTIONS,
  firstPhotoTime,
  fromLocalInput,
  guessOutcome,
  hasAnswer,
  hasDetails,
  hasVerdict,
  mealOverall,
  mealVerdicts,
  myVerdicts,
  portionChoice,
  PORTIONS,
  reactionsDiffer,
  readExifDate,
  sharedExtras,
  sharedReaction,
  sortProof,
  tiltOf,
  timeLeft,
  toggleExtra,
  toLocalInput,
  verdictDishIds,
  wallPhotos,
  type Verdict,
} from '../../src/features/review/logic'

const MIA = 'mia'
const LEO = 'leo'

function serving(overrides: Partial<Serving> = {}): Serving {
  return {
    id: 's1',
    householdId: 'kitchen',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    deletedAt: null,
    dishId: 'd1',
    menuId: null,
    proposedBy: MIA,
    cookedBy: MIA,
    proposedAt: '2026-11-10T10:00:00.000Z',
    note: null,
    suggestedDays: [],
    craving: null,
    priority: 'a0',
    status: 'served',
    plannedDate: '2026-11-10',
    plannedSlot: 'dinner',
    servedAt: '2026-11-10T18:30:00.000Z',
    eatenAt: null,
    skippedReason: null,
    proofPhotos: [],
    ...overrides,
  }
}

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: `r-${overrides.dishId ?? 'd1'}-${overrides.reviewerId ?? LEO}`,
    householdId: 'kitchen',
    createdAt: '2026-11-10T19:00:00.000Z',
    updatedAt: '2026-11-10T19:00:00.000Z',
    deletedAt: null,
    servingId: 's1',
    dishId: 'd1',
    reviewerId: LEO,
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
    sealedAt: '2026-11-11T19:00:00.000Z',
    ...overrides,
  }
}

const verdict = (dishId: string, overrides: Partial<Review> | null = {}): Verdict => ({ dishId, review: overrides === null ? null : review({ dishId, ...overrides }) })

describe('who judges', () => {
  it('is the Taster, never the cook, unless the cook is alone in the kitchen', () => {
    expect(canJudge(serving(), LEO, true)).toBe(true)
    expect(canJudge(serving(), MIA, true)).toBe(false)
    expect(canJudge(serving(), MIA, false)).toBe(true)
    // An old row without a cook: whoever proposed it cooked it.
    expect(canJudge(serving({ cookedBy: null, proposedBy: LEO }), LEO, true)).toBe(false)
  })
})

describe('verdicts', () => {
  const menus = new Map([['m1', { courses: [{ dishId: 'roast', order: 1 }, { dishId: 'tart', order: 2 }, { dishId: 'soup', order: 0 }] }]])

  it('one for a dish, one per course for a menu, in serving order', () => {
    expect(verdictDishIds(serving(), menus)).toEqual(['d1'])
    expect(verdictDishIds(serving({ dishId: null, menuId: 'm1' }), menus)).toEqual(['soup', 'roast', 'tart'])
    expect(verdictDishIds(serving({ dishId: null, menuId: 'gone' }), menus)).toEqual([])
  })

  it('finds the verdict for each dish of a meal and leaves a gap where there is none', () => {
    const reviews = [review({ dishId: 'soup', reaction: 4 }), review({ dishId: 'tart', reaction: 6 }), review({ dishId: 'soup', servingId: 'another', reaction: 1 }), review({ dishId: 'roast', deletedAt: '2026-11-10T20:00:00.000Z' })]
    const found = mealVerdicts(serving({ dishId: null, menuId: 'm1' }), ['soup', 'roast', 'tart'], reviews)
    expect(found.map((v) => v.review?.reaction ?? null)).toEqual([4, null, 6])
  })

  it("lets the Taster's word count when both people judged the same dish", () => {
    const reviews = [review({ reviewerId: MIA, reaction: 6 }), review({ reviewerId: LEO, reaction: 3 })]
    expect(mealVerdicts(serving(), ['d1'], reviews)[0].review?.reviewerId).toBe(LEO)
    // Alone in the kitchen the cook's own verdict is the verdict.
    expect(mealVerdicts(serving(), ['d1'], [reviews[0]])[0].review?.reviewerId).toBe(MIA)
  })

  it('keeps my verdicts apart from the other person\'s', () => {
    const reviews = [review({ reviewerId: MIA, reaction: 6 }), review({ reviewerId: LEO, reaction: 3 })]
    expect(myVerdicts('s1', ['d1'], reviews, LEO)[0].review?.reaction).toBe(3)
    expect(myVerdicts('s1', ['d1'], reviews, 'somebody')[0].review).toBeNull()
  })

  it('needs a face or an overall score to count', () => {
    expect(hasVerdict(null)).toBe(false)
    expect(hasVerdict(review())).toBe(false)
    expect(hasVerdict(review({ reaction: 2 }))).toBe(true)
    expect(hasVerdict(review({ overall: 4 }))).toBe(true)
  })

  it('knows a quick face from a full review', () => {
    expect(hasDetails(null)).toBe(false)
    expect(hasDetails(review({ reaction: 5, extraReactions: ['love'] }))).toBe(false)
    for (const detail of [{ overall: 3 }, { scores: { taste: 4 } }, { portionsEaten: 1.5 }, { wouldEatAgain: false }, { comment: 'Yum' }, { chips: ['perfect'] }] as Partial<Review>[]) {
      expect(hasDetails(review(detail)), JSON.stringify(detail)).toBe(true)
    }
  })

  it('shows one face for the whole table only while every course wears it', () => {
    expect(sharedReaction([])).toBeNull()
    expect(sharedReaction([verdict('a', { reaction: 5 }), verdict('b', { reaction: 5 })])).toBe(5)
    expect(sharedReaction([verdict('a', { reaction: 5 }), verdict('b', { reaction: 6 })])).toBeNull()
    expect(sharedReaction([verdict('a', { reaction: 5 }), verdict('b', null)])).toBeNull()

    expect(reactionsDiffer([verdict('a', { reaction: 5 }), verdict('b', { reaction: 6 })])).toBe(true)
    expect(reactionsDiffer([verdict('a', { reaction: 5 }), verdict('b', null)])).toBe(false)
    expect(reactionsDiffer([verdict('a', { reaction: 5 }), verdict('b', { reaction: 5 })])).toBe(false)
  })

  it('handles the extra reactions: six of them, each with an emoji, shared ones in a fixed order', () => {
    expect(EXTRA_REACTIONS).toHaveLength(6)
    for (const extra of EXTRA_REACTIONS) expect(EXTRA_EMOJI[extra]).toBeTruthy()

    expect(sharedExtras([])).toEqual([])
    expect(sharedExtras([verdict('a', { extraReactions: ['again', 'love'] }), verdict('b', { extraReactions: ['love', 'fire', 'again'] })])).toEqual(['love', 'again'])
    expect(sharedExtras([verdict('a', { extraReactions: ['love'] }), verdict('b', null)])).toEqual([])

    expect(toggleExtra([], 'fire')).toEqual(['fire'])
    expect(toggleExtra(['again', 'fire'], 'love')).toEqual(['love', 'fire', 'again'])
    expect(toggleExtra(['love', 'fire'], 'love')).toEqual(['fire'])
  })

  it('earns confetti with a 5 out of 5 or "Super delicious" on any course', () => {
    expect(celebrates([verdict('a', { reaction: 5, overall: 4 })])).toBe(false)
    expect(celebrates([verdict('a', { reaction: 6 })])).toBe(true)
    expect(celebrates([verdict('a', { reaction: 4 }), verdict('b', { overall: 5 })])).toBe(true)
    expect(celebrates([verdict('a', null)])).toBe(false)
  })
})

describe('portions', () => {
  it('offers half, 1, 1.5, 2 and seconds, which count as three', () => {
    expect([...PORTIONS]).toEqual([0.5, 1, 1.5, 2, 3])
  })

  it('reads any stored amount as the nearest choice', () => {
    expect([0.5, 1, 1.5, 2, 2.5, 3, 9].map(portionChoice)).toEqual([0.5, 1, 1.5, 2, 3, 3, 3])
  })
})

describe('the 24 hours', () => {
  const sealedAt = '2026-11-11T19:00:00.000Z'
  const before = (minutes: number) => Date.parse(sealedAt) - minutes * 60_000

  it('counts in whole hours while there is plenty of time', () => {
    expect(timeLeft(sealedAt, before(24 * 60 - 1))).toEqual({ sealed: false, unit: 'hours', amount: 24 })
    expect(timeLeft(sealedAt, before(23 * 60 + 20))).toEqual({ sealed: false, unit: 'hours', amount: 23 })
    expect(timeLeft(sealedAt, before(90))).toEqual({ sealed: false, unit: 'hours', amount: 2 })
  })

  it('counts in minutes for the last hour and a half', () => {
    expect(timeLeft(sealedAt, before(89))).toEqual({ sealed: false, unit: 'minutes', amount: 89 })
    expect(timeLeft(sealedAt, before(0.4))).toEqual({ sealed: false, unit: 'minutes', amount: 1 })
  })

  it('is sealed from the very moment, and unknown without a seal time', () => {
    expect(timeLeft(sealedAt, before(0))).toEqual({ sealed: true })
    expect(timeLeft(sealedAt, before(-5000))).toEqual({ sealed: true })
    expect(timeLeft(null)).toBeNull()
  })

  it('goes by the course that seals first', () => {
    expect(earliestSeal([verdict('a', { sealedAt: '2026-11-11T19:05:00.000Z' }), verdict('b', { sealedAt }), verdict('c', null)])).toBe(sealedAt)
    expect(earliestSeal([verdict('a', null)])).toBeNull()
  })

  it('says it plainly in both languages', () => {
    expect(reviewCopy.en.window.mine(23, 'hours')).toBe('You can change it for another 23 hours.')
    expect(reviewCopy.en.window.mine(1, 'minutes')).toBe('You can change it for another minute.')
    expect(reviewCopy.de.window.mine(40, 'minutes')).toBe('Du kannst es noch 40 Minuten ändern.')
    expect(reviewCopy.de.window.theirs('Leo', 5, 'hours')).toBe('Leo kann es noch 5 Stunden ändern.')
  })
})

describe("the Chef's guess and answer", () => {
  it('keeps the verdict covered until the cook has guessed', () => {
    expect(awaitsGuess([verdict('a', { reaction: 5 })], MIA)).toBe(true)
    expect(awaitsGuess([verdict('a', { reaction: 5, chefSelfRating: 4 })], MIA)).toBe(false)
    // One guess opens the whole menu.
    expect(awaitsGuess([verdict('a', { chefSelfRating: 4 }), verdict('b', {})], MIA)).toBe(false)
    // Nothing to guess about my own verdict, or when there is none.
    expect(awaitsGuess([verdict('a', { reaction: 5 })], LEO)).toBe(false)
    expect(awaitsGuess([verdict('a', null)], MIA)).toBe(false)
  })

  it('compares the guess with the overall score', () => {
    expect(guessOutcome(4, 4)).toBe('spot-on')
    expect(guessOutcome(3, 5)).toBe('too-modest')
    expect(guessOutcome(5, 2)).toBe('too-bold')
    expect(guessOutcome(null, 4)).toBeNull()
    expect(guessOutcome(4, null)).toBeNull()
  })

  it('scores a menu by the rounded mean of its rated courses', () => {
    expect(mealOverall([verdict('a', { overall: 4 })])).toBe(4)
    expect(mealOverall([verdict('a', { overall: 5 }), verdict('b', { overall: 4 }), verdict('c', {})])).toBe(5)
    expect(mealOverall([verdict('a', { overall: 2 }), verdict('b', { overall: 3 }), verdict('c', { overall: 2 })])).toBe(2)
    expect(mealOverall([verdict('a', {}), verdict('b', null)])).toBeNull()
  })

  it('reads one answer for the whole meal', () => {
    const answer = chefAnswer([verdict('a', {}), verdict('b', { chefSelfRating: 4, chefReaction: 6, chefExtraReactions: ['again', 'love'], chefReply: 'Told you so' }), verdict('c', null)])
    expect(answer).toEqual({ guess: 4, reaction: 6, extras: ['love', 'again'], reply: 'Told you so' })
    expect(hasAnswer(answer)).toBe(true)
    // A guess alone is not an answer yet.
    expect(hasAnswer(chefAnswer([verdict('a', { chefSelfRating: 3 })]))).toBe(false)
  })
})

describe('proof photos', () => {
  const photo = (photoId: string, takenAt: string, extra: Partial<ProofPhoto> = {}): ProofPhoto => ({ photoId, source: 'camera', takenAt, ...extra })

  it('takes the earliest photo as the time the meal was eaten', () => {
    expect(firstPhotoTime([])).toBeNull()
    expect(firstPhotoTime([photo('a', '2026-11-10T19:30:00.000Z'), photo('b', '2026-11-10T18:42:00.000Z')])).toBe('2026-11-10T18:42:00.000Z')
  })

  it('believes the first photo, unless it was taken on a later day than the meal came to the table', () => {
    const zurich = (day: string, time: string) => new Date(`${day}T${time}:00+01:00`).toISOString()
    const table = zurich('2026-11-09', '19:00')
    expect(eatenGuess({ servedAt: table, proofPhotos: [] })).toBeNull()
    // The usual way: served, and photographed a moment later.
    expect(eatenGuess({ servedAt: table, proofPhotos: [photo('a', zurich('2026-11-09', '19:12'))] })).toBe(zurich('2026-11-09', '19:12'))
    // Never marked as served: the photo is all there is.
    expect(eatenGuess({ servedAt: null, proofPhotos: [photo('a', zurich('2026-11-10', '08:00'))] })).toBe(zurich('2026-11-10', '08:00'))
    // Logged for yesterday, photographed today: it stays yesterday's dinner.
    expect(eatenGuess({ servedAt: table, proofPhotos: [photo('a', zurich('2026-11-10', '08:00'))] })).toBe(table)
    // Served just before midnight, photographed just after: still that evening's meal.
    expect(eatenGuess({ servedAt: zurich('2026-11-09', '23:55'), proofPhotos: [photo('a', zurich('2026-11-10', '00:05'))] })).toBe(zurich('2026-11-09', '23:55'))
    // A photo from the gallery that is older than the day it was logged for is evidence, and wins.
    expect(eatenGuess({ servedAt: table, proofPhotos: [photo('a', zurich('2026-11-08', '19:40'))] })).toBe(zurich('2026-11-08', '19:40'))
    // Of several photos the earliest decides.
    expect(eatenGuess({ servedAt: table, proofPhotos: [photo('late', zurich('2026-11-10', '08:00')), photo('early', zurich('2026-11-09', '19:20'))] })).toBe(zurich('2026-11-09', '19:20'))
  })

  it('shows the table first, then the courses in serving order', () => {
    const photos = [photo('tart', 't1', { courseDishId: 'tart' }), photo('table', 't2'), photo('soup', 't3', { courseDishId: 'soup' }), photo('table-2', 't4')]
    expect(sortProof(photos, ['soup', 'roast', 'tart']).map((p) => p.photoId)).toEqual(['table', 'table-2', 'soup', 'tart'])
  })

  it('hangs every photo on the wall, newest first', () => {
    const servings = [
      serving({ id: 'old', proofPhotos: [photo('a', '2026-10-01T18:00:00.000Z')] }),
      serving({ id: 'menu', proofPhotos: [photo('b', '2026-11-09T19:00:00.000Z'), photo('c', '2026-11-09T19:20:00.000Z', { courseDishId: 'tart' })] }),
      serving({ id: 'gone', deletedAt: '2026-11-10T00:00:00.000Z', proofPhotos: [photo('d', '2026-11-10T12:00:00.000Z')] }),
      serving({ id: 'none' }),
    ]
    const wall = wallPhotos(servings)
    expect(wall.map((p) => p.photoId)).toEqual(['c', 'b', 'a'])
    expect(wall[0].serving.id).toBe('menu')
    expect(wall[0].courseDishId).toBe('tart')
  })

  it('tilts each photo a little, always the same way, never dead straight', () => {
    for (const id of ['a', 'photo-1', '7024291c-4a02-4ae3-946f-e1eb9f9ee048', 'zzzz']) {
      const tilt = tiltOf(id)
      expect(tiltOf(id)).toBe(tilt)
      expect(Math.abs(tilt)).toBeLessThanOrEqual(3)
      expect(Math.abs(tilt)).toBeGreaterThanOrEqual(0.6)
    }
    expect(Math.abs(tiltOf('a', 1.5))).toBeLessThanOrEqual(1.5)
  })
})

// ------------------------------------------------------------------- EXIF --

interface ExifOptions {
  original?: string
  offsetOriginal?: string
  dateTime?: string
  little?: boolean
  jfif?: boolean
}

/** A tiny JPEG that carries nothing but an EXIF block, built by hand. */
function jpegWithExif({ original, offsetOriginal, dateTime, little = true, jfif = true }: ExifOptions): Uint8Array {
  const tiff = new Uint8Array(256)
  const view = new DataView(tiff.buffer)
  const text = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)))
  let data = 120
  const entry = (at: number, tag: number, type: number, count: number, value: number | string) => {
    view.setUint16(at, tag, little)
    view.setUint16(at + 2, type, little)
    view.setUint32(at + 4, count, little)
    if (typeof value === 'number') view.setUint32(at + 8, value, little)
    else {
      view.setUint32(at + 8, data, little)
      text(data, value)
      data += count
    }
  }
  text(0, little ? 'II' : 'MM')
  view.setUint16(2, 42, little)
  view.setUint32(4, 8, little)

  const exifIfd = 60
  const root: [number, number, number, number | string][] = [[0x8769, 4, 1, exifIfd]]
  if (dateTime) root.unshift([0x0132, 2, 20, dateTime])
  view.setUint16(8, root.length, little)
  root.forEach((e, i) => entry(10 + i * 12, ...e))

  const sub: [number, number, number, number | string][] = []
  if (original) sub.push([0x9003, 2, 20, original])
  if (offsetOriginal) sub.push([0x9011, 2, 7, offsetOriginal])
  view.setUint16(exifIfd, sub.length, little)
  sub.forEach((e, i) => entry(exifIfd + 2 + i * 12, ...e))

  const app0 = jfif ? [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0] : []
  const length = 2 + 6 + tiff.length
  const app1 = [0xff, 0xe1, length >> 8, length & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])
}

describe('when a gallery photo was taken', () => {
  it('reads the date the camera wrote down, in either byte order', () => {
    const expected = { year: 2026, month: 11, day: 8, hour: 19, minute: 26, second: 41, offsetMinutes: null }
    expect(readExifDate(jpegWithExif({ original: '2026:11:08 19:26:41' }))).toEqual(expected)
    expect(readExifDate(jpegWithExif({ original: '2026:11:08 19:26:41', little: false, jfif: false }))).toEqual(expected)
  })

  it('reads the time zone when the camera knew it', () => {
    expect(readExifDate(jpegWithExif({ original: '2026:07:04 12:00:00', offsetOriginal: '+02:00' }))?.offsetMinutes).toBe(120)
    expect(readExifDate(jpegWithExif({ original: '2026:07:04 12:00:00', offsetOriginal: '-05:30' }))?.offsetMinutes).toBe(-330)
  })

  it('falls back to the plain date when there is no "original" one', () => {
    expect(readExifDate(jpegWithExif({ dateTime: '2026:11:08 07:05:00' }))).toMatchObject({ day: 8, hour: 7, minute: 5 })
    expect(readExifDate(jpegWithExif({ dateTime: '2026:11:08 07:05:00', original: '2026:11:07 21:00:00' }))).toMatchObject({ day: 7, hour: 21 })
  })

  it('gives up quietly on anything it cannot read', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const good = jpegWithExif({ original: '2026:11:08 19:26:41' })
    expect(readExifDate(png)).toBeNull()
    expect(readExifDate(new Uint8Array())).toBeNull()
    expect(readExifDate(jpegWithExif({}))).toBeNull()
    expect(readExifDate(jpegWithExif({ original: '0000:00:00 00:00:00' }))).toBeNull()
    expect(readExifDate(jpegWithExif({ original: 'yesterday, probably' }))).toBeNull()
    // Cut off in the middle of the EXIF block, at every possible place.
    for (let length = 0; length < good.length; length += 7) expect(() => readExifDate(good.slice(0, length))).not.toThrow()
  })

  it('turns the date into a moment: by its own zone, or on the kitchen clock', () => {
    const at = (hour: number, month: number, offsetMinutes: number | null) => exifMoment({ year: 2026, month, day: 8, hour, minute: 26, second: 41, offsetMinutes })
    expect(at(19, 11, 60)).toBe('2026-11-08T18:26:41.000Z')
    // No zone: Zurich. Winter time is one hour ahead of UTC, summer time two.
    expect(at(19, 11, null)).toBe('2026-11-08T18:26:41.000Z')
    expect(at(19, 7, null)).toBe('2026-07-08T17:26:41.000Z')
    expect(exifMoment({ year: 2026, month: 2, day: 31, hour: 12, minute: 0, second: 0, offsetMinutes: null })).toBeNull()
  })

  const now = Date.parse('2026-11-10T19:00:00.000Z')
  const exif = { year: 2026, month: 11, day: 10, hour: 18, minute: 42, second: 0, offsetMinutes: 60 }

  it('a live photo was taken now, whatever the file says', () => {
    expect(captureTime({ source: 'camera', exif, lastModified: now - 3_600_000 }, now)).toBe('2026-11-10T19:00:00.000Z')
  })

  it('a gallery photo was taken when it says, then when its file says, then now', () => {
    expect(captureTime({ source: 'gallery', exif, lastModified: now - 60_000 }, now)).toBe('2026-11-10T17:42:00.000Z')
    expect(captureTime({ source: 'gallery', exif: null, lastModified: now - 60_000 }, now)).toBe('2026-11-10T18:59:00.000Z')
    expect(captureTime({ source: 'gallery' }, now)).toBe('2026-11-10T19:00:00.000Z')
    expect(captureTime({ source: 'gallery', lastModified: 0 }, now)).toBe('2026-11-10T19:00:00.000Z')
  })

  it('never believes a photo from the future', () => {
    const tomorrow = { ...exif, day: 11 }
    expect(captureTime({ source: 'gallery', exif: tomorrow, lastModified: now - 60_000 }, now)).toBe('2026-11-10T18:59:00.000Z')
    expect(captureTime({ source: 'gallery', exif: tomorrow, lastModified: now + 86_400_000 }, now)).toBe('2026-11-10T19:00:00.000Z')
    // A clock that runs two minutes fast is still "now".
    expect(captureTime({ source: 'gallery', lastModified: now + 120_000 }, now)).toBe('2026-11-10T19:00:00.000Z')
  })
})

describe('correcting the time', () => {
  it('shows a moment on the kitchen clock and reads it back', () => {
    expect(toLocalInput('2026-11-10T18:42:00.000Z')).toBe('2026-11-10T19:42')
    expect(fromLocalInput('2026-11-10T19:42')).toBe('2026-11-10T18:42:00.000Z')
    // Summer time, and a meal just after midnight.
    expect(toLocalInput('2026-07-04T22:10:00.000Z')).toBe('2026-07-05T00:10')
    expect(fromLocalInput('2026-07-05T00:10')).toBe('2026-07-04T22:10:00.000Z')
  })

  it('refuses anything that is not a full date and time', () => {
    for (const value of ['', '2026-11-10', '19:42', '2026-02-31T12:00', '2026-11-10T25:00', 'tomorrow']) expect(fromLocalInput(value), value).toBeNull()
  })
})

// ------------------------------------------------------------------- copy --

/** Every sentence of a copy tree, with functions called on sample words. */
function sentences(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (typeof node === 'function') return sentences((node as (...args: unknown[]) => unknown)('Mia', 'Leo', 'hours'))
  if (node && typeof node === 'object') return Object.values(node).flatMap(sentences)
  return []
}

describe('review copy', () => {
  it('follows the house rules: no em dashes, middle dots or arrows, and Swiss spelling in German', () => {
    const en = sentences(reviewCopy.en)
    const de = sentences(reviewCopy.de)
    expect(en.length).toBeGreaterThan(80)
    expect(de).toHaveLength(en.length)
    for (const line of [...en, ...de]) {
      expect(line, line).not.toMatch(/[—–·→←]/)
      expect(line, line).toBe(line.trim())
    }
    for (const line of de) expect(line, line).not.toContain('ß')
  })

  it('names the cook instead of guessing who wears the crown', () => {
    expect(reviewCopy.en.verdict.extras['chef-queen']('Leo')).toBe('A crown for Leo')
    expect(reviewCopy.de.verdict.extras['chef-queen']('Mia')).toBe('Eine Krone für Mia')
    expect(reviewCopy.en.verdict.extras['chef-queen']('')).toBe('A crown for the cook')
    expect(reviewCopy.de.chef.extras['chef-queen']('Leo')).toBe('Eine Krone für Leo')
  })
})
