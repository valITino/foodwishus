// The thinking behind proof, verdict and the photo wall, kept free of React and of the
// database so every rule can be unit-tested.

import { zurichIso } from '../../data/demo/clock'
import type { ExtraReaction, ID, ISO, Menu, PhotoSource, ProofPhoto, Reaction, Review, Score5, Serving } from '../../data/types'
import { toDay, ZONE } from '../../lib/dates'
import { cookOf } from '../planning/logic'

// ------------------------------------------------------------------ people --

/** The Taster judges. Alone in the kitchen you cook and judge. */
export function canJudge(serving: Pick<Serving, 'cookedBy' | 'proposedBy'>, memberId: ID, hasPartner: boolean): boolean {
  return !hasPartner || cookOf(serving) !== memberId
}

// ---------------------------------------------------------------- verdicts --

/**
 * The dishes that get their own verdict at a meal: the dish itself, or every course of
 * the menu in serving order. The same list as reviewDishes() in actions.ts, for screens
 * that already hold the menus.
 */
export function verdictDishIds(serving: Pick<Serving, 'dishId' | 'menuId'>, menus: ReadonlyMap<ID, Pick<Menu, 'courses'>>): ID[] {
  if (serving.dishId) return [serving.dishId]
  const menu = serving.menuId ? menus.get(serving.menuId) : undefined
  return [...(menu?.courses ?? [])].sort((a, b) => a.order - b.order).map((course) => course.dishId)
}

/** One dish of a meal and what was said about it. */
export interface Verdict {
  dishId: ID
  review: Review | null
}

/**
 * The verdicts of a meal, one per dish that gets one, in serving order. Should both
 * people ever have judged the same dish, the Taster's word counts.
 */
export function mealVerdicts(serving: Pick<Serving, 'id' | 'cookedBy' | 'proposedBy'>, dishIds: ID[], reviews: Review[]): Verdict[] {
  const cook = cookOf(serving)
  const mine = reviews.filter((r) => r.servingId === serving.id && !r.deletedAt)
  return dishIds.map((dishId) => {
    const forDish = mine.filter((r) => r.dishId === dishId)
    return { dishId, review: forDish.find((r) => r.reviewerId !== cook) ?? forDish[0] ?? null }
  })
}

/** The verdicts one person wrote (the flow only ever edits your own). */
export function myVerdicts(servingId: ID, dishIds: ID[], reviews: Review[], memberId: ID): Verdict[] {
  const mine = reviews.filter((r) => r.servingId === servingId && r.reviewerId === memberId && !r.deletedAt)
  return dishIds.map((dishId) => ({ dishId, review: mine.find((r) => r.dishId === dishId) ?? null }))
}

/** A face or an overall score: enough to hand in. */
export function hasVerdict(review: Pick<Review, 'reaction' | 'overall'> | null): boolean {
  return review !== null && (review.reaction !== null || review.overall !== null)
}

/** More than the quick face: spoons, portions, words. */
export function hasDetails(review: Review | null): boolean {
  if (!review) return false
  return review.overall !== null || Object.keys(review.scores).length > 0 || review.portionsEaten !== 1 || review.wouldEatAgain !== null || review.comment !== null || review.chips.length > 0
}

/** The face every dish of the meal shares, or null when they differ or one is missing. */
export function sharedReaction(verdicts: Verdict[]): Reaction | null {
  const first = verdicts[0]?.review?.reaction ?? null
  return first !== null && verdicts.every((v) => v.review?.reaction === first) ? first : null
}

/** True when the courses of a menu no longer wear the same face. */
export function reactionsDiffer(verdicts: Verdict[]): boolean {
  const faces = new Set(verdicts.map((v) => v.review?.reaction ?? null))
  faces.delete(null)
  return faces.size > 1
}

export const EXTRA_REACTIONS: readonly ExtraReaction[] = ['love', 'fire', 'chef-queen', 'needs-salt', 'too-spicy', 'again']

export const EXTRA_EMOJI: Record<ExtraReaction, string> = { love: '❤️', fire: '🔥', 'chef-queen': '👑', 'needs-salt': '🧂', 'too-spicy': '🌶️', again: '🔁' }

