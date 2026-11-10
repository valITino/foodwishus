import { describe, expect, it } from 'vitest'
import { BackendError } from '../../src/data/backend'
import { errorCopy, explain } from '../../src/features/onboarding/errors'

const CASES: [BackendError | Error, keyof typeof errorCopy.en][] = [
  [new BackendError('network', 'offline'), 'network'],
  [new BackendError('setup', 'anonymous_disabled'), 'anonymousDisabled'],
  [new BackendError('setup', 'something_else'), 'setup'],
  [new BackendError('auth', 'session_invalid'), 'auth'],
  [new BackendError('rejected', 'invite_invalid'), 'inviteInvalid'],
  [new BackendError('rejected', 'kitchen_full'), 'kitchenFull'],
  [new BackendError('rejected', 'already_in_kitchen'), 'alreadyInKitchen'],
  [new BackendError('rejected', 'kitchen_already_exists'), 'kitchenExists'],
  [new BackendError('rejected', 'recovery_key_invalid'), 'recoveryKeyInvalid'],
  [new BackendError('rejected', 'member_not_found'), 'memberNotFound'],
  [new BackendError('rejected', 'not_in_kitchen'), 'notInKitchen'],
  [new Error('boom'), 'unknown'],
]

describe('friendly pairing errors', () => {
  for (const lang of ['en', 'de'] as const) {
    it(`maps every cloud error to its own sentence (${lang})`, () => {
      const c = errorCopy[lang]
      const sentences = CASES.map(([error, key]) => {
        const sentence = explain(error, c)
        expect(sentence).toBe(c[key])
        return sentence
      })
      expect(new Set(sentences).size).toBe(CASES.length)
      // Each one says what happened and what to do: at least two sentences, and never an em dash.
      for (const sentence of sentences.slice(0, -1)) {
        expect(sentence.split(/[.?!]\s/).length).toBeGreaterThanOrEqual(2)
        expect(sentence).not.toMatch(/—/)
      }
    })
  }

  it('explains exactly where the Supabase switch is', () => {
    const sentence = explain(new BackendError('setup', 'anonymous_disabled'), errorCopy.en)
    expect(sentence).toContain('Authentication')
    expect(sentence).toContain('Sign In / Providers')
    expect(sentence).toContain('Allow anonymous sign-ins')
    expect(explain(new BackendError('setup', 'anonymous_disabled'), errorCopy.de)).toContain('Allow anonymous sign-ins')
  })

  it('still says something useful for a code it has never seen', () => {
    expect(explain(new BackendError('rejected', 'brand_new_code'), errorCopy.en)).toContain('brand_new_code')
    expect(explain('not even an error', errorCopy.de)).toBe(errorCopy.de.unknown)
  })
})
