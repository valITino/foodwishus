// Turns what the cloud said into a sentence a person can act on: what happened and
// what to do next. Pure, so every code is covered by a unit test.

import { isBackendError } from '../../data/backend'

export const errorCopy = {
  en: {
    network: 'No connection to the cloud right now. Check your internet and try again.',
    anonymousDisabled:
      'The cloud does not allow phone logins yet. In Supabase, open Authentication, then Sign In / Providers, and turn on "Allow anonymous sign-ins". Then try again.',
    setup: 'The cloud is not set up yet. Finish the Supabase setup from the README, then try again.',
    auth: 'This phone could not sign in to the cloud. Close the app, open it again and retry.',
    inviteInvalid: 'That code did not work. It may be mistyped, already used or older than 48 hours. Ask your partner for a fresh one.',
    kitchenFull: 'This kitchen already has two people. To move a profile to this phone, ask your partner for a restore code.',
    alreadyInKitchen: 'This phone already has a seat in a kitchen. To get back in, use a restore code from your partner or the recovery key.',
    kitchenExists: 'A kitchen already exists. Ask your partner for an invite, or get back in with the recovery key.',
    recoveryKeyInvalid: 'That key does not match. Check each group again. The key never contains 0, O, 1 or I.',
    memberNotFound: 'That profile is no longer in the kitchen. Go back and pick again.',
    notInKitchen: 'This phone is not paired with a kitchen any more. Pair it again, then retry.',
    rejected: (code: string) => `The cloud said no (${code}). Wait a moment and try again.`,
    unknown: 'That did not work. Please try again.',
  },
  de: {
    network: 'Gerade keine Verbindung zur Cloud. Prüf dein Internet und versuch es nochmal.',
    anonymousDisabled:
      'Die Cloud erlaubt noch keine Handy-Logins. Öffne in Supabase Authentication, dann Sign In / Providers, und schalte "Allow anonymous sign-ins" ein. Dann versuch es nochmal.',
    setup: 'Die Cloud ist noch nicht eingerichtet. Schliess das Supabase-Setup aus dem README ab und versuch es dann nochmal.',
    auth: 'Dieses Handy konnte sich nicht bei der Cloud anmelden. Schliess die App, öffne sie wieder und versuch es nochmal.',
    inviteInvalid: 'Der Code hat nicht funktioniert. Vielleicht vertippt, schon benutzt oder älter als 48 Stunden. Lass dir einen frischen geben.',
    kitchenFull: 'In dieser Küche sind schon zwei. Um ein Profil auf dieses Handy umzuziehen, lass dir einen Umzugscode geben.',
    alreadyInKitchen: 'Dieses Handy hat schon einen Platz in einer Küche. Zurück kommst du mit einem Umzugscode oder dem Notfallschlüssel.',
    kitchenExists: 'Es gibt schon eine Küche. Lass dich einladen oder komm mit dem Notfallschlüssel zurück.',
    recoveryKeyInvalid: 'Der Schlüssel passt nicht. Prüf jede Gruppe nochmal. Im Schlüssel kommen 0, O, 1 und I nie vor.',
    memberNotFound: 'Dieses Profil ist nicht mehr in der Küche. Geh zurück und wähl nochmal.',
    notInKitchen: 'Dieses Handy ist mit keiner Küche mehr gekoppelt. Kopple es neu und versuch es dann nochmal.',
    rejected: (code: string) => `Die Cloud hat Nein gesagt (${code}). Warte kurz und versuch es nochmal.`,
    unknown: 'Das hat nicht geklappt. Bitte nochmal versuchen.',
  },
}

export type ErrorCopy = typeof errorCopy.en

/** A friendly sentence for anything that can go wrong while pairing. */
export function explain(error: unknown, c: ErrorCopy): string {
  if (!isBackendError(error)) return c.unknown
  if (error.kind === 'network') return c.network
  if (error.kind === 'setup') return error.code === 'anonymous_disabled' ? c.anonymousDisabled : c.setup
  if (error.code === 'anonymous_disabled') return c.anonymousDisabled
  if (error.kind === 'auth') return c.auth
  switch (error.code) {
    case 'invite_invalid':
      return c.inviteInvalid
    case 'kitchen_full':
      return c.kitchenFull
    case 'already_in_kitchen':
      return c.alreadyInKitchen
    case 'kitchen_already_exists':
      return c.kitchenExists
    case 'recovery_key_invalid':
      return c.recoveryKeyInvalid
    case 'member_not_found':
      return c.memberNotFound
    case 'not_in_kitchen':
      return c.notInKitchen
    default:
      return c.rejected(error.code)
  }
}