/** The extra reactions every dish of the meal carries, in their fixed order. */
export function sharedExtras(verdicts: Verdict[]): ExtraReaction[] {
  if (verdicts.length === 0) return []
  return EXTRA_REACTIONS.filter((extra) => verdicts.every((v) => v.review?.extraReactions.includes(extra)))
}

/** Switch one extra reaction on or off, keeping the fixed order. */
export function toggleExtra(current: ExtraReaction[], extra: ExtraReaction): ExtraReaction[] {
  const on = current.includes(extra)
  return EXTRA_REACTIONS.filter((e) => (e === extra ? !on : current.includes(e)))
}

/** A 5 out of 5 or "Super delicious" anywhere on the table earns heart confetti. */
export function celebrates(verdicts: Verdict[]): boolean {
  return verdicts.some((v) => v.review?.overall === 5 || v.review?.reaction === 6)
}

// ---------------------------------------------------------------- portions --

/** Half, 1, 1.5, 2 and "Seconds!", which counts as three. */
export const PORTIONS = [0.5, 1, 1.5, 2, 3] as const
export type Portion = (typeof PORTIONS)[number]

/** Which of the five choices a stored amount stands for. */
export function portionChoice(value: number): Portion {
  if (value < 0.75) return 0.5
  if (value < 1.25) return 1
  if (value < 1.75) return 1.5
  if (value < 2.5) return 2
  return 3
}

// ------------------------------------------------------------- the 24 hours --

export type TimeLeft = { sealed: true } | { sealed: false; unit: 'hours' | 'minutes'; amount: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * How long a verdict can still be changed, in plain words: whole hours while there is
 * plenty of time, minutes for the last hour and a half.
 */
export function timeLeft(sealedAt: ISO | null, now: number = Date.now()): TimeLeft | null {
  if (sealedAt === null) return null
  const left = Date.parse(sealedAt) - now
  if (!(left > 0)) return { sealed: true }
  if (left >= 90 * MINUTE) return { sealed: false, unit: 'hours', amount: Math.round(left / HOUR) }
  return { sealed: false, unit: 'minutes', amount: Math.max(1, Math.ceil(left / MINUTE)) }
}

/** The earliest moment any of these verdicts freezes. One sealed course seals the meal for editing. */
export function earliestSeal(verdicts: Verdict[]): ISO | null {
  const moments = verdicts.map((v) => v.review?.sealedAt).filter((m): m is ISO => typeof m === 'string')
  return moments.length ? moments.reduce((a, b) => (a < b ? a : b)) : null
}

// --------------------------------------------------------- the Chef's guess --

/** The Chef has not guessed yet, so the Taster's verdict stays covered. */
export function awaitsGuess(verdicts: Verdict[], memberId: ID): boolean {
  const theirs = verdicts.map((v) => v.review).filter((r): r is Review => r !== null && r.reviewerId !== memberId)
  return theirs.length > 0 && theirs.every((r) => r.chefSelfRating === null)
}

export type GuessOutcome = 'spot-on' | 'too-modest' | 'too-bold'

/** How the Chef's guess compares with the Taster's overall score. Null when there is no score to compare with. */
export function guessOutcome(guess: Score5 | null, overall: Score5 | null): GuessOutcome | null {
  if (guess === null || overall === null) return null
  if (guess === overall) return 'spot-on'
  return guess < overall ? 'too-modest' : 'too-bold'
}

/** The overall score of a meal: the dish's own, or the rounded mean of the courses that have one. */
export function mealOverall(verdicts: Verdict[]): Score5 | null {
  const scores = verdicts.map((v) => v.review?.overall).filter((s): s is Score5 => typeof s === 'number')
  if (scores.length === 0) return null
  return Math.min(5, Math.max(1, Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length))) as Score5
}

export interface ChefAnswerView {
  guess: Score5 | null
  reaction: Reaction | null
  extras: ExtraReaction[]
  reply: string | null
}

/** The Chef answers a meal once; for a menu the same answer sits on every course. */
export function chefAnswer(verdicts: Verdict[]): ChefAnswerView {
  const reviews = verdicts.map((v) => v.review).filter((r): r is Review => r !== null)
  return {
    guess: reviews.find((r) => r.chefSelfRating !== null)?.chefSelfRating ?? null,
    reaction: reviews.find((r) => r.chefReaction !== null)?.chefReaction ?? null,
    extras: EXTRA_REACTIONS.filter((extra) => reviews.some((r) => r.chefExtraReactions.includes(extra))),
    reply: reviews.find((r) => r.chefReply !== null)?.chefReply ?? null,
  }
}

