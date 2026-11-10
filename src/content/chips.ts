// The quick chips on the review sheet. Reviews store the key, never the words, so the
// cockpit can count them and both languages always show the same thing.

import type { Lang } from '../i18n'

export const REVIEW_CHIPS = {
  perfect: { en: 'Perfect', de: 'Perfekt' },
  keeper: { en: 'Recipe keeper', de: 'Rezept behalten' },
  restaurant: { en: 'Restaurant level', de: 'Wie im Restaurant' },
  moreSalt: { en: 'More salt', de: 'Mehr Salz' },
  tooSpicy: { en: 'Too spicy', de: 'Zu scharf' },
  moreSauce: { en: 'More sauce', de: 'Mehr Sauce' },
  crispier: { en: 'Crispier next time', de: 'Nächstes Mal knuspriger' },
  biggerPortion: { en: 'Bigger portion', de: 'Grössere Portion' },
} as const satisfies Record<string, Record<Lang, string>>

export type ChipKey = keyof typeof REVIEW_CHIPS

export const CHIP_KEYS = Object.keys(REVIEW_CHIPS) as ChipKey[]

export const isChipKey = (key: string): key is ChipKey => Object.hasOwn(REVIEW_CHIPS, key)

/** The words for a chip. Anything that is not a known key is shown as it was written. */
export function chipLabel(key: string, lang: Lang): string {
  return isChipKey(key) ? REVIEW_CHIPS[key][lang] : key
}
