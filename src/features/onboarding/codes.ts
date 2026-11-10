// Invite codes, restore codes and recovery keys: cleaning what was typed or pasted,
// and showing long codes in readable groups. Pure helpers, unit tested.

export const INVITE_LENGTH = 10
export const KEY_LENGTH = 20
const GROUP = 5

/** Letters and digits only, upper case, cut to length. The cloud does the same. */
export function cleanCode(input: string, max: number): string {
  return input
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, max)
}

/** "ABCDEFGHJK" → "ABCDE-FGHJK" */
export function groupCode(code: string, separator = '-'): string {
  return code.match(new RegExp(`.{1,${GROUP}}`, 'g'))?.join(separator) ?? ''
}

/**
 * What someone typed or pasted into the invite field. A whole invite link works too:
 * the code is taken out of it, and a restore link says so.
 */
export function readInvite(input: string): { code: string; restore: boolean } {
  const link = /[?&]code=([A-Za-z0-9-]+)/.exec(input)
  if (link) return { code: cleanCode(link[1], INVITE_LENGTH), restore: /[?&]restore=1\b/.test(input) }
  return { code: cleanCode(input, INVITE_LENGTH), restore: false }
}

/** The route (after the #) that an invite link points to. */
export function invitePath(code: string, restore: boolean): string {
  return `/join?code=${code}${restore ? '&restore=1' : ''}`
}

/**
 * Where the cursor belongs after a field was regrouped while typing: behind the same
 * number of letters and digits as before.
 */
export function caretAfterGrouping(grouped: string, charsBefore: number): number {
  if (charsBefore <= 0) return 0
  let seen = 0
  for (let i = 0; i < grouped.length; i++) {
    if (/[A-Z0-9]/.test(grouped[i])) seen += 1
    if (seen === charsBefore) return i + 1
  }
  return grouped.length
}
