// A small seeded random generator. The demo kitchen is built from it, so opening the
// demo twice on the same day gives the same meals, ratings and photos.

export interface Rng {
  /** A number from 0 (inclusive) to 1 (exclusive). */
  (): number
  /** A whole number from min to max, both included. */
  int(min: number, max: number): number
  /** A number from min (inclusive) to max (exclusive). */
  between(min: number, max: number): number
  chance(probability: number): boolean
  pick<T>(list: readonly T[]): T
  /** Pick by weight: weighted([['a', 3], ['b', 1]]) returns 'a' three times out of four. */
  weighted<T>(options: readonly (readonly [T, number])[]): T
  shuffle<T>(list: readonly T[]): T[]
  /** An independent generator. Adding draws to one part never shifts another. */
  fork(label: string | number): Rng
}

function hash(text: string): number {
  let h = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

export function makeRng(seed: string | number): Rng {
  const name = String(seed)
  let state = hash(name)
  // mulberry32
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng = next as Rng
  rng.int = (min, max) => min + Math.floor(next() * (max - min + 1))
  rng.between = (min, max) => min + next() * (max - min)
  rng.chance = (probability) => next() < probability
  rng.pick = (list) => list[Math.floor(next() * list.length)]
  rng.weighted = (options) => {
    const total = options.reduce((sum, [, weight]) => sum + weight, 0)
    let at = next() * total
    for (const [value, weight] of options) {
      at -= weight
      if (at < 0) return value
    }
    return options[options.length - 1][0]
  }
  rng.shuffle = (list) => {
    const copy = [...list]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }
  rng.fork = (label) => makeRng(`${name}/${label}`)
  return rng
}
