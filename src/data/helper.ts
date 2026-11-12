// The app's way to the kitchen's helper (the Edge Function "ai"). Screens call these;
// they never talk to the backend themselves. The helper needs a connection, so nothing
// here is queued: it answers now or says why not.

import { backend, db, isDemo } from './app'
import { BackendError, type HelperFailure, type RecipeFromLinkResult } from './backend'

/** Why a link could not be read. The helper's own words, plus two only the app knows. */
export type ReadProblem = HelperFailure | 'offline' | 'demo'

export class ReadError extends Error {
  constructor(readonly code: ReadProblem) {
    super(code)
    this.name = 'ReadError'
  }
}

export interface ReadOptions {
  lang: 'en' | 'de'
  translate: boolean
  metric: boolean
  photo: boolean
}

const KNOWN: readonly HelperFailure[] = ['bad_request', 'not_signed_in', 'not_member', 'limit', 'bad_link', 'blocked', 'unreachable', 'too_big', 'not_a_page', 'not_a_recipe', 'helper_off', 'helper_down']

/** What went wrong, in one of the words the screens have a sentence for. */
export function readProblem(error: unknown): ReadProblem {
  if (error instanceof ReadError) return error.code
  if (!(error instanceof BackendError)) return 'helper_down'
  if (error.kind === 'network') return 'offline'
  if (error.kind === 'auth') return 'not_signed_in'
  return KNOWN.find((code) => code === error.code) ?? 'helper_down'
}

/** The tags the kitchen uses most, so the helper reuses them instead of inventing near-twins. */
export function mostUsedTags(dishes: { tags: string[]; deletedAt?: string | null }[], limit = 30): string[] {
  const counts = new Map<string, number>()
  for (const dish of dishes) if (!dish.deletedAt) for (const tag of dish.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag)
}

/** Have a recipe page read. Rejects with a ReadError. */
export async function readRecipe(link: string, options: ReadOptions): Promise<RecipeFromLinkResult> {
  // The demo kitchen lives on this phone only: there is no kitchen in the cloud to ask for it.
  if (isDemo) throw new ReadError('demo')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ReadError('offline')
  try {
    const knownTags = mostUsedTags(await db.dishes.toArray())
    return await backend.readRecipe({ link, ...options, knownTags })
  } catch (error) {
    throw new ReadError(readProblem(error))
  }
}
