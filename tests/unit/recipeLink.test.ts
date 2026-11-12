import { describe, expect, it } from 'vitest'
import { BackendError } from '../../src/data/backend'
import { mostUsedTags, ReadError, readProblem } from '../../src/data/helper'
import { dishFromPage, draftFromCard, dropHandover, handOver, handoverFor, kitchenTag, linkIn, pictureFile, sectionFor, shownChecks, siteName } from '../../src/features/recipes/importLogic'
import { dishInputFromDraft, emptyDraft } from '../../src/features/recipes/logic'
import { PRETEND_JPEG } from '../../src/data/fake/pretendWeb'
import type { RecipeCard } from '../../src/data/backend'

const card = (over: Partial<RecipeCard> = {}): RecipeCard => ({
  name: 'Rüeblisuppe mit Ingwer',
  description: 'Wärmt von innen.',
  course: 'starter',
  effort: 'easy',
  tags: ['suppe', 'Vegetarisch', 'suppe'],
  servings: 4,
  prepMinutes: 15,
  cookMinutes: 25,
  ingredientLines: ['600 g Rüebli', '1 Zwiebel', '2-3 cm Ingwer', '8 dl Gemüsebouillon', 'Salz'],
  steps: ['Rüebli schälen und in Stücke schneiden.', 'Alles 25 Minuten köcheln lassen.', 'Pürieren, 30 Sekunden reichen.', 'Über Nacht, also 12 Stunden, ziehen lassen.'],
  notes: 'Mit einem Klecks Rahm servieren.',
  kcalPerServing: 180,
  proteinPerServing: null,
  carbsPerServing: null,
  fatPerServing: null,
  nutritionEstimated: false,
  checks: [],
  ...over,
})

describe('the link in whatever was pasted or shared', () => {
  it('finds it in a sentence, with or without https://', () => {
    expect(linkIn('https://www.lecker-kochen.ch/rezepte/rueeblisuppe')).toBe('https://www.lecker-kochen.ch/rezepte/rueeblisuppe')
    expect(linkIn('Schau dir diesen Pin an: https://pin.it/AbC')).toBe('https://pin.it/AbC')
    expect(linkIn('  sunnykitchen.com/cornbread ')).toBe('https://sunnykitchen.com/cornbread')
  })

  it('says so when there is none', () => {
    expect(linkIn('')).toBeNull()
    expect(linkIn('Rüeblisuppe von Mama')).toBeNull()
  })
})

describe('a recipe card becomes the dish form', () => {
  const draft = draftFromCard(card(), 'https://www.lecker-kochen.ch/rezepte/rueeblisuppe')

  it('fills in the basics, the times and the source', () => {
    expect(draft).toMatchObject({ name: 'Rüeblisuppe mit Ingwer', description: 'Wärmt von innen.', course: 'starter', effort: 'easy', servings: 4, prepMinutes: '15', cookMinutes: '25', notes: 'Mit einem Klecks Rahm servieren.', sourceUrl: 'https://www.lecker-kochen.ch/rezepte/rueeblisuppe' })
    expect(draft.tags).toHaveLength(2)
  })

  it('reads ingredient lines the way typed ones are read', () => {
    expect(draft.ingredients.map(({ key: _key, ...rest }) => rest)).toEqual([{ quantity: 600, unit: 'g', name: 'Rüebli' }, { quantity: 1, name: 'Zwiebel' }, { name: '2-3 cm Ingwer' }, { quantity: 8, unit: 'dl', name: 'Gemüsebouillon' }, { name: 'Salz' }])
    expect(new Set(draft.ingredients.map((i) => i.key)).size).toBe(5)
  })

  it('sets a timer where a step names a time a kitchen timer is for', () => {
    expect(draft.steps.map((s) => s.timerMinutes)).toEqual(['', '25', '', ''])
  })

  it('brings protein, carbs and fat along when the card has them', () => {
    expect(draftFromCard(card({ kcalPerServing: 310, proteinPerServing: 7, carbsPerServing: 38, fatPerServing: 14, nutritionEstimated: true }), '')).toMatchObject({ kcal: '310', protein: '7', carbs: '38', fat: '14', isEstimate: true })
    expect(draft).toMatchObject({ protein: '', carbs: '', fat: '' })
  })

  it('marks calories from a page as an estimate', () => {
    expect(draft).toMatchObject({ kcal: '180', isEstimate: true })
    expect(draftFromCard(card({ kcalPerServing: null }), '')).toMatchObject({ kcal: '', isEstimate: false })
  })

  it('leaves what the page does not say the way an empty form has it', () => {
    const bare = draftFromCard(card({ servings: null, prepMinutes: null, cookMinutes: null, effort: null, steps: [], ingredientLines: [], tags: [] }), '')
    const blank = emptyDraft()
    expect(bare).toMatchObject({ servings: blank.servings, prepMinutes: '', cookMinutes: '', effort: null, ingredients: [], tags: [] })
    expect(bare.steps).toHaveLength(1)
    expect(bare.steps[0].text).toBe('')
  })

  it('can be saved as it is', () => {
    const input = dishInputFromDraft(draft)
    expect(input.name).toBe('Rüeblisuppe mit Ingwer')
    expect(input.recipe?.steps).toHaveLength(4)
    expect(input.recipe?.ingredients).toHaveLength(5)
  })
})

