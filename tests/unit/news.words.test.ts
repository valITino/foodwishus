import { describe, expect, it } from 'vitest'
import type { NewsItem } from '../../src/data/news'
import { newsCopy } from '../../src/features/news/copy'
import { newsLine, readerEats, type NewsContext } from '../../src/features/news/logic'

const MIA = 'mia' // cooks
const LEO = 'leo' // eats, and reads these lines

const ctx: NewsContext = {
  meId: LEO,
  nameOf: (id) => (id === MIA ? 'Mia' : id === LEO ? 'Leo' : ''),
  mealName: (item) => (item.dishId === 'rösti' ? 'Rösti' : item.menuId === 'brunch' ? 'Brunch' : null),
  cookOf: (servingId) => (servingId === 'hers' ? MIA : servingId === 'his' ? LEO : null),
  when: (day, slot) => (slot ? `${day}, ${slot}` : day),
  goneName: 'A dish that left the recipe book',
}

const line = (item: Partial<NewsItem> & Pick<NewsItem, 'kind'>, lang: 'en' | 'de' = 'en', context: NewsContext = ctx) =>
  newsLine({ at: '2026-11-12T18:00:00.000Z', actorId: null, facts: {}, seenAt: null, dishId: 'rösti', ...item }, context, newsCopy[lang].lines)

