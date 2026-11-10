// Original little lines about food, cooking and love. Rotated on Today, empty states,
// loading screens and after reviews. Keep each under 12 words.

import type { Lang } from '../i18n'

export const quotes: Record<Lang, string[]> = {
  en: [
    'Love, served warm.',
    'Made with butter, patience and a little chaos.',
    'Every plate is a tiny love letter.',
    'A clean plate is the sweetest compliment.',
    'Stir slowly, love loudly.',
    "Kitchen's open, heart's open.",
    "Today's special: us.",
    'Butter makes it better. So do you.',
    "Proof or it didn't happen.",
    'No photo, no dessert.',
    'Grandma would be proud.',
    'I wish, you whisk.',
    'Second helpings are a love language.',
    'Home is wherever your apron hangs.',
    'Salt the water, sweeten the day.',
    'Good things simmer.',
  ],
  de: [
    'Liebe, warm serviert.',
    'Mit Butter, Geduld und ein bisschen Chaos gemacht.',
    'Jeder Teller ist ein kleiner Liebesbrief.',
    'Ein leerer Teller ist das schönste Kompliment.',
    'Langsam rühren, laut lieben.',
    'Küche offen, Herz offen.',
    'Tagesempfehlung: wir zwei.',
    'Mit Butter wird alles besser. Mit dir auch.',
    'Ohne Beweisfoto ist es nie passiert.',
    'Kein Foto, kein Dessert.',
    'Grosi wäre stolz.',
    'Ich wünsche, du rührst.',
    'Nachschlag ist auch eine Liebessprache.',
    'Zuhause ist, wo deine Schürze hängt.',
    'En Guete, Schätzli!',
    'Gutes braucht Zeit zum Köcheln.',
  ],
}

/** The same quote all day, a new one tomorrow. */
export function quoteOfTheDay(lang: Lang, date = new Date()): string {
  const list = quotes[lang]
  const dayNumber = Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000)
  return list[dayNumber % list.length]
}
