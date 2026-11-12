import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL } from '../../supabase/functions/ai/claude'
import type { AssistantAsk, AssistantResult, HelperRefusal, RecipeFromTextResult } from '../../supabase/functions/ai/contract'
import { helperHandler, type HelperDeps } from '../../supabase/functions/ai/handler'
import { APP_GUIDE, ASSISTANT_LIMITS, assistantSkill, PLACES, refOf } from '../../supabase/functions/ai/skills/assistant'
import { pretendHelper } from '../../src/data/fake/pretendWeb'

// Fork in a talk, from the outside: a question and the kitchen go in, an answer with
// buttons comes out. The Claude API is the stand-in the pretend cloud uses, or a fixed answer.

const KITCHEN = {
  today: '2026-11-12',
  weekday: 'Thursday',
  calories: true,
  dishes: ['D1 | Fondue | main, 30 min | never eaten', 'D2 | Rösti | main, 40 min, tags: Swiss | eaten 2 times, last 2026-11-02, liked 4.5 of 5', 'D3 | Rüeblisuppe | starter, 35 min, 180 kcal | eaten 1 time'],
  plan: ['2026-11-13 (Friday), dinner: D1 Fondue, you cook'],
  wishes: ['D2 Rösti, 4 of 5 hearts, your partner cooks'],
  eaten: ['2026-11-02, dinner: D2 Rösti, liked 4.5 of 5'],
  pantry: ['Reis: 1 kg (noted today)', 'Eier: 6 (noted yesterday)'],
  basket: ['Milch: 2 l'],
}
const SOUP = 'D3 | Rüeblisuppe | 4 servings\nIngredients:\n- 500 g Rüebli\n- 1 dl Rahm\n- 1 Zwiebel\nSteps:\n- Rüebli schälen und 20 Minuten weich kochen.\n- Pürieren und den Rahm einrühren.'

const question = (text: string, more: Partial<AssistantAsk> = {}) => ({ job: 'assistant', lang: 'en', turns: [{ who: 'me', text }], kitchen: KITCHEN, recipes: [], ...more })

