import { describe, expect, it } from 'vitest'
import { cockpitCopy } from '../../src/features/cockpit/copy'
import { factLine, factLines, type FactNames } from '../../src/features/cockpit/facts'
import { formats, hourLabel, monthName, timeTicks } from '../../src/features/cockpit/format'
import type { FunFact } from '../../src/lib/stats'

const english: FactNames = { dish: (id) => (id === 'alp' ? 'Älplermagronen' : 'A dish that left the recipe book'), weekday: (i) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i], superDelicious: 'Super delicious' }
const german: FactNames = { dish: (id) => (id === 'alp' ? 'Älplermagronen' : 'Ein Gericht'), weekday: (i) => ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][i], superDelicious: 'Mega fein' }
const en = (fact: FunFact) => factLine(fact, cockpitCopy.en.facts, english).text
const de = (fact: FunFact) => factLine(fact, cockpitCopy.de.facts, german).text

describe('fun facts in words', () => {
  it('names the dish that is eaten most, and leads to it', () => {
    const fact: FunFact = { kind: 'mostEaten', dishId: 'alp', count: 7 }
    expect(factLine(fact, cockpitCopy.en.facts, english)).toEqual({ key: 'mostEaten', text: "Älplermagronen has been eaten 7 times. That's love.", dishId: 'alp' })
    expect(de(fact)).toBe('Älplermagronen gab es schon 7-mal. Das ist Liebe.')
  })

  it('counts the streak', () => {
    expect(en({ kind: 'streak', days: 4 })).toBe('4 days in a row with a proper meal. The stove is on a roll.')
    expect(de({ kind: 'streak', days: 4 })).toBe('4 Tage am Stück richtig gegessen. Der Herd läuft heiss.')
  })

  it('brags about perfect scores, one or many', () => {
    expect(en({ kind: 'perfectScores', count: 1 })).toBe('One plate got 5 out of 5. The kitchen is showing off.')
    expect(en({ kind: 'perfectScores', count: 27 })).toBe('27 plates got 5 out of 5. The kitchen is showing off.')
    expect(de({ kind: 'perfectScores', count: 1 })).toBe('Ein Teller mit 5 von 5. Die Küche gibt an.')
    expect(de({ kind: 'perfectScores', count: 27 })).toBe('27 Teller mit 5 von 5. Die Küche gibt an.')
  })

  it("uses the kitchen's own word for the best reaction", () => {
    expect(en({ kind: 'superDelicious', count: 27 })).toBe('"Super delicious", said 27 times. Somebody pass a napkin.')
    expect(en({ kind: 'superDelicious', count: 1 })).toBe('"Super delicious", said once so far. Somebody pass a napkin.')
    expect(de({ kind: 'superDelicious', count: 27 })).toBe('«Mega fein», schon 27-mal gesagt. Bitte eine Serviette reichen.')
    expect(factLine({ kind: 'superDelicious', count: 3 }, cockpitCopy.en.facts, { ...english, superDelicious: 'Heaven' }).text).toBe('"Heaven", said 3 times. Somebody pass a napkin.')
  })

  it('names the favourite weekday', () => {
    expect(en({ kind: 'favouriteWeekday', weekday: 6, count: 17 })).toBe('Sunday is feast day: 17 meals so far.')
    expect(de({ kind: 'favouriteWeekday', weekday: 6, count: 17 })).toBe('Am Sonntag wird geschlemmt: schon 17 Mahlzeiten.')
  })

  it('judges the stomach by how well the cravings were met', () => {
    expect(en({ kind: 'cravingAccuracy', percent: 80 })).toBe('80% craving accuracy. The stomach knows what it wants.')
    expect(en({ kind: 'cravingAccuracy', percent: 79 })).toBe('79% craving accuracy. The stomach is mostly right.')
    expect(en({ kind: 'cravingAccuracy', percent: 59 })).toBe('59% craving accuracy. The stomach loves a surprise.')
    expect(de({ kind: 'cravingAccuracy', percent: 80 })).toBe('80% Treffsicherheit bei den Herzen. Der Bauch weiss, was er will.')
    expect(de({ kind: 'cravingAccuracy', percent: 60 })).toBe('60% Treffsicherheit bei den Herzen. Der Bauch liegt meistens richtig.')
    expect(de({ kind: 'cravingAccuracy', percent: 12 })).toBe('12% Treffsicherheit bei den Herzen. Der Bauch liebt Überraschungen.')
  })

  it('counts seconds and proof photos', () => {
    expect(en({ kind: 'seconds', count: 1 })).toBe('Seconds, once. No regrets.')
    expect(en({ kind: 'seconds', count: 6 })).toBe('Seconds, 6 times. No regrets.')
    expect(de({ kind: 'seconds', count: 6 })).toBe('6-mal Nachschlag geholt. Keine Reue.')
    expect(en({ kind: 'proofPhotos', count: 1 })).toBe('One proof photo taken. It really happened.')
    expect(en({ kind: 'proofPhotos', count: 65 })).toBe('65 proof photos taken. It all really happened.')
    expect(de({ kind: 'proofPhotos', count: 65 })).toBe('65 Beweisfotos gemacht. Es ist alles wirklich passiert.')
  })

  it('keeps the order of the facts and only links the one about a dish', () => {
    const lines = factLines(
      [
        { kind: 'mostEaten', dishId: 'alp', count: 3 },
        { kind: 'streak', days: 3 },
        { kind: 'seconds', count: 2 },
      ],
      cockpitCopy.en.facts,
      english,
    )
    expect(lines.map((line) => line.key)).toEqual(['mostEaten', 'streak', 'seconds'])
    expect(lines.map((line) => line.dishId)).toEqual(['alp', undefined, undefined])
  })
})

