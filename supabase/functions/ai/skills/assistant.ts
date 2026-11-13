// Skill: Fork, the kitchen assistant. A talk, not a form.
//
// In:  the talk so far, the kitchen as the phone knows it (dishes, plan, wishlist, what
//      was eaten, pantry, basket), and whole recipes where they are needed.
// Out: an answer in plain words, up to four offers (buttons the person can tap), and
//      "look": dishes whose whole recipe the assistant wants to see before it answers.
//
// Three things make the assistant: what it knows about food (that is the model), what it
// is told about this kitchen (the phone sends it with every question, nothing is kept),
// and what it knows about the app (APP_GUIDE below, kept true by whoever changes the app).
// It never changes anything by itself: an offer is a button, the person taps.

import type { AssistantAsk, AssistantOffer, AssistantPlace, AssistantTurn } from '../contract.ts'
import { plain } from '../page.ts'
import { houseRules } from './house-rules.ts'

export const ASSISTANT_LIMITS = { turns: 16, turn: 2000, answer: 4000, dishes: 250, plan: 40, wishes: 40, eaten: 40, pantry: 200, basket: 100, line: 240, recipes: 4, recipe: 3000, offers: 4, look: 3, lines: 30 }

export const PLACES: readonly AssistantPlace[] = ['recipes', 'new-dish', 'link', 'wishlist', 'week', 'basket', 'pantry', 'cockpit', 'photos', 'settings', 'calories', 'notifications', 'backup']
const SLOTS = ['breakfast', 'lunch', 'dinner', 'dessert'] as const
const KINDS = ['plan', 'wish', 'basket', 'pantry', 'dish', 'recipe', 'go'] as const

/**
 * The app, as the assistant needs to know it to answer "how do I ..." and "where is ...".
 * Keep it true: when a screen, a button or a rule changes, change the line here too.
 * Names of tabs and buttons are given in English and German, so the answer can use the
 * words the person sees.
 */
export const APP_GUIDE = [
  'The app has five tabs at the bottom: Today (Heute), Wishlist (Wunschliste), Week (Woche), Cockpit, Recipes (Rezepte). The round + in the middle of the bar adds things: a new dish, a recipe from a link, something for the basket, a menu, a meal for today, and it opens you ("Ask Fork", "Fork fragen").',
  'Two people share one kitchen. Roles belong to each meal: one cooks it, the other is its taster. The usual order is: propose a dish, the taster gives hearts, pick a day, the cook taps Served, the taster takes the proof photo and gives the verdict.',
  'Today: what is on the table today and what comes next. The cook taps "Served" ("Serviert") when the food is on the table. The taster then takes the proof photo, taps a face for the quick verdict and can add details: spoons for taste, looks and the other criteria, the portion, a few words. A verdict can be changed for 24 hours, then it is sealed. The cook can answer it. Under the picture on Today are the bell (what the other one did), the basket and you. In the bell\'s list, "Select" ("Auswählen") turns the lines into things to tick, one by one or with "Select all", and "Delete" takes the ticked ones off this phone.',
  'Wishlist: every dish and menu that was proposed. The taster gives 1 to 5 hearts for how much they want it. Cards are dragged into order, the top one is the biggest wish. Tapping a card opens the meal: pick a day, change who cooks, add a note, skip it, remove it.',
  'Week: the calendar, as a week or a month. Tapping a meal of a day (breakfast, lunch, dinner, dessert) puts something there: a wish, a meal planned for another moment (it moves), or anything from the recipe book. A slot that is taken still takes another dish. A planned meal can be dragged to another day. Days that are over take no plan.',
  'Any day can be picked: wherever a day is chosen there are two weeks to tap and a date field for every later day.',
  'Recipes: the recipe book with dishes and menus. A dish has ingredients, steps with timers, times, servings, tags, a picture, a source and, when switched on, calories. On a dish: "Cook" opens cook mode (one step at a time in big letters, timers, the screen stays awake, "Served" at the end); the servings can be changed and the amounts follow; "Ingredients into the basket"; "Propose" ("Vorschlagen") sends it to the wishlist with good days, or straight onto a day. A menu is several dishes served as courses.',
  'A recipe from a link or a photo: +, then "A recipe from a link or a photo" ("Ein Rezept aus einem Link oder Foto"). "From a photo" takes one to four photos of a cookbook page, a handwritten card or a screenshot, and fills the dish form the same way. For a link: paste a link from Pinterest or a recipe site and tap "Read recipe". The dish form opens filled in; nothing is saved before "Save dish". Switches decide the language, converting cups and Fahrenheit, the picture, and estimating calories. On Android with the installed app, "Share" in Pinterest or the browser offers FoodwishUs.',
  'Calories are hidden unless switched on in Settings ("Show calories"). In the dish form, "Let Fork estimate" works them out from the ingredients. The Cockpit then has a calories part.',
  'Basket (Korb): the shared shopping list, behind the basket button on Today and in +. Type a thing and press Enter ("Milk 2 l"). Tick it in the shop. "Clear" removes what was bought and can note it in the pantry. Fork compares the meals planned for the next 7 days with the pantry and suggests what to buy; suggestions wait until somebody accepts them.',
  'Pantry (Vorrat): what is at home, in your own words ("Flour 1 kg", "Milk, almost empty"). It is the second view of the basket page. "Used up" takes a thing out and puts it on the basket. "Tell Fork what is there" turns a sentence into pantry lines, and "Show Fork a photo" ("Fork ein Foto zeigen") does it from photos of the open fridge, a shelf or single things: the lines are shown to look over before they are saved.',
  'Cockpit: the numbers. Favourites, ratings over time, how well cravings predicted the verdict, a calendar of hearts, the Hall of Fame, fun facts. A filter narrows it to a time, a dish, a course or a cook.',
  'Photo wall: all proof photos together, reached from Today or from any eaten meal.',
  'Plans change: a meal for today can be added from + at any time; the cook can serve a meal early; who cooks can be swapped until the verdict has started; a served meal can be skipped; an eaten meal can be removed while its verdict is not sealed. A meal that was forgotten is logged with "A meal for today": its photo, or "Change time" under it, puts it on the day it was eaten.',
  'Settings (tap your own picture at the top of Today): profile (name, picture, status), language (English or German), light or candlelight, show calories, notifications, the rating criteria, people (the admin invites the partner by link or QR code and can pause a seat), PIN and devices, backup (a file with everything, to keep and to bring back), and the sync page (what waits to be sent, and changes the cloud refused).',
  'The app works without a connection and syncs the two phones when there is one. Asking you, reading a link and Fork\'s checks need a connection. It is installed from the browser: in Chrome on Android, the menu with the three dots, then "Add to home screen" or "Install app".',
  'Here, in the talk with you, the camera button next to the question adds up to three photos to a question: of the fridge, of a recipe, of a dish.',
  'What you cannot do: change settings, delete or rate anything, see the proof photos or any photo that was not shown to you with a question, read notes the two wrote to each other, or know their names.',
]