function rig(options: { apiKey?: string | null; answer?: unknown; down?: boolean; chatModel?: string } = {}) {
  const asked: any[] = []
  const stand = pretendHelper({ asked, down: options.down })
  const deps: HelperDeps = {
    fetch: async () => {
      throw new Error('the assistant fetches nothing')
    },
    askFetch: options.answer === undefined ? stand : async (_url, init) => (asked.push(JSON.parse(init.body)), new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(options.answer) }] }))),
    apiKey: options.apiKey === undefined ? 'sk-test' : options.apiKey,
    chatModel: options.chatModel,
    ticket: async () => ({ ok: true, left: 31 }),
  }
  const call = async <T>(body: unknown): Promise<{ status: number; body: T }> => {
    const response = await helperHandler(deps)(new Request('https://x.test/ai', { method: 'POST', headers: { authorization: 'Bearer abc', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    return { status: response.status, body: (await response.json()) as T }
  }
  return { asked, call }
}

describe('the assistant: what it is told', () => {
  it('gets the house rules, its three kinds of knowledge and the guide to the app', () => {
    const system = assistantSkill.system({ lang: 'de' })
    expect(system).toContain('Write in German as written in Switzerland')
    expect(system).toContain('Job: you are Fork, the kitchen assistant')
    expect(system).toContain('You never change anything yourself.')
    expect(system).toContain('never that it is done')
    // Every line of the guide is in, and every place a button can open is named.
    for (const line of APP_GUIDE) expect(system).toContain(line)
    for (const place of PLACES) expect(system).toContain(place)
    // The guide names what the app really has.
    expect(APP_GUIDE.join(' ')).toMatch(/Today.*Wishlist.*Week.*Cockpit.*Recipes/)
    expect(APP_GUIDE.join(' ')).toContain('A recipe from a link')
  })

  it('puts the kitchen, whole recipes and the question into the last message, each in its own fence', () => {
    const user = assistantSkill.user(question('What is in the Rüeblisuppe?', { recipes: [SOUP] }) as AssistantAsk)
    expect(user).toContain('<kitchen>\nToday: 2026-11-12 (Thursday). Calories: shown.')
    expect(user).toContain('Recipe book (ref | name | what the phone knows about it):\n- D1 | Fondue | main, 30 min | never eaten')
    expect(user).toContain('Planned:\n- 2026-11-13 (Friday), dinner: D1 Fondue, you cook')
    expect(user).toContain('Pantry:\n- Reis: 1 kg (noted today)')
    expect(user).toContain(`<recipes>\nWhole recipes:\n\n${SOUP}\n</recipes>`)
    expect(user.endsWith('<question>\nWhat is in the Rüeblisuppe?\n</question>')).toBe(true)
    // An empty kitchen is said to be empty, not left out.
    const bare = assistantSkill.user({ job: 'assistant', lang: 'en', turns: [{ who: 'me', text: 'Hi' }], kitchen: { ...KITCHEN, dishes: [], plan: [], wishes: [], eaten: [], pantry: [], basket: [], calories: false }, recipes: [] })
    expect(bare).toContain('Calories: hidden.')
    expect(bare).toContain('Recipe book (ref | name | what the phone knows about it):\n- empty')
    expect(bare).toContain('Pantry:\n- nothing noted')
    expect(bare).not.toContain('<recipes>')
  })

  it('hands the talk before the question on as turns: the person first, the two alternating', () => {
    const history = assistantSkill.history([
      { who: 'fork', text: 'left over from a talk that was cut' },
      { who: 'me', text: 'one' },
      { who: 'me', text: 'two' },
      { who: 'fork', text: 'answer' },
      { who: 'me', text: 'never answered' },
      { who: 'me', text: 'the question' },
    ])
    expect(history).toEqual([
      { role: 'user', content: 'one\n\ntwo' },
      { role: 'assistant', content: 'answer' },
    ])
    expect(assistantSkill.history([{ who: 'me', text: 'only the question' }])).toEqual([])
  })
})

describe('the assistant: what comes back is checked', () => {
  const ask = question('x') as AssistantAsk
  const offer = (fields: Record<string, unknown>) => ({ dish: '', day: '', slot: '', place: '', lines: [], ...fields })

  it('keeps offers the app can do, with refs the kitchen has and days that are not over', () => {
    const read = assistantSkill.read(
      {
        text: '  I can put Rösti on Friday.\r\n\n\n\nShall I?  ',
        offers: [
          offer({ kind: 'plan', dish: 'D2', day: '2026-11-13', slot: 'dinner' }),
          offer({ kind: 'plan', dish: 'D2', day: '2026-11-13', slot: 'dinner' }), // twice is once
          offer({ kind: 'plan', dish: 'D9', day: '2026-11-13', slot: 'dinner' }), // no such dish
          offer({ kind: 'plan', dish: 'D2', day: '2026-11-11', slot: 'dinner' }), // yesterday
          offer({ kind: 'plan', dish: 'D2', day: '2026-02-30', slot: 'dinner' }), // no such day
          offer({ kind: 'plan', dish: 'D2', day: '2026-11-13', slot: 'brunch' }),
          offer({ kind: 'wish', dish: 'D1' }),
          offer({ kind: 'go', place: 'basket' }),
          offer({ kind: 'go', place: 'the moon' }),
          offer({ kind: 'delete-everything' }),
        ],
        look: [],
      },
      ask,
    )
    expect(read).toEqual({
      text: 'I can put Rösti on Friday.\n\nShall I?',
      offers: [
        { kind: 'plan', dish: 'D2', day: '2026-11-13', slot: 'dinner' },
        { kind: 'wish', dish: 'D1' },
        { kind: 'go', place: 'basket' },
      ],
      look: [],
    })
  })

  it('tidies the lines of a basket or pantry offer, and never offers more than four', () => {
    const lines = [{ name: ' Rüebli ', amount: '500 g' }, { name: 'rüebli', amount: '1 kg' }, { name: '', amount: '2' }, { name: 'Rahm', amount: '' }, 'nonsense']
    const read = assistantSkill.read({ text: 'ok', offers: [offer({ kind: 'basket', lines }), offer({ kind: 'pantry', lines: [] }), offer({ kind: 'recipe' }), offer({ kind: 'dish', dish: 'D3' }), offer({ kind: 'go', place: 'week' }), offer({ kind: 'go', place: 'pantry' })], look: [] }, ask)
    expect(read?.offers).toEqual([{ kind: 'basket', lines: [{ name: 'Rüebli', amount: '500 g' }, { name: 'Rahm', amount: null }] }, { kind: 'recipe' }, { kind: 'dish', dish: 'D3' }, { kind: 'go', place: 'week' }])
    expect(read?.offers).toHaveLength(ASSISTANT_LIMITS.offers)
  })

  it('"look" asks for recipes it has not seen, and then there is no answer yet', () => {
    expect(assistantSkill.read({ text: '', offers: [], look: ['D3', 'D3', 'D99', 'nonsense'] }, ask)).toEqual({ text: '', offers: [], look: ['D3'] })
    // A recipe that came along is not asked for again: with nothing said, that is no answer.
    expect(assistantSkill.read({ text: '', offers: [], look: ['D3'] }, { ...ask, recipes: [SOUP] })).toBeNull()
    // Words win: an answer with words is an answer, whatever "look" says.
    expect(assistantSkill.read({ text: 'Here you go.', offers: [], look: ['D3'] }, ask)).toEqual({ text: 'Here you go.', offers: [], look: [] })
    expect(assistantSkill.read({ text: '   ', offers: [], look: [] }, ask)).toBeNull()
    expect(assistantSkill.read('nonsense', ask)).toBeNull()
    expect(refOf('D12 | Rösti')).toBe('D12')
    expect(refOf('Menu "Brunch": D1')).toBeNull()
  })
})

describe('the assistant: through the handler', () => {
  it('answers a question about cooking, in the language asked for', async () => {
    const { asked, call } = rig()
    const en = await call<AssistantResult>(question('How long does an egg take?'))
    expect(en).toEqual({ status: 200, body: { ok: true, text: 'An egg from the fridge: 6 minutes for soft, 8 for jammy, 10 for hard, counted from boiling water.', offers: [], look: [], left: 31 } })
    const de = await call<AssistantResult>(question('Wie lange braucht ein Ei?', { lang: 'de' }))
    expect(de.body.text).toContain('6 Minuten für weich')
    // One question, one request to the API: the default model, the key from the secrets, a JSON answer asked for.
    expect(asked).toHaveLength(2)
    expect(asked[0].model).toBe(DEFAULT_MODEL)
    expect(asked[0].key).toBe('sk-test')
    expect(asked[0].output_config.format.type).toBe('json_schema')
    expect(asked[0].messages).toHaveLength(1)
  })

  it('offers to plan a dish from the book: the next such weekday, the meal that was named', async () => {
    const { call } = rig()
    const friday = await call<AssistantResult>(question('Plan Rösti for Saturday lunch'))
    expect(friday.body).toMatchObject({ ok: true, text: 'I can put Rösti on Saturday, for lunch.', offers: [{ kind: 'plan', dish: 'D2', day: '2026-11-14', slot: 'lunch' }] })
    const tomorrow = await call<AssistantResult>(question('Bitte Fondue einplanen', { lang: 'de' }))
    expect(tomorrow.body.offers).toEqual([{ kind: 'plan', dish: 'D1', day: '2026-11-13', slot: 'dinner' }])
  })

  it('asks for the recipe first, and answers once it has it', async () => {
    const { call } = rig()
    const first = await call<AssistantResult>(question('What is in the Rüeblisuppe?'))
    expect(first.body).toEqual({ ok: true, text: '', offers: [], look: ['D3'], left: 31 })
    const second = await call<AssistantResult>(question('What is in the Rüeblisuppe?', { recipes: [SOUP] }))
    expect(second.body).toMatchObject({ text: 'Rüeblisuppe takes: 500 g Rüebli, 1 dl Rahm, 1 Zwiebel.', offers: [{ kind: 'dish', dish: 'D3' }], look: [] })
  })

  it('sends the talk before the question along, and can use another model for it', async () => {
    const { asked, call } = rig({ chatModel: 'claude-sonnet-5-5' })
    const turns = [{ who: 'me', text: 'How long does an egg take?' }, { who: 'fork', text: '6 minutes for soft.' }, { who: 'me', text: 'What can I cook?' }]
    const answer = await call<AssistantResult>({ ...question(''), turns })
    expect(answer.body.text).toBe('You have Reis, Eier at home. From the recipe book, Fondue or Rösti would fit.')
    expect(answer.body.offers).toEqual([{ kind: 'dish', dish: 'D1' }, { kind: 'dish', dish: 'D2' }])
    expect(asked[0].model).toBe('claude-sonnet-5-5')
    expect(asked[0].messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(asked[0].messages[0].content).toBe('How long does an egg take?')
    expect(asked[0].messages[2].content).toContain('<question>\nWhat can I cook?\n</question>')
  })

  it('cuts what is sent to size, and refuses what is no question', async () => {
    const { asked, call } = rig()
    const long = { ...question('x'.repeat(5000)), kitchen: { ...KITCHEN, dishes: Array.from({ length: 400 }, (_, i) => `D${i + 1} | Dish ${i + 1} | main`), nonsense: true }, recipes: ['r'.repeat(9000), '', 7] }
    expect((await call<AssistantResult>(long)).body.ok).toBe(true)
    const sent: string = asked[0].messages.at(-1).content
    expect(sent).toContain(`- D${ASSISTANT_LIMITS.dishes} | `)
    expect(sent).not.toContain(`- D${ASSISTANT_LIMITS.dishes + 1} | `)
    expect(sent).toContain(`<question>\n${'x'.repeat(ASSISTANT_LIMITS.turn)}\n</question>`)
    expect(sent).toContain(`${'r'.repeat(ASSISTANT_LIMITS.recipe)}\n</recipes>`)

    for (const bad of [{ ...question('Hi'), turns: [] }, { ...question('Hi'), turns: [{ who: 'fork', text: 'I speak first' }] }, { ...question('Hi'), turns: [{ who: 'me', text: '   ' }] }, { ...question('Hi'), kitchen: { ...KITCHEN, today: 'today' } }, { ...question('Hi'), kitchen: null }]) {
      expect((await call<HelperRefusal>(bad)).status).toBe(400)
    }
  })

  it('says so when there is no key, when the AI is down, and when it answers nothing usable', async () => {
    expect((await rig({ apiKey: null }).call<HelperRefusal>(question('Hi'))).body).toEqual({ ok: false, code: 'helper_off' })
    expect((await rig({ down: true }).call<HelperRefusal>(question('Hi'))).body).toEqual({ ok: false, code: 'helper_down' })
    expect((await rig({ answer: { text: '', offers: [], look: [] } }).call<HelperRefusal>(question('Hi'))).body).toEqual({ ok: false, code: 'helper_down' })
  })

  it('a recipe written out in a talk becomes a card for the dish form', async () => {
    const { asked, call } = rig()
    const talk = await call<AssistantResult>(question('Give me a recipe for carbonara'))
    expect(talk.body.offers).toEqual([{ kind: 'recipe' }])
    expect(talk.body.text.startsWith('Carbonara, for 2 servings\n- 200 g spaghetti')).toBe(true)

    const card = await call<RecipeFromTextResult>({ job: 'recipe-from-text', lang: 'en', text: talk.body.text, nutrition: true, knownTags: ['Pasta'] })
    expect(card.body).toMatchObject({ ok: true, left: 31, card: { name: 'Carbonara', servings: 2, ingredientLines: ['200 g spaghetti', '2 eggs', '60 g Sbrinz, grated', '1 tsp pepper'], nutritionEstimated: true } })
    expect(card.body.card.steps).toHaveLength(3)
    expect(card.body.card.kcalPerServing).toBeGreaterThan(0)
    // The estimate is said to be one, in the card's checks.
    expect(card.body.card.checks).toContainEqual({ about: 'calories', note: 'The page gives no calories. The numbers are an estimate from the ingredients.' })
    expect(asked[1].messages[0].content.startsWith('A recipe as it was written out in a talk')).toBe(true)
    expect(asked[1].system).toContain('prefer these, which the kitchen already uses, when they fit: Pasta.')

    // Without the calories switch nothing is estimated.
    const plain = await call<RecipeFromTextResult>({ job: 'recipe-from-text', lang: 'en', text: talk.body.text, nutrition: false, knownTags: [] })
    expect(plain.body.card).toMatchObject({ kcalPerServing: null, nutritionEstimated: false })
    // Words that are no recipe are no card.
    expect((await call<HelperRefusal>({ job: 'recipe-from-text', lang: 'en', text: 'An egg takes six minutes, more or less.', nutrition: false, knownTags: [] })).body).toEqual({ ok: false, code: 'not_a_recipe' })
    expect((await call<HelperRefusal>({ job: 'recipe-from-text', lang: 'en', text: 'short', nutrition: false, knownTags: [] })).status).toBe(400)
    expect((await rig({ apiKey: null }).call<HelperRefusal>({ job: 'recipe-from-text', lang: 'en', text: talk.body.text, nutrition: false, knownTags: [] })).body).toEqual({ ok: false, code: 'helper_off' })
  })
})