// ------------------------------------------------------------ house rules --

/** Every text the copy can produce: plain strings, and functions tried with a few kinds of arguments. */
function everyText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (typeof node === 'function') {
    for (const args of [[1], [2], [0], [1, 1], [2, 5], ['x'], ['x', 1], ['x', 2], ['x', 'y'], ['x', 'y', 3], ['x', 'y', null], [5, '80%', 1, 2, 3], [0, 300], [700, null]]) {
      try {
        const result: unknown = (node as (...a: unknown[]) => unknown)(...args)
        if (typeof result === 'string') out.push(result)
      } catch {
        /* not this function's kind of argument */
      }
    }
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) everyText(value, out)
  }
  return out
}

describe('the copy follows the house rules', () => {
  const all = { en: everyText(cockpitCopy.en), de: everyText(cockpitCopy.de) }

  it('has plenty of text in both languages', () => {
    expect(all.en.length).toBeGreaterThan(200)
    expect(all.de.length).toBe(all.en.length)
  })

  it.each(['en', 'de'] as const)('uses no em dashes and no middle dots (%s)', (lang) => {
    for (const text of all[lang]) expect(text).not.toMatch(/[—·•]/)
  })

  it('writes German the Swiss way, without ß', () => {
    for (const text of all.de) expect(text).not.toContain('ß')
  })

  it.each(['en', 'de'] as const)('has no all-caps words (%s)', (lang) => {
    for (const text of all[lang]) expect(text).not.toMatch(/\b[A-ZÄÖÜ]{4,}\b/)
  })

  it('never judges calories', () => {
    const judging = /too (much|many)|unhealthy|guilt|\bsins?\b|burn|\bdiet|target|limit|\bgoal|zu viel|ungesund|sünd|diät|\bziel/i
    for (const lang of ['en', 'de'] as const) {
      for (const part of [cockpitCopy[lang].calories, cockpitCopy[lang].taste, cockpitCopy[lang].tiles, cockpitCopy[lang].detail]) {
        for (const text of everyText(part)) if (/kcal|calor|kalor/i.test(text)) expect(text).not.toMatch(judging)
      }
    }
  })
})

describe('numbers and dates', () => {
  it('writes means with one decimal in both languages', () => {
    expect(formats('en').one(4.2153)).toBe('4.2')
    expect(formats('de').one(4.2153)).toBe('4.2')
    expect(formats('en').one(5)).toBe('5.0')
  })

  it('groups thousands the British and the Swiss way', () => {
    expect(formats('en').whole(49290.4)).toBe('49,290')
    // Swiss German separates thousands with an apostrophe; which apostrophe depends on the browser's data.
    expect(formats('de').whole(49290.4)).toMatch(/^49['’]290$/)
    expect(formats('en').whole(250)).toBe('250')
  })

  it('writes shares as percents', () => {
    expect(formats('en').percent(0.8038)).toBe('80%')
    expect(formats('de').percent(0.0972)).toBe('10%')
  })

  it('shows a decimal only when there is one', () => {
    expect(formats('en').loose(2)).toBe('2')
    expect(formats('en').loose(1.5)).toBe('1.5')
    expect(formats('de').loose(0.5)).toBe('0.5')
  })

  it('names months long and short', () => {
    expect(monthName('2026-11', 'en')).toBe('November 2026')
    expect(monthName('2026-11', 'de')).toBe('November 2026')
    expect(monthName('2026-10', 'en', 'short')).toBe('Oct')
    expect(monthName('2026-10', 'de', 'short')).toBe('Okt')
  })

  it('writes hours as clock times', () => {
    expect(hourLabel(7)).toBe('07:00')
    expect(hourLabel(19)).toBe('19:00')
  })

  it('names the months on a long time axis, and the ends of a short one', () => {
    expect(timeTicks('2026-08-10', '2026-11-15', 'en')).toEqual([
      { value: 22, label: 'Sept' },
      { value: 52, label: 'Oct' },
      { value: 83, label: 'Nov' },
    ])
    expect(timeTicks('2026-11-02', '2026-11-08', 'en')).toEqual([
      { value: 0, label: '2 Nov' },
      { value: 6, label: '8 Nov' },
    ])
    expect(timeTicks('2026-11-02', '2026-11-02', 'en')).toEqual([{ value: 0, label: '2 Nov' }])
    expect(timeTicks('2025-01-01', '2026-11-08', 'en', 5).length).toBeLessThanOrEqual(5)
  })
})
