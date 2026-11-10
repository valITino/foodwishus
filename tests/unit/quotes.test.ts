import { describe, expect, it } from 'vitest'
import { quoteOfTheDay, quotes } from '../../src/content/quotes'
import type { Lang } from '../../src/i18n'

const languages: Lang[] = ['en', 'de']
const words = (line: string): number => line.trim().split(/\s+/).length
const plain = (line: string): string => line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

describe.each(languages)('quotes in %s', (lang) => {
  const list = quotes[lang]

  it('has at least 45', () => {
    expect(list.length).toBeGreaterThanOrEqual(45)
  })

  it('keeps every quote under 12 words', () => {
    for (const line of list) expect(words(line), line).toBeLessThan(12)
  })

  it('has no duplicates, not even with different punctuation', () => {
    expect(new Set(list.map(plain)).size).toBe(list.length)
  })

  it('is tidy: no stray spaces, no em dashes, a full stop or similar at the end', () => {
    for (const line of list) {
      expect(line, line).toBe(line.trim())
      expect(line, line).not.toMatch(/\s{2,}|—|–/)
      expect(line, line).toMatch(/[.!?]$/)
    }
  })

  it('shows the same quote all day and a different one tomorrow', () => {
    const morning = new Date(2026, 10, 10, 7, 30)
    const evening = new Date(2026, 10, 10, 22, 45)
    const tomorrow = new Date(2026, 10, 11, 7, 30)
    expect(list).toContain(quoteOfTheDay(lang, morning))
    expect(quoteOfTheDay(lang, evening)).toBe(quoteOfTheDay(lang, morning))
    expect(quoteOfTheDay(lang, tomorrow)).not.toBe(quoteOfTheDay(lang, morning))
  })

  it('gets through the whole collection before repeating', () => {
    const seen = new Set<string>()
    for (let day = 0; day < list.length; day++) seen.add(quoteOfTheDay(lang, new Date(2026, 0, 1 + day, 12)))
    expect(seen.size).toBe(list.length)
  })
})

describe('both languages', () => {
  it('have the same number of quotes, and German is written the Swiss way', () => {
    expect(quotes.de).toHaveLength(quotes.en.length)
    for (const line of quotes.de) expect(line, line).not.toContain('ß')
  })
})
