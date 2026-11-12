import { describe, expect, it } from 'vitest'
import { PHOTO_LIMITS, type AssistantResult, type HelperRefusal, type PantryPhotoResult, type RecipeFromTextResult } from '../../supabase/functions/ai/contract'
import { helperHandler, type HelperDeps } from '../../supabase/functions/ai/handler'
import { assistantSkill } from '../../supabase/functions/ai/skills/assistant'
import { PHOTO_LINES, pantryPhotoSkill } from '../../supabase/functions/ai/skills/pantry-photo'
import { recipeCardSkill } from '../../supabase/functions/ai/skills/recipe-card'
import { pretendHelper } from '../../src/data/fake/pretendWeb'

// Photos for the helper to look at: of what is at home, of a recipe, with a question to
// Fork. The stand-in cannot see: it tells one photo from several, and a blank one (tiny)
// from a real one. What is checked here is everything around the looking.

/** A "photo": base64 of the given length. Big enough to count as a picture for the stand-in, or blank. */
const photo = (length = 4000, type = 'image/jpeg') => ({ type, base64: 'A'.repeat(length) })
const BLANK = photo(400)

const KITCHEN = { today: '2026-11-12', weekday: 'Thursday', calories: false, dishes: ['D1 | Rösti | main'], plan: [], wishes: [], eaten: [], pantry: [], basket: [] }

function rig(options: { apiKey?: string | null; answer?: unknown; down?: boolean } = {}) {
  const asked: any[] = []
  let tickets = 0
  const stand = pretendHelper({ asked, down: options.down })
  const deps: HelperDeps = {
    fetch: async () => {
      throw new Error('nothing is fetched for a photo')
    },
    askFetch: options.answer === undefined ? stand : async (_url, init) => (asked.push(JSON.parse(init.body)), new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(options.answer) }] }))),
    apiKey: options.apiKey === undefined ? 'sk-test' : options.apiKey,
    ticket: async () => (tickets++, { ok: true, left: 20 }),
  }
  const call = async <T>(body: unknown): Promise<{ status: number; body: T }> => {
    const response = await helperHandler(deps)(new Request('https://x.test/ai', { method: 'POST', headers: { authorization: 'Bearer abc', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    return { status: response.status, body: (await response.json()) as T }
  }
  return { asked, call, tickets: () => tickets }
}

describe('what is at home, from photos', () => {
  it('is told to list only what it sees, with amounts only where they can be seen or read', () => {
    const system = pantryPhotoSkill.system({ lang: 'de', known: ['Mehl', 'Milch'] })
    expect(system).toContain('Write in German as written in Switzerland')
    expect(system).toContain('never list what you do not see')
    expect(system).toContain('Use the same name when you see the same thing: Mehl, Milch.')
    expect(system).toContain(`At most ${PHOTO_LINES} lines`)
    expect(pantryPhotoSkill.system({ lang: 'en', known: [] })).toContain('The pantry is still empty.')
    expect(pantryPhotoSkill.user({ photos: [photo()] as never })).toBe('The photo above shows what is at home. List what you can see.')
    expect(pantryPhotoSkill.user({ photos: [photo(), photo(), photo()] as never })).toContain('The 3 photos above')
  })

  it('tidies the answer: names once, empty amounts as none, a note kept short', () => {
    const read = pantryPhotoSkill.read({ lines: [{ name: ' Milch ', amount: '1 l' }, { name: 'milch', amount: '2 l' }, { name: '', amount: '3' }, { name: 'Eier', amount: '' }, null], note: `  ${'x'.repeat(400)}  ` })
    expect(read?.lines).toEqual([{ name: 'Milch', amount: '1 l' }, { name: 'Eier', amount: null }])
    expect(read?.note).toHaveLength(240)
    expect(pantryPhotoSkill.read({ lines: Array.from({ length: 60 }, (_, n) => ({ name: `Thing ${n}`, amount: '' })), note: '' })?.lines).toHaveLength(PHOTO_LINES)
    expect(pantryPhotoSkill.read({ note: 'no lines' })).toBeNull()
    expect(pantryPhotoSkill.read('nonsense')).toBeNull()
  })

  it('one photo of the fridge: the pictures go to the AI in front of the words, and lines come back to look over', async () => {
    const { asked, call } = rig()
    const answer = await call<PantryPhotoResult>({ job: 'pantry-photo', lang: 'de', photos: [photo(5000, 'image/webp')], known: ['Milch'] })
    expect(answer).toEqual({ status: 200, body: { ok: true, lines: [{ name: 'Milch', amount: '1 l' }, { name: 'Eier', amount: '6' }, { name: 'Butter', amount: 'angebrochen' }, { name: 'Rüebli', amount: null }], note: 'Was hinten steht, sehe ich nicht.', left: 20 } })
    const content = asked[0].messages[0].content
    expect(content).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'A'.repeat(5000) } })
    expect(content[1]).toEqual({ type: 'text', text: 'The photo above shows what is at home. List what you can see.' })
    expect(asked[0].output_config.format.type).toBe('json_schema')
  })

  it('several photos of single things, and a photo with nothing on it', async () => {
    const { call } = rig()
    const three = await call<PantryPhotoResult>({ job: 'pantry-photo', lang: 'en', photos: [photo(), photo(), photo()], known: [] })
    expect(three.body.lines).toEqual([{ name: 'Flour', amount: '1 kg' }, { name: 'Sugar', amount: '500 g' }, { name: 'Olive oil', amount: 'half full' }])
    const none = await call<PantryPhotoResult>({ job: 'pantry-photo', lang: 'en', photos: [BLANK], known: [] })
    expect(none.body).toMatchObject({ ok: true, lines: [], note: 'I cannot make out any food in the photo.' })
  })

  it('refuses what is no photo, says "too big" for too many or too large ones, and takes no ticket for either', async () => {
    const { call, tickets, asked } = rig()
    for (const bad of [undefined, [], 'a photo', [{ type: 'image/jpeg' }], [{ type: 'image/gif', base64: 'A'.repeat(400) }], [{ type: 'image/jpeg', base64: 'tiny' }], [{ type: 'image/jpeg', base64: `${'A'.repeat(399)}!` }], [{ type: 'image/jpeg', base64: `<script>${'A'.repeat(400)}` }], [photo(401)]]) {
      expect((await call<HelperRefusal>({ job: 'pantry-photo', lang: 'en', photos: bad, known: [] })).status, JSON.stringify(bad)?.slice(0, 60)).toBe(400)
    }
    const many = Array.from({ length: PHOTO_LIMITS.photos + 1 }, () => photo())
    expect((await call<HelperRefusal>({ job: 'pantry-photo', lang: 'en', photos: many, known: [] })).body).toEqual({ ok: false, code: 'too_big' })
    expect((await call<HelperRefusal>({ job: 'pantry-photo', lang: 'en', photos: [photo(PHOTO_LIMITS.each + 4)], known: [] })).body).toEqual({ ok: false, code: 'too_big' })
    const heavy = Array.from({ length: 4 }, () => photo(PHOTO_LIMITS.each))
    expect((await call<HelperRefusal>({ job: 'pantry-photo', lang: 'en', photos: heavy, known: [] })).body).toEqual({ ok: false, code: 'too_big' })
    expect(tickets()).toBe(0)
    expect(asked).toHaveLength(0)
  })

  it('says so without a key, and when the AI is down', async () => {
    const body = { job: 'pantry-photo', lang: 'en', photos: [photo()], known: [] }
    expect((await rig({ apiKey: null }).call<HelperRefusal>(body)).body).toEqual({ ok: false, code: 'helper_off' })
    expect((await rig({ down: true }).call<HelperRefusal>(body)).body).toEqual({ ok: false, code: 'helper_down' })
    expect((await rig({ answer: { nonsense: true } }).call<HelperRefusal>(body)).body).toEqual({ ok: false, code: 'helper_down' })
  })
})

