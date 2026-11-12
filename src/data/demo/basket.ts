// A basket and a pantry for the demo kitchen, so the page shows what it is for.

import { newId, type BasketItem, type PantryItem } from '../types'
import type { DemoKitchen } from './history'

type Lang = 'en' | 'de'

const BASKET: { en: string; de: string; amount: string | null; bought?: boolean }[] = [
  { en: 'Milk', de: 'Milch', amount: '1 l' },
  { en: 'Eggs', de: 'Eier', amount: '6' },
  { en: 'Butter', de: 'Butter', amount: null },
  { en: 'Bread', de: 'Brot', amount: null, bought: true },
]

const PANTRY: { en: string; de: string; amountEn: string | null; amountDe: string | null; daysAgo: number }[] = [
  { en: 'Flour', de: 'Mehl', amountEn: '1 kg', amountDe: '1 kg', daysAgo: 6 },
  { en: 'Onions', de: 'Zwiebeln', amountEn: '4', amountDe: '4', daysAgo: 2 },
  { en: 'Olive oil', de: 'Olivenöl', amountEn: null, amountDe: null, daysAgo: 9 },
  { en: 'Rice', de: 'Reis', amountEn: 'half a pack', amountDe: 'halbe Packung', daysAgo: 4 },
  { en: 'Cream', de: 'Rahm', amountEn: 'almost empty', amountDe: 'fast leer', daysAgo: 1 },
]

export function demoBasket(kitchen: DemoKitchen, lang: Lang, now: number = Date.now()): { basket: BasketItem[]; pantry: PantryItem[] } {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
  const basket = BASKET.map((row, index): BasketItem => {
    const made = at(180 - index * 10)
    return { id: newId(), householdId: kitchen.householdId, createdAt: made, updatedAt: made, deletedAt: null, name: row[lang], amount: row.amount, note: null, state: row.bought ? 'bought' : 'open', source: 'hand', reason: null, dishId: null, addedBy: kitchen.chefId, boughtAt: row.bought ? at(30) : null }
  })
  const pantry = PANTRY.map((row): PantryItem => {
    const noted = at(row.daysAgo * 24 * 60)
    return { id: newId(), householdId: kitchen.householdId, createdAt: noted, updatedAt: noted, deletedAt: null, name: row[lang], amount: lang === 'de' ? row.amountDe : row.amountEn }
  })
  return { basket, pantry }
}
