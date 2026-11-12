// The basket (the shared shopping list) and the pantry: what is the same thing, what
// adding does, how the lists are ordered. Plain rules without a database, so the actions
// and the screens share them and every one is unit-tested.

import { normalize } from '../lib/text'
import type { BasketItem, ID, PantryItem } from './types'

export interface Line {
  name: string
  amount: string | null
}

// ------------------------------------------------------------- same thing? --

/** A word without what plurals add: "Zwiebeln" and "Zwiebel", "eggs" and "egg" meet. */
const stem = (word: string): string => (word.length > 3 ? word.replace(/(en|es|n|s|e)$/, '') : word)

/** The words that name a thing: no amounts, nothing after a comma or in brackets. */
function words(name: string): string[] {
  return normalize(name.split(/[,(]/)[0])
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 1)
    .map(stem)
}

/** True when two names mean the same thing on a list: "Zwiebeln" and "zwiebel", "Eggs" and "egg". */
export function sameThing(a: string, b: string): boolean {
  const one = words(a).join(' ')
  return one !== '' && one === words(b).join(' ')
}

/**
 * True when something at home answers an ingredient: "Butter" covers "butter, melted",
 * "Rüebli" covers "Rüebli (gross)", "Olivenöl" covers "Olivenöl extra vergine". It does
 * not look at amounts: that is for a person, or for Fork.
 */
export function covers(atHome: string, ingredient: string): boolean {
  const have = words(atHome)
  const need = words(ingredient)
  if (have.length === 0 || need.length === 0) return false
  const inside = (short: string[], long: string[]) => long.some((_, at) => short.every((word, i) => long[at + i] === word))
  return inside(have, need) || inside(need, have)
}

// ------------------------------------------------------------- the basket --

export interface BasketGroups {
  /** Fork's ideas nobody has decided about, newest check first. */
  suggested: BasketItem[]
  /** To buy: the newest on top, next to where it was typed. */
  open: BasketItem[]
  /** Ticked off, the last one first. */
  bought: BasketItem[]
}

export function groupBasket(items: readonly BasketItem[]): BasketGroups {
  const alive = items.filter((item) => !item.deletedAt)
  const newest = (a: BasketItem, b: BasketItem) => (a.createdAt === b.createdAt ? a.name.localeCompare(b.name) : a.createdAt < b.createdAt ? 1 : -1)
  return {
    suggested: alive.filter((item) => item.state === 'suggested').sort(newest),
    open: alive.filter((item) => item.state === 'open').sort(newest),
    bought: alive.filter((item) => item.state === 'bought').sort((a, b) => ((a.boughtAt ?? '') < (b.boughtAt ?? '') ? 1 : -1)),
  }
}

/**
 * What adding a line does to the list as it is: the same thing is never there twice.
 * - new: nothing like it yet.
 * - reopen: it was ticked off or only suggested: it goes back on the list (with the new amount, if one was typed).
 * - there: it is on the list already; a typed amount replaces the old one.
 */
export type Adding = { kind: 'new' } | { kind: 'reopen' | 'there'; item: BasketItem; amount: string | null }

export function adding(items: readonly BasketItem[], line: Line): Adding {
  const same = items.filter((item) => !item.deletedAt && sameThing(item.name, line.name))
  const open = same.find((item) => item.state === 'open')
  if (open) return { kind: 'there', item: open, amount: line.amount ?? open.amount }
  const other = same.find((item) => item.state === 'suggested') ?? same.find((item) => item.state === 'bought')
  if (other) return { kind: 'reopen', item: other, amount: line.amount ?? other.amount }
  return { kind: 'new' }
}

/** What clearing the bought things into the pantry does: an amount for what is there already, a new line for the rest. */
export function intoPantry(bought: readonly Pick<BasketItem, 'name' | 'amount'>[], pantry: readonly PantryItem[]): { update: { id: ID; amount: string | null }[]; add: Line[] } {
  const update: { id: ID; amount: string | null }[] = []
  const add: Line[] = []
  for (const item of bought) {
    const there = pantry.find((row) => !row.deletedAt && sameThing(row.name, item.name))
    if (there) {
      // What was bought is what is there now, as far as anybody wrote it down.
      if (item.amount && item.amount !== there.amount) update.push({ id: there.id, amount: item.amount })
    } else if (!add.some((line) => sameThing(line.name, item.name))) add.push({ name: item.name, amount: item.amount })
  }
  return { update, add }
}

// -------------------------------------------------------------- the pantry --

/** The pantry in the order a person looks things up: by name. */
export function sortPantry(items: readonly PantryItem[], lang: string): PantryItem[] {
  return items.filter((item) => !item.deletedAt).sort((a, b) => a.name.localeCompare(b.name, lang, { sensitivity: 'base' }))
}

/** What adding a line to the pantry does: the amount of what is there already, or a new line. */
export function stocking(pantry: readonly PantryItem[], line: Line): { kind: 'new' } | { kind: 'there'; item: PantryItem } {
  const there = pantry.find((row) => !row.deletedAt && sameThing(row.name, line.name))
  return there ? { kind: 'there', item: there } : { kind: 'new' }
}
