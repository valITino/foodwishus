// Deco artwork by name, for places where the name is stored as data (a dish's icon,
// a person's avatar).

import type { FC } from 'react'
import { Bow, Cherry, Cloche, Flower, Heart, RollingPin, Sparkle, Sprig, Teacup, Whisk, type ArtProps } from './Deco'

export const DECO_ICONS: Record<string, FC<ArtProps>> = {
  cloche: Cloche,
  cherry: Cherry,
  teacup: Teacup,
  sprig: Sprig,
  flower: Flower,
  whisk: Whisk,
  'rolling-pin': RollingPin,
  bow: Bow,
  heart: Heart,
  sparkle: Sparkle,
}

export const DISH_ICONS = ['cloche', 'cherry', 'teacup', 'sprig', 'flower', 'whisk', 'rolling-pin', 'heart'] as const

export function DecoIcon({ name, ...props }: ArtProps & { name: string | null | undefined }) {
  const Art = (name && DECO_ICONS[name]) || Cloche
  return <Art {...props} />
}