describe('a line of news as a sentence', () => {
  it('a wish reads differently for the one who is asked to cook it', () => {
    expect(line({ kind: 'proposed', actorId: MIA, servingId: 'hers' })).toBe('Mia put Rösti on the wishlist.')
    expect(line({ kind: 'proposed', actorId: MIA, servingId: 'his' })).toBe('Mia wishes for Rösti.')
    expect(line({ kind: 'proposed', servingId: 'hers' })).toBe('Rösti is new on the wishlist.')
  })

  it('planning names the day and the meal, and the person when the change says who', () => {
    expect(line({ kind: 'planned', actorId: MIA, servingId: 'hers', facts: { day: 'tomorrow', slot: 'dinner' } })).toBe('Mia planned Rösti for tomorrow, dinner.')
    expect(line({ kind: 'planned', servingId: 'hers', facts: { day: 'tomorrow', slot: 'dinner' } })).toBe('Rösti is planned for tomorrow, dinner.')
    expect(line({ kind: 'planned', servingId: 'hers' })).toBe('Rösti is planned.')
    expect(line({ kind: 'moved', servingId: 'hers', facts: { day: 'Friday', slot: 'lunch' } })).toBe('Rösti moved to Friday, lunch.')
    expect(line({ kind: 'unplanned', servingId: 'hers' })).toBe('Rösti is off the calendar and back on the wishlist.')
  })

  it('"Proof, please" is said to whoever eats', () => {
    expect(line({ kind: 'served', actorId: MIA, servingId: 'hers' })).toBe('Mia served Rösti. Proof, please.')
    expect(line({ kind: 'served', actorId: MIA, servingId: 'his' })).toBe('Rösti is on the table.')
    expect(line({ kind: 'served', servingId: 'hers' })).toBe('Rösti is on the table.')
  })

  it('the verdict and its answer', () => {
    expect(line({ kind: 'eaten', actorId: LEO, servingId: 'hers' }, 'en', { ...ctx, meId: MIA })).toBe('Leo ate Rösti and handed in the verdict.')
    expect(line({ kind: 'eaten', servingId: 'hers' })).toBe('Rösti was eaten. The verdict is in.')
    // The answer comes from whoever cooked that meal.
    expect(line({ kind: 'answered', servingId: 'hers', facts: { hasReply: true } })).toBe('Mia answered your verdict on Rösti.')
    expect(line({ kind: 'answered', servingId: 'hers', facts: { hasReply: false } })).toBe('Mia reacted to your verdict on Rösti.')
    // The meal is gone, or it was my own cooking: no name to put there.
    expect(line({ kind: 'answered', servingId: 'gone', facts: { hasReply: true } })).toBe('The verdict on Rösti got an answer.')
    expect(line({ kind: 'answered', servingId: 'his', facts: { hasReply: true } })).toBe('The verdict on Rösti got an answer.')
  })

  it('skipping, removing, hearts, notes and a new cook', () => {
    expect(line({ kind: 'skipped', servingId: 'hers' })).toBe('Rösti was skipped.')
    expect(line({ kind: 'skipped', servingId: 'hers', facts: { reason: 'Ate out' } })).toBe('Rösti was skipped (Ate out).')
    expect(line({ kind: 'removed', servingId: 'gone' })).toBe('Rösti was taken off the list.')
    expect(line({ kind: 'hearts', actorId: LEO, servingId: 'hers', facts: { hearts: 4 } }, 'en', { ...ctx, meId: MIA })).toBe('Leo gave Rösti 4 of 5 hearts.')
    expect(line({ kind: 'hearts', servingId: 'hers', facts: { hearts: 4 } })).toBe('Rösti got 4 of 5 hearts.')
    expect(line({ kind: 'note', actorId: MIA, servingId: 'hers' })).toBe('Mia left a note on Rösti.')
    expect(line({ kind: 'note', servingId: 'hers' })).toBe('Rösti has a new note.')
    expect(line({ kind: 'cook', servingId: 'his', facts: { cookId: LEO } })).toBe('You cook Rösti now.')
    expect(line({ kind: 'cook', servingId: 'hers', facts: { cookId: MIA } })).toBe('Mia cooks Rösti now.')
    expect(line({ kind: 'cook', servingId: 'hers', facts: { cookId: 'somebody' } })).toBe('Somebody else cooks Rösti now.')
  })

  it('the recipe book and the people', () => {
    expect(line({ kind: 'dish', actorId: MIA })).toBe('Mia added Rösti to the recipe book.')
    expect(line({ kind: 'dish' })).toBe('Rösti is new in the recipe book.')
    expect(line({ kind: 'dishes', dishId: undefined, facts: { count: 12 } })).toBe('12 new dishes in the recipe book.')
    expect(line({ kind: 'menu', actorId: MIA, dishId: undefined, menuId: 'brunch' })).toBe('Mia put together a menu: Brunch.')
    expect(line({ kind: 'menu', dishId: undefined, menuId: 'brunch' })).toBe('A new menu: Brunch.')
    expect(line({ kind: 'joined', actorId: MIA, dishId: undefined })).toBe('Mia joined the kitchen.')
    expect(line({ kind: 'joined', actorId: 'left', dishId: undefined, facts: { name: 'Mia' } })).toBe('Mia joined the kitchen.')
  })

  it('a dish that was renamed shows its name of today; one that is gone keeps the name it had', () => {
    expect(line({ kind: 'dish', actorId: MIA, facts: { name: 'Old name' } })).toBe('Mia added Rösti to the recipe book.')
    expect(line({ kind: 'dish', actorId: MIA, dishId: 'gone', facts: { name: 'Ramen' } })).toBe('Mia added Ramen to the recipe book.')
    expect(line({ kind: 'skipped', dishId: 'gone', servingId: 'gone' })).toBe('A dish that left the recipe book was skipped.')
  })

  it('reads the same in German', () => {
    expect(line({ kind: 'proposed', actorId: MIA, servingId: 'his' }, 'de')).toBe('Mia wünscht sich Rösti.')
    expect(line({ kind: 'planned', actorId: MIA, servingId: 'hers', facts: { day: 'morgen', slot: 'dinner' } }, 'de')).toBe('Mia hat Rösti für morgen, dinner eingeplant.')
    expect(line({ kind: 'served', actorId: MIA, servingId: 'hers' }, 'de')).toBe('Mia hat Rösti serviert. Beweisfoto, bitte.')
    expect(line({ kind: 'answered', servingId: 'hers', facts: { hasReply: true } }, 'de')).toBe('Mia hat auf dein Urteil zu Rösti geantwortet.')
    expect(line({ kind: 'cook', servingId: 'his', facts: { cookId: LEO } }, 'de')).toBe('Du kochst jetzt Rösti.')
    expect(line({ kind: 'dishes', dishId: undefined, facts: { count: 12 } }, 'de')).toBe('12 neue Gerichte im Rezeptbuch.')
  })

  it('every kind of news has a sentence in both languages, and none of them uses a dash for a pause', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const [key, write] of Object.entries(newsCopy[lang].lines)) {
        const text = (write as (...args: unknown[]) => string)('Mia', 'Rösti', 'morgen')
        expect(text, `${lang}.${key}`).toMatch(/\.$/)
        expect(text, `${lang}.${key}`).not.toMatch(/[—–]/)
      }
    }
  })
})

describe('who owes the proof', () => {
  it('the reader, when somebody else cooks that meal', () => {
    expect(readerEats({ servingId: 'hers' }, ctx)).toBe(true)
    expect(readerEats({ servingId: 'his' }, ctx)).toBe(false)
    expect(readerEats({ servingId: 'gone' }, ctx)).toBe(false)
    expect(readerEats({}, ctx)).toBe(false)
  })
})