describe('a recipe from photos', () => {
  it('is told that the material is photos, and to name what it could not read', () => {
    const request = { lang: 'en' as const, translate: true, metric: true, nutrition: false, knownTags: [], site: null, data: null, text: null, pictured: 2 }
    const system = recipeCardSkill.system(request)
    expect(system).toContain('The material is photos')
    expect(system).toContain('add a check that names it')
    expect(system).toContain('A photo of a finished dish without its recipe')
    expect(recipeCardSkill.user(request)).toBe('The recipe is in the 2 photos above, in this order.')
    expect(recipeCardSkill.user({ ...request, pictured: 1 })).toBe('The recipe is in the photo above.')
    // A page read from a link is told nothing about photos.
    expect(recipeCardSkill.system({ ...request, pictured: undefined, text: 'x' })).not.toContain('The material is photos')
  })

  it('becomes a card for the dish form, with a note about what was hard to read', async () => {
    const { asked, call } = rig()
    const answer = await call<RecipeFromTextResult>({ job: 'recipe-from-photo', lang: 'de', photos: [photo()], translate: true, metric: true, nutrition: false, knownTags: ['Kuchen'] })
    expect(answer.body).toMatchObject({ ok: true, left: 20, card: { name: 'Omas Apfelkuchen', course: 'dessert', servings: 8, ingredientLines: ['4 Äpfel', '200 g Mehl', '150 g Zucker', '3 Eier', '100 g Butter'], kcalPerServing: null, nutritionEstimated: false } })
    expect(answer.body.card.steps).toHaveLength(3)
    expect(answer.body.card.checks).toEqual([{ about: 'ingredients', note: 'Die Zuckermenge ist schwer zu lesen: 150 g oder 180 g.' }])
    expect(asked[0].messages[0].content.map((block: { type: string }) => block.type)).toEqual(['image', 'text'])
    expect(asked[0].system).toContain('prefer these, which the kitchen already uses, when they fit: Kuchen.')
  })

  it('two photos are two pages of one recipe, and calories are estimated only when asked for', async () => {
    const { asked, call } = rig()
    const two = await call<RecipeFromTextResult>({ job: 'recipe-from-photo', lang: 'en', photos: [photo(), photo()], translate: true, metric: true, nutrition: true, knownTags: [] })
    expect(two.body.card.name).toBe("Grandma's apple cake")
    expect(two.body.card.steps).toHaveLength(4)
    expect(two.body.card.nutritionEstimated).toBe(true)
    expect(two.body.card.kcalPerServing).toBeGreaterThan(0)
    expect(two.body.card.checks.map((check) => check.about)).toEqual(['ingredients', 'calories'])
    expect(asked[0].messages[0].content.map((block: { type: string }) => block.type)).toEqual(['image', 'image', 'text'])
  })

  it('a photo without a recipe is said to be none, and the limits hold here too', async () => {
    const { call } = rig()
    expect((await call<HelperRefusal>({ job: 'recipe-from-photo', lang: 'en', photos: [BLANK], translate: true, metric: true, nutrition: false, knownTags: [] })).body).toEqual({ ok: false, code: 'not_a_recipe' })
    expect((await call<HelperRefusal>({ job: 'recipe-from-photo', lang: 'en', photos: [], translate: true, metric: true, nutrition: false, knownTags: [] })).status).toBe(400)
    expect((await call<HelperRefusal>({ job: 'recipe-from-photo', lang: 'en', photos: Array.from({ length: 5 }, () => photo()), translate: true, metric: true, nutrition: false, knownTags: [] })).body).toEqual({ ok: false, code: 'too_big' })
    expect((await rig({ apiKey: null }).call<HelperRefusal>({ job: 'recipe-from-photo', lang: 'en', photos: [photo()], translate: true, metric: true, nutrition: false, knownTags: [] })).body).toEqual({ ok: false, code: 'helper_off' })
  })
})

