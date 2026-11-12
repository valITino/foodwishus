// The talk with Fork as the phone keeps it: what was said, the buttons under an answer,
// and which of them were tapped. It lives on this phone only, per person, and is short:
// the last turns are enough to follow a talk, and all that is ever sent along.

import type { AssistantPlace, AssistantTurn } from '../../data/backend'
import type { Day, ID, Slot } from '../../data/types'

/** A button under an answer, with the dish it means (not the ref it came with). */
export type Offer =
  | { kind: 'plan'; dishId: ID; day: Day; slot: Slot }
  | { kind: 'wish'; dishId: ID }
  | { kind: 'dish'; dishId: ID }
  | { kind: 'basket'; lines: { name: string; amount: string | null }[] }
  | { kind: 'pantry'; lines: { name: string; amount: string | null }[] }
  | { kind: 'recipe' }
  | { kind: 'go'; place: AssistantPlace }

export interface Turn {
  id: string
  who: 'me' | 'fork'
  text: string
  /** Fork only: the buttons under the answer. */
  offers?: Offer[]
  /** Which of the buttons were tapped, by their place in `offers`, and what came of it. */
  done?: Record<number, string>
}

/** How much of a talk is kept on the phone, and how much of it goes along with a question. */
export const KEPT_TURNS = 60
export const SENT_TURNS = 12

const key = (memberId: ID, demo: boolean): string => `foodwishus.fork.${demo ? 'demo.' : ''}${memberId}`

function isTurn(value: unknown): value is Turn {
  if (value === null || typeof value !== 'object') return false
  const turn = value as Record<string, unknown>
  return typeof turn.id === 'string' && (turn.who === 'me' || turn.who === 'fork') && typeof turn.text === 'string'
}

/** The talk this person had on this phone. Empty when there is none, or when it cannot be read. */
export function loadTalk(memberId: ID, demo = false): Turn[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(memberId, demo)) ?? '[]')
    return Array.isArray(saved) ? saved.filter(isTurn).slice(-KEPT_TURNS) : []
  } catch {
    return []
  }
}

export function saveTalk(memberId: ID, turns: Turn[], demo = false): void {
  try {
    if (turns.length === 0) localStorage.removeItem(key(memberId, demo))
    else localStorage.setItem(key(memberId, demo), JSON.stringify(turns.slice(-KEPT_TURNS)))
  } catch {
    // A full or closed storage loses the talk, never the answer on screen.
  }
}

/**
 * What goes along with a question: the last turns, starting with something the person
 * said, without anything that is not words (a failed question has no answer and is not
 * kept in the first place).
 */
export function toSend(turns: Turn[], question: string): AssistantTurn[] {
  const before = turns.slice(-SENT_TURNS).map((turn) => ({ who: turn.who, text: turn.text }))
  while (before.length > 0 && before[0].who !== 'me') before.shift()
  return [...before, { who: 'me', text: question }]
}

let counter = 0
/** An id for a turn: only ever compared on this phone. */
export const turnId = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}`
