// When was a meal eaten? One rule, used where the time is shown (the verdict flow) and
// where it is stored (finishMeal), so the two can never disagree.

import type { ISO, ProofPhoto, Serving } from '../data/types'
import { toDay } from './dates'

/** The earliest proof photo of a meal, or null when there is none yet. */
export function firstPhotoTime(photos: readonly ProofPhoto[]): ISO | null {
  return photos.length ? photos.map((p) => p.takenAt).reduce((a, b) => (a < b ? a : b)) : null
}

/**
 * The first guess for "when was it eaten". The first proof photo says so, with one
 * exception: a photo taken on a later day than the meal came to the table does not carry
 * the meal over to its own day. That is a meal logged afterwards, or a proof that was
 * forgotten on the evening itself, and it belongs to the day it was on the table.
 */
export function eatenGuess(serving: Pick<Serving, 'servedAt' | 'proofPhotos'>): ISO | null {
  const first = firstPhotoTime(serving.proofPhotos)
  if (first === null) return null
  if (serving.servedAt && toDay(first) > toDay(serving.servedAt)) return serving.servedAt
  return first
}