describe('a question to Fork with a photo', () => {
  const question = (text: string, photos: unknown) => ({ job: 'assistant', lang: 'en', turns: [{ who: 'me', text }], kitchen: KITCHEN, recipes: [], photos })

  it('is told what to do with photos, and that he sees only the ones of this question', () => {
    const system = assistantSkill.system({ lang: 'en' })
    expect(system).toContain('A question can come with photos.')
    expect(system).toContain('Photos of earlier questions are not shown to you again')
    expect(system).toContain('Never what might be behind or inside.')
    const user = assistantSkill.user({ job: 'assistant', lang: 'en', turns: [{ who: 'me', text: 'What is this?' }], kitchen: KITCHEN, recipes: [], photos: [photo() as never] })
    expect(user).toContain('With this question comes the photo above.\n\n<question>\nWhat is this?')
    expect(assistantSkill.user({ job: 'assistant', lang: 'en', turns: [{ who: 'me', text: 'Hi' }], kitchen: KITCHEN, recipes: [] })).not.toContain('photo')
  })

  it('a fridge: he says what he sees and offers to note it, the photo in front of the words', async () => {
    const { asked, call } = rig()
    const answer = await call<AssistantResult>(question('What can I cook with this?', [photo()]))
    expect(answer.body).toMatchObject({ ok: true, text: 'I can see Milk, Eggs, Butter, Carrots. I cannot see what stands at the back.', offers: [{ kind: 'pantry', lines: [{ name: 'Milk', amount: '1 l' }, { name: 'Eggs', amount: '6' }, { name: 'Butter', amount: 'opened' }, { name: 'Carrots', amount: null }] }] })
    const last = asked[0].messages.at(-1).content
    expect(last.map((block: { type: string }) => block.type)).toEqual(['image', 'text'])
    expect(last[1].text).toContain('<kitchen>')
  })

  it('a recipe: he writes it out and offers to put it in the book; a blank photo: he asks for another', async () => {
    const { call } = rig()
    const recipe = await call<AssistantResult>(question('Put this recipe in my book', [photo(), photo()]))
    expect(recipe.body.text.startsWith("Grandma's apple cake, for 8 servings\n- 4 apples")).toBe(true)
    expect(recipe.body.offers).toEqual([{ kind: 'recipe' }])
    const blank = await call<AssistantResult>(question('What is this?', [BLANK]))
    expect(blank.body).toMatchObject({ text: 'I cannot make anything out in the photo. Can you take another one, with more light?', offers: [] })
  })

  it('takes at most three, and a question without photos is as before', async () => {
    const { asked, call } = rig()
    expect((await call<HelperRefusal>(question('x', [photo(), photo(), photo(), photo()]))).body).toEqual({ ok: false, code: 'too_big' })
    expect((await call<HelperRefusal>(question('x', 'a photo'))).status).toBe(400)
    const plain = await call<AssistantResult>(question('How long does an egg take?', []))
    expect(plain.body.text).toContain('6 minutes for soft')
    expect(typeof asked[0].messages[0].content).toBe('string')
  })
})