export const ASSISTANT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'offers', 'look'],
  properties: {
    text: { type: 'string', description: 'The answer in plain words. Empty only when "look" asks for recipes first.' },
    offers: {
      type: 'array',
      description: 'Up to four buttons under the answer. Empty for a plain answer.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'dish', 'day', 'slot', 'place', 'lines'],
        properties: {
          kind: { type: 'string', enum: [...KINDS] },
          dish: { type: 'string', description: 'For plan, wish and dish: the ref of a dish from the recipe book, like "D12". Else empty.' },
          day: { type: 'string', description: 'For plan: the day as YYYY-MM-DD, today or later. Else empty.' },
          slot: { type: 'string', enum: [...SLOTS, ''], description: 'For plan: the meal of the day. Else empty.' },
          place: { type: 'string', enum: [...PLACES, ''], description: 'For go: the place in the app to open. Else empty.' },
          lines: {
            type: 'array',
            description: 'For basket and pantry: the things, one per line. Else empty.',
            items: { type: 'object', additionalProperties: false, required: ['name', 'amount'], properties: { name: { type: 'string' }, amount: { type: 'string', description: 'As a person would write it ("500 g", "2"), or empty.' } } },
          },
        },
      },
    },
    look: { type: 'array', description: 'Refs of dishes whose whole recipe you need to see before you can answer. Usually empty.', items: { type: 'string' } },
  },
} as const

export interface AssistantAnswer {
  text: string
  offers: AssistantOffer[]
  look: string[]
}

const str = (value: unknown, max: number): string => (typeof value === 'string' ? plain(value).slice(0, max) : '')

/** "D12" from the start of a line of the recipe book or of a whole recipe. */
export const refOf = (line: string): string | null => /^(D\d{1,4})\b/.exec(line)?.[1] ?? null

function realDay(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= today
}

