// Every word of the basket and the pantry, in English and German (informal "du", Swiss spelling).

import { useCopy } from '../../i18n'
import type { ReadProblem } from '../../data/helper'

const en = {
  title: 'Basket',
  views: 'Basket or pantry',
  basket: 'Basket',
  pantry: 'Pantry',
  open: (n: number) => (n === 1 ? '1 thing to buy' : `${n} things to buy`),
  entry: (n: number) => (n === 0 ? 'Basket' : n === 1 ? 'Basket, 1 thing to buy' : `Basket, ${n} things to buy`),

  // Adding
  addLabel: 'Add to the basket',
  addPlaceholder: 'Milk, 2 l',
  addButton: 'Add',
  addHint: 'Several at once: put a comma between them.',
  added: (n: number) => (n === 1 ? 'Added' : `${n} added`),
  alreadyThere: (name: string) => `${name} is on the list already.`,

  // The list
  toBuy: 'To buy',
  bought: 'Bought',
  tick: (name: string) => `Bought: ${name}`,
  untick: (name: string) => `Back on the list: ${name}`,
  edit: (name: string) => `Change ${name}`,
  emptyTitle: 'Nothing to buy',
  emptyBody: 'The basket is empty.',
  clear: 'Clear',
  clearTitle: 'Clear what was bought?',
  clearBody: (n: number) => (n === 1 ? '1 thing leaves the list.' : `${n} things leave the list.`),
  clearIntoPantry: 'Clear and note in the pantry',
  clearOnly: 'Just clear',
  cleared: 'Cleared',
  clearedIntoPantry: 'Cleared and noted in the pantry',
  later: 'Saved on this phone. Your partner sees the basket and the pantry once the kitchen has been updated.',

  // One thing
  itemTitle: 'On the basket',
  name: 'What',
  amount: 'How much',
  amountPlaceholder: '500 g',
  note: 'Note',
  notePlaceholder: 'The one in the blue pack',
  remove: 'Take it off the list',
  removed: 'Taken off the list',
  saved: 'Saved',

  // Fork
  forkTitle: 'What is missing for the next meals?',
  forkBody: 'Fork compares the plan for the next 7 days with the pantry.',
  forkButton: 'Check the plan',
  forkChecking: 'Fork is checking the plan',
  forkAuto: 'Check by himself when the plan changes',
  suggestsCount: (n: number) => (n === 1 ? 'Fork suggests 1 thing' : `Fork suggests ${n} things`),
  showAll: (n: number) => `Show all ${n}`,
  accept: (name: string) => `Put ${name} on the list`,
  dismiss: (name: string) => `Not needed: ${name}`,
  acceptAll: 'Add all',
  dismissAll: 'None of them',
  outcome: {
    noMeals: 'Nothing is planned for the next 7 days. Plan a meal, then check again.',
    nothing: 'Everything for the next meals is at home.',
    found: (n: number) => (n === 1 ? 'Fork found 1 thing. It is above, for you to decide.' : `Fork found ${n} things. They are above, for you to decide.`),
    plain: (n: number) => (n === 1 ? '1 ingredient of the planned meals is not in the pantry. It is above.' : `${n} ingredients of the planned meals are not in the pantry. They are above.`),
    plainNothing: 'Every ingredient of the planned meals is in the pantry or on the list.',
  },
  // Why Fork could only compare names. The plain list comes anyway.
  fallback: {
    emptyPantry: 'The pantry is empty, so this is every ingredient of the planned meals. Note what is at home and Fork can leave that out.',
    offline: 'No connection, so Fork only compared names.',
    demo: 'In the demo kitchen Fork only compares names.',
    limit: 'Fork has been asked often enough for today, so he only compared names.',
    helper_off: 'The AI helper is not set up for this kitchen yet, so Fork only compared names.',
    other: 'The AI helper is not answering right now, so Fork only compared names.',
  },
  // The reason on a suggestion that Fork made by comparing names only.
  reason: (dish: string, day: string, meals: number) => (meals > 1 ? `For ${dish} on ${day} and ${meals - 1} more.` : `For ${dish} on ${day}.`),

  // The pantry
  pantryAddLabel: 'Note what is at home',
  pantryPlaceholder: 'Flour, 1 kg',
  pantryHint: 'Write it the way you see it: "Milk, almost empty" is fine.',
  noted: (n: number) => (n === 1 ? 'Noted' : `${n} noted`),
  pantryEmptyTitle: 'Nothing noted yet',
  pantryEmptyBody: 'Tell Fork what is at home.',
  pantryCount: (n: number) => (n === 1 ? '1 thing at home' : `${n} things at home`),
  notedAgo: (days: number) => (days === 0 ? 'Noted today' : days === 1 ? 'Noted yesterday' : `Noted ${days} days ago`),
  noAmount: 'There',
  pantryItemTitle: 'In the pantry',
  left: 'How much is left',
  leftPlaceholder: 'Half a pack',
  usedUp: 'Used up, put it on the basket',
  usedUpDone: (name: string) => `${name} is on the basket`,
  removeFromPantry: 'Take it out of the pantry',
  editPantry: (name: string) => `Change ${name}`,

  // Telling Fork
  tell: 'Tell Fork what is there',
  tellTitle: 'What is at home?',
  tellLabel: 'Write or dictate it the way you would say it',
  tellPlaceholder: 'We still have 2 onions, half a kilo of flour, and the milk is almost gone',
  tellSort: 'Sort it',
  tellSorting: 'Fork is sorting it',
  tellResult: 'This is what Fork understood',
  tellNothing: 'Fork found nothing for the pantry in that. Write what is there, for example "6 eggs, butter".',
  tellSave: 'Put it into the pantry',
  tellAgain: 'Write it again',
  tellProblem: {
    offline: 'No connection. Fork needs the internet for this. One thing per line works without.',
    demo: 'In the demo kitchen Fork cannot read sentences. Add one thing at a time.',
    limit: 'Fork has been asked often enough for today. Add one thing at a time, or try tomorrow.',
    helper_off: 'The AI helper is not set up for this kitchen yet. Add one thing at a time.',
    not_signed_in: 'This phone is not logged in to the kitchen any more. Log in again.',
    other: 'The AI helper is not answering right now. Try again in a moment, or add one thing at a time.',
  },

  // From a dish
  fromDish: 'Ingredients into the basket',
  fromDishTitle: 'What do you need to buy?',
  fromDishHint: 'What is in the pantry is not ticked.',
  fromDishAdd: (n: number) => (n === 1 ? 'Put 1 thing on the basket' : `Put ${n} things on the basket`),
  fromDishNone: 'This dish has no ingredients written down.',
  inPantry: 'in the pantry',
  onBasket: 'on the basket',

}