describe("the page's picture", () => {
  it('arrives as a file, like one from the gallery', async () => {
    let binary = ''
    for (const byte of PRETEND_JPEG) binary += String.fromCharCode(byte)
    const file = pictureFile({ type: 'image/jpeg', base64: btoa(binary) })
    expect(file).toMatchObject({ type: 'image/jpeg', name: 'cover.jpeg', size: PRETEND_JPEG.length })
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(PRETEND_JPEG)
  })

  it('is simply left out when there is none or it is broken', () => {
    expect(pictureFile(null)).toBeNull()
    expect(pictureFile({ type: 'image/jpeg', base64: '%%%' })).toBeNull()
  })
})

describe('notes to look at', () => {
  it('point to the part of the form they are about', () => {
    expect(sectionFor('servings', true)).toBe('recipe')
    expect(sectionFor('times', true)).toBe('recipe')
    expect(sectionFor('ingredients', true)).toBe('ingredients')
    expect(sectionFor('steps', true)).toBe('steps')
    expect(sectionFor('other', true)).toBeNull()
  })

  it('say nothing about calories in a kitchen that does not show them', () => {
    const checks = [{ about: 'calories' as const, note: 'Per slice, not per serving.' }, { about: 'steps' as const, note: 'Step 3 was cut off.' }]
    expect(sectionFor('calories', true)).toBe('calories')
    expect(sectionFor('calories', false)).toBeNull()
    expect(shownChecks(checks, true)).toHaveLength(2)
    expect(shownChecks(checks, false)).toEqual([checks[1]])
  })
})

describe('handing the card to the dish form', () => {
  it('is picked up with its ticket, and only the newest waits', () => {
    const first = handOver({ draft: emptyDraft(), cover: null, read: null })
    expect(handoverFor(first)?.read).toBeNull()
    const second = handOver({ draft: emptyDraft(), cover: null, read: { site: 'x.ch', by: 'page', checks: [], already: null } })
    expect(handoverFor(first)).toBeNull()
    expect(handoverFor(second)?.read?.site).toBe('x.ch')
    dropHandover(second)
    expect(handoverFor(second)).toBeNull()
    expect(handoverFor(null)).toBeNull()
    expect(handoverFor('nope')).toBeNull()
  })
})

describe('why a link could not be read', () => {
  it("keeps the helper's own word", () => {
    expect(readProblem(new BackendError('rejected', 'not_a_recipe'))).toBe('not_a_recipe')
    expect(readProblem(new BackendError('rejected', 'limit'))).toBe('limit')
    expect(readProblem(new ReadError('demo'))).toBe('demo')
  })

  it('knows offline and a lost login, and calls anything else a helper that is down', () => {
    expect(readProblem(new BackendError('network', 'offline'))).toBe('offline')
    expect(readProblem(new BackendError('auth', 'expired'))).toBe('not_signed_in')
    expect(readProblem(new BackendError('rejected', 'something_new'))).toBe('helper_down')
    expect(readProblem(new TypeError('boom'))).toBe('helper_down')
  })
})

describe('the tags handed to the helper', () => {
  it('are the most used ones first, without those of deleted dishes', () => {
    const dishes = [{ tags: ['schnell', 'suppe'] }, { tags: ['schnell'] }, { tags: ['alt'], deletedAt: '2026-01-01T00:00:00Z' }, { tags: ['apfel'] }]
    expect(mostUsedTags(dishes)).toEqual(['schnell', 'apfel', 'suppe'])
    expect(mostUsedTags(dishes, 1)).toEqual(['schnell'])
  })
})