function things(value: unknown): { name: string; amount: string | null }[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: { name: string; amount: string | null }[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const name = str(raw.name, 80)
    if (name === '' || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({ name, amount: str(raw.amount, 40) || null })
    if (out.length >= ASSISTANT_LIMITS.lines) break
  }
  return out
}

/** One offer, checked against what the kitchen really has. Null: not something the app can do. */
function offer(value: unknown, refs: Set<string>, today: string): AssistantOffer | null {
  if (value === null || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const dish = typeof raw.dish === 'string' && refs.has(raw.dish.trim()) ? raw.dish.trim() : null
  switch (raw.kind) {
    case 'plan': {
      const slot = SLOTS.find((name) => name === raw.slot)
      return dish && slot && typeof raw.day === 'string' && realDay(raw.day, today) ? { kind: 'plan', dish, day: raw.day, slot } : null
    }
    case 'wish':
      return dish ? { kind: 'wish', dish } : null
    case 'dish':
      return dish ? { kind: 'dish', dish } : null
    case 'basket':
    case 'pantry': {
      const lines = things(raw.lines)
      return lines.length > 0 ? { kind: raw.kind, lines } : null
    }
    case 'recipe':
      return { kind: 'recipe' }
    case 'go': {
      const place = PLACES.find((name) => name === raw.place)
      return place ? { kind: 'go', place } : null
    }
    default:
      return null
  }
}

const block = (title: string, lines: string[], empty: string): string => `${title}\n${lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : `- ${empty}`}`

export const assistantSkill = {
  name: 'assistant',
  maxTokens: 2500,
  schema: ASSISTANT_SCHEMA,

  system(request: Pick<AssistantAsk, 'lang'>): string {
    return [
      houseRules(request.lang),
      '',
      'Job: you are Fork, the kitchen assistant of this app. Fork is its mascot, a small friendly fork. You talk with one of the two people of the kitchen.',
      'You know three things well:',
      '1. Food and cooking: techniques, times and temperatures, substitutions, what goes with what, shopping and seasons, storing, food safety, nutrition. Here your own knowledge is welcome: the rule "never invent facts" is about this kitchen and this app, not about cooking.',
      '2. This kitchen: the lines under "The kitchen" in the last message are what the phone knows right now. They are the only truth about its dishes, plans, wishes, pantry, basket and ratings. What is not there, you do not know: say so, never guess.',
      '3. The app: the guide at the end. Use the names of tabs and buttons as they are written there, in the language you answer in.',
      '',
      'How to answer:',
      '- text: as short as it can be and still be useful, usually one to five sentences. A recipe, or a plan for several days, may be longer. Plain text only: line breaks are fine, list lines start with "- ". No headings, no bold, no tables.',
      '- Say "you" to the person and "your partner" for the other one. You do not know their names.',
      '- When the kitchen\'s own lines answer the question, use them and say what you saw ("You have rice and eggs at home").',
      '- Be concrete: grams, minutes, degrees. For a recipe: the name, for how many servings, the ingredients with amounts one per line, then the steps one per line, not numbered.',
      '- Nutrition numbers are estimates: say "about". Bring calories up only when asked, or when the kitchen says calories are shown. No targets, and no judgement about what somebody eats. For a diet that an illness asks for, give general knowledge and say that a doctor or dietitian knows the person.',
      '- Food safety is said plainly: core temperatures for meat and poultry, how long leftovers keep, what must not be eaten raw.',
      '- Days: "The kitchen" gives today. "Friday" means the next Friday, today included. Never plan for a day that is over.',
      '- A question that has nothing to do with food, cooking, this kitchen or the app: say in one sentence that you are the kitchen\'s fork, and what you can help with.',
      '',
      'Photos:',
      '- A question can come with photos. Look at them and answer about what you see. Photos of earlier questions are not shown to you again: you only have what you said about them.',
      '- A fridge, a shelf, or things held to the camera: say what you can make out, and offer "pantry" with those lines. Only what you see, with an amount only where it can be seen or read. Never what might be behind or inside.',
      '- A recipe (a page, a card, a screenshot): write it out in your text, name, servings, ingredients and steps, and offer "recipe". Where the writing is unclear, say which part.',
      '- A dish or an ingredient: say what it most likely is, and that it is a guess from a picture.',
      '- When a photo is too dark or too blurred to tell, say so and ask for another one.',
      '',
      'Offers, the buttons under your answer:',
      '- You never change anything yourself. An offer is a button: the person taps it, and the app does it. So write what the button will do ("I can put it on Friday"), never that it is done.',
      '- plan: put a dish from the recipe book on a day and a meal. Needs dish, day and slot.',
      '- wish: put a dish from the recipe book on the wishlist. Needs dish.',
      '- basket: put things on the shopping list. Needs lines. Leave out what the pantry has (unless its note says it is nearly gone), what is on the basket already, and salt, pepper and water.',
      '- pantry: note things in the pantry, when the person says what they bought or have. Needs lines.',
      '- dish: a button that opens a dish from the recipe book. Needs dish.',
      '- recipe: when your text holds a complete recipe that is not in the recipe book (name, ingredients with amounts, steps), a button that puts it into the dish form to look over and save.',
      `- go: a button that opens a place in the app, for "where do I find" and "how do I". Needs place: ${PLACES.join(', ')}.`,
      '- A dish that is not in the recipe book has no ref, so it cannot be planned or wished for: offer its recipe first.',
      '- Offer only what was asked for or clearly helps, at most four. A plain question gets a plain answer and no offers. Fill the fields a kind does not need with "" and [].',
      '',
      'look:',
      '- The recipe book lines carry no ingredients and no steps. When you need the whole recipe of a dish from the book (what is in it, how it is cooked, its amounts) and it is not under "Whole recipes" in the last message, put its ref into look (at most three), and leave text empty and offers empty. The app sends the recipes and asks again.',
      '',
      'The guide to the app:',
      ...APP_GUIDE.map((line) => `- ${line}`),
    ].join('\n')
  },

  /** The last message: the kitchen as it is now, whole recipes, then the question. */
  user(request: AssistantAsk): string {
    const { kitchen } = request
    const question = request.turns.at(-1)?.text ?? ''
    return [
      '<kitchen>',
      `Today: ${kitchen.today}${kitchen.weekday ? ` (${kitchen.weekday})` : ''}. Calories: ${kitchen.calories ? 'shown' : 'hidden'}.`,
      block('Recipe book (ref | name | what the phone knows about it):', kitchen.dishes, 'empty'),
      block('Planned:', kitchen.plan, 'nothing'),
      block('Wishlist:', kitchen.wishes, 'empty'),
      block('Eaten lately:', kitchen.eaten, 'nothing'),
      block('Pantry:', kitchen.pantry, 'nothing noted'),
      block('Basket:', kitchen.basket, 'empty'),
      '</kitchen>',
      '',
      request.recipes.length > 0 ? `<recipes>\nWhole recipes:\n\n${request.recipes.join('\n\n')}\n</recipes>\n` : '',
      request.photos?.length ? `With this question ${request.photos.length === 1 ? 'comes the photo' : `come the ${request.photos.length} photos`} above.\n` : '',
      `<question>\n${question}\n</question>`,
    ].join('\n')
  },

  /** The talk before the question, as the API wants it: starting with the person, the two taking turns. */
  history(turns: AssistantTurn[]): { role: 'user' | 'assistant'; content: string }[] {
    const out: { role: 'user' | 'assistant'; content: string }[] = []
    for (const turn of turns.slice(0, -1)) {
      const role = turn.who === 'me' ? 'user' : 'assistant'
      const last = out.at(-1)
      if (!last && role === 'assistant') continue
      if (last?.role === role) last.content += `\n\n${turn.text}`
      else out.push({ role, content: turn.text })
    }
    // The question comes next and is the person's. An earlier question that never got its answer is left out.
    if (out.at(-1)?.role === 'user') out.pop()
    return out
  },

  /** The answer, checked against the kitchen it was asked about. Null: nothing usable came back. */
  read(answer: unknown, request: AssistantAsk): AssistantAnswer | null {
    if (answer === null || typeof answer !== 'object') return null
    const raw = answer as Record<string, unknown>
    const refs = new Set(request.kitchen.dishes.map(refOf).filter((ref): ref is string => ref !== null))
    const shown = new Set(request.recipes.map(refOf).filter((ref): ref is string => ref !== null))
    const look = Array.isArray(raw.look) ? [...new Set(raw.look.filter((ref): ref is string => typeof ref === 'string').map((ref) => ref.trim()))].filter((ref) => refs.has(ref) && !shown.has(ref)).slice(0, ASSISTANT_LIMITS.look) : []
    const text = typeof raw.text === 'string' ? raw.text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, ASSISTANT_LIMITS.answer) : ''
    // It wants to read first: the app sends the recipes and asks again.
    if (text === '' && look.length > 0) return { text: '', offers: [], look }
    if (text === '') return null
    const offers: AssistantOffer[] = []
    const seen = new Set<string>()
    for (const entry of Array.isArray(raw.offers) ? raw.offers : []) {
      const checked = offer(entry, refs, request.kitchen.today)
      const key = JSON.stringify(checked)
      if (!checked || seen.has(key)) continue
      seen.add(key)
      offers.push(checked)
      if (offers.length >= ASSISTANT_LIMITS.offers) break
    }
    return { text, offers, look: [] }
  },
}