const de: typeof en = {
  title: 'Korb',
  views: 'Korb oder Vorrat',
  basket: 'Korb',
  pantry: 'Vorrat',
  open: (n) => (n === 1 ? '1 Sache einzukaufen' : `${n} Sachen einzukaufen`),
  entry: (n) => (n === 0 ? 'Korb' : n === 1 ? 'Korb, 1 Sache einzukaufen' : `Korb, ${n} Sachen einzukaufen`),

  addLabel: 'In den Korb legen',
  addPlaceholder: 'Milch, 2 l',
  addButton: 'Hinzufügen',
  addHint: 'Mehrere auf einmal: mit Komma trennen.',
  added: (n) => (n === 1 ? 'Hinzugefügt' : `${n} hinzugefügt`),
  alreadyThere: (name) => `${name} steht schon auf der Liste.`,

  toBuy: 'Einkaufen',
  bought: 'Gekauft',
  tick: (name) => `Gekauft: ${name}`,
  untick: (name) => `Zurück auf die Liste: ${name}`,
  edit: (name) => `${name} ändern`,
  emptyTitle: 'Nichts einzukaufen',
  emptyBody: 'Der Korb ist leer.',
  clear: 'Leeren',
  clearTitle: 'Gekauftes leeren?',
  clearBody: (n) => (n === 1 ? '1 Sache verschwindet von der Liste.' : `${n} Sachen verschwinden von der Liste.`),
  clearIntoPantry: 'Leeren und im Vorrat notieren',
  clearOnly: 'Nur leeren',
  cleared: 'Geleert',
  clearedIntoPantry: 'Geleert und im Vorrat notiert',
  later: 'Auf diesem Handy gespeichert. Dein Partner sieht Korb und Vorrat, sobald die Küche aktualisiert ist.',

  itemTitle: 'Im Korb',
  name: 'Was',
  amount: 'Wie viel',
  amountPlaceholder: '500 g',
  note: 'Notiz',
  notePlaceholder: 'Die in der blauen Packung',
  remove: 'Von der Liste nehmen',
  removed: 'Von der Liste genommen',
  saved: 'Gespeichert',

  forkTitle: 'Was fehlt für die nächsten Essen?',
  forkBody: 'Fork vergleicht den Plan der nächsten 7 Tage mit dem Vorrat.',
  forkButton: 'Plan prüfen',
  forkChecking: 'Fork prüft den Plan',
  forkAuto: 'Von selbst prüfen, wenn sich der Plan ändert',
  suggestsCount: (n) => (n === 1 ? 'Fork schlägt 1 Sache vor' : `Fork schlägt ${n} Sachen vor`),
  showAll: (n) => `Alle ${n} zeigen`,
  accept: (name) => `${name} auf die Liste setzen`,
  dismiss: (name) => `Nicht nötig: ${name}`,
  acceptAll: 'Alle hinzufügen',
  dismissAll: 'Keine davon',
  outcome: {
    noMeals: 'Für die nächsten 7 Tage ist nichts geplant. Plane ein Essen und prüf dann nochmal.',
    nothing: 'Für die nächsten Essen ist alles im Haus.',
    found: (n) => (n === 1 ? 'Fork hat 1 Sache gefunden. Sie steht oben, du entscheidest.' : `Fork hat ${n} Sachen gefunden. Sie stehen oben, du entscheidest.`),
    plain: (n) => (n === 1 ? '1 Zutat der geplanten Essen ist nicht im Vorrat. Sie steht oben.' : `${n} Zutaten der geplanten Essen sind nicht im Vorrat. Sie stehen oben.`),
    plainNothing: 'Jede Zutat der geplanten Essen ist im Vorrat oder auf der Liste.',
  },
  fallback: {
    emptyPantry: 'Der Vorrat ist leer, darum sind das alle Zutaten der geplanten Essen. Notiere, was im Haus ist, dann lässt Fork das weg.',
    offline: 'Keine Verbindung, darum hat Fork nur die Namen verglichen.',
    demo: 'In der Demo-Küche vergleicht Fork nur die Namen.',
    limit: 'Fork wurde heute schon oft genug gefragt, darum hat er nur die Namen verglichen.',
    helper_off: 'Der KI-Helfer ist für diese Küche noch nicht eingerichtet, darum hat Fork nur die Namen verglichen.',
    other: 'Der KI-Helfer antwortet gerade nicht, darum hat Fork nur die Namen verglichen.',
  },
  reason: (dish, day, meals) => (meals > 1 ? `Für ${dish} am ${day} und ${meals - 1} weitere.` : `Für ${dish} am ${day}.`),

  pantryAddLabel: 'Notieren, was im Haus ist',
  pantryPlaceholder: 'Mehl, 1 kg',
  pantryHint: 'Schreib es, wie du es siehst: «Milch, fast leer» ist gut.',
  noted: (n) => (n === 1 ? 'Notiert' : `${n} notiert`),
  pantryEmptyTitle: 'Noch nichts notiert',
  pantryEmptyBody: 'Sag Fork, was im Haus ist.',
  pantryCount: (n) => (n === 1 ? '1 Sache im Haus' : `${n} Sachen im Haus`),
  notedAgo: (days) => (days === 0 ? 'Heute notiert' : days === 1 ? 'Gestern notiert' : `Vor ${days} Tagen notiert`),
  noAmount: 'Vorhanden',
  pantryItemTitle: 'Im Vorrat',
  left: 'Wie viel ist noch da',
  leftPlaceholder: 'Halbe Packung',
  usedUp: 'Aufgebraucht, in den Korb damit',
  usedUpDone: (name) => `${name} ist im Korb`,
  removeFromPantry: 'Aus dem Vorrat nehmen',
  editPantry: (name) => `${name} ändern`,

  tell: 'Fork sagen, was da ist',
  tellTitle: 'Was ist im Haus?',
  tellLabel: 'Schreib oder diktiere es so, wie du es sagen würdest',
  tellPlaceholder: 'Wir haben noch 2 Zwiebeln, ein halbes Kilo Mehl, und die Milch ist fast leer',
  tellSort: 'Sortieren',
  tellSorting: 'Fork sortiert es',
  tellResult: 'Das hat Fork verstanden',
  tellNothing: 'Darin hat Fork nichts für den Vorrat gefunden. Schreib, was da ist, zum Beispiel «6 Eier, Butter».',
  tellSave: 'In den Vorrat legen',
  tellAgain: 'Nochmal schreiben',
  tellProblem: {
    offline: 'Keine Verbindung. Dafür braucht Fork Internet. Eine Sache pro Zeile geht auch ohne.',
    demo: 'In der Demo-Küche kann Fork keine Sätze lesen. Füge eine Sache nach der anderen hinzu.',
    limit: 'Fork wurde heute schon oft genug gefragt. Füge eine Sache nach der anderen hinzu oder probier es morgen.',
    helper_off: 'Der KI-Helfer ist für diese Küche noch nicht eingerichtet. Füge eine Sache nach der anderen hinzu.',
    not_signed_in: 'Dieses Handy ist nicht mehr in der Küche angemeldet. Melde dich wieder an.',
    other: 'Der KI-Helfer antwortet gerade nicht. Probier es gleich nochmal oder füge eine Sache nach der anderen hinzu.',
  },

  fromDish: 'Zutaten in den Korb',
  fromDishTitle: 'Was musst du einkaufen?',
  fromDishHint: 'Was im Vorrat ist, ist nicht angekreuzt.',
  fromDishAdd: (n) => (n === 1 ? '1 Sache in den Korb legen' : `${n} Sachen in den Korb legen`),
  fromDishNone: 'Für dieses Gericht sind keine Zutaten notiert.',
  inPantry: 'im Vorrat',
  onBasket: 'im Korb',

}

export const basketCopy = { en, de }
export type BasketCopy = typeof en

export function useBasketCopy(): BasketCopy {
  return useCopy(basketCopy)
}

/** The sentence for why Fork fell back to comparing names. */
export function fallbackLine(c: BasketCopy, why: ReadProblem | 'emptyPantry'): string {
  if (why === 'emptyPantry' || why === 'offline' || why === 'demo' || why === 'limit' || why === 'helper_off') return c.fallback[why]
  return c.fallback.other
}

/** The sentence for why Fork could not sort a text into pantry lines. */
export function tellProblemLine(c: BasketCopy, why: ReadProblem): string {
  if (why === 'offline' || why === 'demo' || why === 'limit' || why === 'helper_off') return c.tellProblem[why]
  if (why === 'not_signed_in' || why === 'not_member') return c.tellProblem.not_signed_in
  return c.tellProblem.other
}