export function hasAnswer(answer: ChefAnswerView): boolean {
  return answer.reaction !== null || answer.extras.length > 0 || answer.reply !== null
}

// ------------------------------------------------------------------ photos --

/** The first guess for "when was it eaten": the earliest proof photo. */
export function firstPhotoTime(photos: ProofPhoto[]): ISO | null {
  return photos.length ? photos.map((p) => p.takenAt).reduce((a, b) => (a < b ? a : b)) : null
}

/** The table first, then the courses in serving order. */
export function sortProof(photos: ProofPhoto[], dishIds: ID[]): ProofPhoto[] {
  const rank = (photo: ProofPhoto): number => (photo.courseDishId ? 1 + Math.max(0, dishIds.indexOf(photo.courseDishId)) : 0)
  return photos.map((photo, index) => ({ photo, index })).sort((a, b) => rank(a.photo) - rank(b.photo) || a.index - b.index).map((entry) => entry.photo)
}

export interface WallPhoto extends ProofPhoto {
  serving: Serving
}

/** Every proof photo in the kitchen, newest first. */
export function wallPhotos(servings: Serving[]): WallPhoto[] {
  return servings
    .filter((serving) => !serving.deletedAt)
    .flatMap((serving) => serving.proofPhotos.map((photo) => ({ ...photo, serving })))
    .sort((a, b) => (a.takenAt === b.takenAt ? (a.photoId < b.photoId ? -1 : 1) : a.takenAt < b.takenAt ? 1 : -1))
}

/** A small, steady tilt for a photo, so the wall looks pinned by hand and never jumps. */
export function tiltOf(id: string, range = 3): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 9973
  const tilt = (hash % (range * 2 * 10 + 1)) / 10 - range
  // Never perfectly straight: that looks like a mistake between tilted neighbours.
  return Math.abs(tilt) < 0.6 ? (tilt < 0 ? -0.8 : 0.8) : tilt
}

// ------------------------------------------------------------ capture time --

/** The date a camera wrote into a photo. Wall-clock time, with the zone when the camera knew it. */
export interface ExifDate {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** Minutes ahead of UTC, when the camera wrote it down. */
  offsetMinutes: number | null
}

function ascii(view: DataView, start: number, length: number): string {
  if (start < 0 || length < 0 || start + length > view.byteLength) return ''
  let text = ''
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(start + i))
  return text
}

const TAG = { exifIfd: 0x8769, dateTime: 0x0132, original: 0x9003, digitized: 0x9004, offset: 0x9010, offsetOriginal: 0x9011, offsetDigitized: 0x9012 }

function parseStamp(stamp: unknown, zone: unknown): ExifDate | null {
  if (typeof stamp !== 'string') return null
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(stamp)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number)
  if (year < 1990 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null
  const z = typeof zone === 'string' ? /^([+-])(\d{2}):(\d{2})/.exec(zone) : null
  const offsetMinutes = z ? (z[1] === '-' ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3])) : null
  return { year, month, day, hour, minute, second, offsetMinutes }
}