describe('a link shared to the app from another one', () => {
  it('opens the link reader with the link filled in', async () => {
    const { sharedRoute } = await import('../../src/pwa/share')
    expect(sharedRoute('?shared_text=' + encodeURIComponent('Schau dir diesen Pin an: https://pin.it/AbC'))).toBe('/recipes/import?link=' + encodeURIComponent('https://pin.it/AbC'))
    expect(sharedRoute('?shared_title=Cornbread&shared_url=' + encodeURIComponent('https://sunnykitchen.com/cornbread'))).toBe('/recipes/import?link=' + encodeURIComponent('https://sunnykitchen.com/cornbread'))
  })

  it('opens the empty link reader when something without an address was shared', async () => {
    const { sharedRoute } = await import('../../src/pwa/share')
    expect(sharedRoute('?shared_text=Zopf')).toBe('/recipes/import')
  })

  it('leaves every other start alone', async () => {
    const { sharedRoute } = await import('../../src/pwa/share')
    expect(sharedRoute('')).toBeNull()
    expect(sharedRoute('?text=https://pin.it/AbC')).toBeNull()
  })

  it('uses the names the manifest promises to Android', async () => {
    const { SHARE_PARAMS } = await import('../../src/pwa/share')
    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as { share_target: { action: string; method: string; params: Record<string, string> } }
    expect(manifest.share_target).toEqual({ action: './', method: 'GET', enctype: 'application/x-www-form-urlencoded', params: SHARE_PARAMS })
  })
})

describe('tags the way the kitchen writes them', () => {
  it("takes the kitchen's own spelling of a tag it has", () => {
    expect(kitchenTag('swiss', ['Swiss', 'quick'])).toBe('Swiss')
    expect(kitchenTag('vegetarisch', ['Végétarisch'])).toBe('Végétarisch')
  })

  it("follows the kitchen's habit for a new one", () => {
    expect(kitchenTag('pasta', ['Swiss', 'Quick', 'soulfood'])).toBe('Pasta')
    expect(kitchenTag('Pasta', ['swiss', 'quick', 'Soulfood'])).toBe('pasta')
    // A kitchen without tags yet starts with capitals.
    expect(kitchenTag('pasta', [])).toBe('Pasta')
    expect(kitchenTag('Schweizer Küche', [])).toBe('Schweizer Küche')
  })

  it('is how a card arrives in the form', () => {
    const draft = draftFromCard(card({ tags: ['suppe', 'vegetarisch', 'winter'] }), '', ['Suppe', 'Schnell', 'Vegetarisch'])
    expect(draft.tags).toEqual(['Suppe', 'Vegetarisch', 'Winter'])
  })
})

describe('what to call the place a recipe was read from', () => {
  it("is the site's own name, else its address", () => {
    expect(siteName({ url: 'https://www.lecker-kochen.ch/rezepte/zopf', site: 'Lecker Kochen' })).toBe('Lecker Kochen')
    expect(siteName({ url: 'https://www.sunnykitchen.com/cornbread', site: null })).toBe('sunnykitchen.com')
    expect(siteName({ url: 'https://www.pinterest.ch/pin/99/', site: 'pinterest' })).toBe('Pinterest')
  })
})

describe('a page the recipe book already has a dish from', () => {
  const dishes = [
    { name: 'Rösti', recipe: {} },
    { name: 'Grandma book', recipe: { sourceUrl: "Grandma's book, p. 12" } },
    { name: 'Rüeblisuppe', recipe: { sourceUrl: 'https://www.lecker-kochen.ch/rezepte/rueeblisuppe' } },
    { name: 'Kuchen', recipe: { sourceUrl: 'https://kochen.example.org/rezept?id=42' } },
  ]

  it('is found whatever tail the link has', () => {
    expect(dishFromPage(dishes, 'https://www.lecker-kochen.ch/rezepte/rueeblisuppe')?.name).toBe('Rüeblisuppe')
    expect(dishFromPage(dishes, 'lecker-kochen.ch/rezepte/rueeblisuppe/?utm_source=pin#kommentare')?.name).toBe('Rüeblisuppe')
    expect(dishFromPage(dishes, 'https://kochen.example.org/rezept?id=42&fbclid=abc')?.name).toBe('Kuchen')
  })

  it('is not mistaken for another page of the same site', () => {
    expect(dishFromPage(dishes, 'https://www.lecker-kochen.ch/rezepte/zopf')).toBeNull()
    expect(dishFromPage(dishes, 'https://kochen.example.org/rezept?id=43')).toBeNull()
    expect(dishFromPage(dishes, 'https://www.lecker-kochen.ch/')).toBeNull()
    expect(dishFromPage(dishes, 'not a link')).toBeNull()
  })
})