function readTiff(tiff: DataView): ExifDate | null {
  if (tiff.byteLength < 8) return null
  const order = tiff.getUint16(0)
  if (order !== 0x4949 && order !== 0x4d4d) return null
  const little = order === 0x4949
  if (tiff.getUint16(2, little) !== 42) return null

  const read = (ifd: number, wanted: number[]): Map<number, string | number> => {
    const found = new Map<number, string | number>()
    if (ifd <= 0 || ifd + 2 > tiff.byteLength) return found
    const count = tiff.getUint16(ifd, little)
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12
      if (entry + 12 > tiff.byteLength) break
      const tag = tiff.getUint16(entry, little)
      if (!wanted.includes(tag)) continue
      const type = tiff.getUint16(entry + 2, little)
      const length = tiff.getUint32(entry + 4, little)
      if (type === 2) found.set(tag, ascii(tiff, length <= 4 ? entry + 8 : tiff.getUint32(entry + 8, little), Math.min(length, 64)).replace(/\0+$/, ''))
      else if (type === 4) found.set(tag, tiff.getUint32(entry + 8, little))
    }
    return found
  }

  const root = read(tiff.getUint32(4, little), [TAG.exifIfd, TAG.dateTime])
  const exifAt = root.get(TAG.exifIfd)
  const exif = typeof exifAt === 'number' ? read(exifAt, [TAG.original, TAG.digitized, TAG.offset, TAG.offsetOriginal, TAG.offsetDigitized]) : new Map<number, string | number>()
  return (
    parseStamp(exif.get(TAG.original), exif.get(TAG.offsetOriginal)) ??
    parseStamp(exif.get(TAG.digitized), exif.get(TAG.offsetDigitized)) ??
    parseStamp(root.get(TAG.dateTime), exif.get(TAG.offset))
  )
}

/**
 * When a JPEG says it was taken, read from its EXIF block. Only the first few thousand
 * bytes are needed. Returns null for anything else (PNG, screenshots, stripped photos).
 */
export function readExifDate(bytes: Uint8Array): ExifDate | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null
    let at = 2
    while (at + 4 <= view.byteLength) {
      if (view.getUint8(at) !== 0xff) return null
      const marker = view.getUint8(at + 1)
      // Start of the picture itself, or the end: no EXIF from here on.
      if (marker === 0xda || marker === 0xd9) return null
      const size = view.getUint16(at + 2)
      if (size < 2) return null
      if (marker === 0xe1 && ascii(view, at + 4, 6) === 'Exif\0\0') {
        const start = at + 10
        const length = Math.min(size - 8, view.byteLength - start)
        return length > 0 ? readTiff(new DataView(bytes.buffer, bytes.byteOffset + start, length)) : null
      }
      at += 2 + size
    }
    return null
  } catch {
    return null
  }
}

/** The moment an EXIF date stands for. Without a zone it is read as kitchen time (Zurich). */
export function exifMoment(exif: ExifDate): ISO | null {
  const { year, month, day, hour, minute, second, offsetMinutes } = exif
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  const dayText = `${pad(year, 4)}-${pad(month)}-${pad(day)}`
  // Reject the 31st of February and friends.
  const check = new Date(`${dayText}T00:00:00Z`)
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== dayText) return null
  if (offsetMinutes !== null) return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * MINUTE).toISOString()
  return zurichIso(dayText, hour * 60 + minute + second / 60)
}

/** A clock that is a few minutes ahead is still "now"; anything later is not believed. */
const CLOCK_SLACK = 5 * MINUTE

export interface CaptureInput {
  source: PhotoSource
  exif?: ExifDate | null
  /** File.lastModified, in milliseconds. */
  lastModified?: number
}

/**
 * When a proof photo was taken. A live photo was taken now. A gallery photo says so
 * itself (EXIF), or its file does; if neither can be believed it is now, too.
 */
export function captureTime(input: CaptureInput, now: number = Date.now()): ISO {
  if (input.source === 'gallery') {
    const fromExif = input.exif ? exifMoment(input.exif) : null
    const candidates = [fromExif ? Date.parse(fromExif) : NaN, input.lastModified ?? NaN]
    for (const moment of candidates) {
      if (Number.isFinite(moment) && moment > 0 && moment <= now + CLOCK_SLACK) return new Date(Math.min(moment, now)).toISOString()
    }
  }
  return new Date(now).toISOString()
}

// ---------------------------------------------------- correcting the time --

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** A moment as the value of a date-and-time field, on the kitchen's clock: "2026-11-10T19:42". */
export function toLocalInput(moment: ISO): string {
  return `${toDay(moment)}T${clock.format(new Date(moment))}`
}

/** The moment a date-and-time field stands for, read on the kitchen's clock. Null when it is not a full date and time. */
export function fromLocalInput(value: string): ISO | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return null
  const [hour, minute] = [Number(m[2]), Number(m[3])]
  if (hour > 23 || minute > 59) return null
  const check = new Date(`${m[1]}T00:00:00Z`)
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== m[1]) return null
  return zurichIso(m[1], hour * 60 + minute)
}
