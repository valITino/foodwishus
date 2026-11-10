import { describe, expect, it } from 'vitest'
import { caretAfterGrouping, cleanCode, groupCode, INVITE_LENGTH, invitePath, KEY_LENGTH, readInvite } from '../../src/features/onboarding/codes'

describe('invite codes and recovery keys', () => {
  it('cleans what was typed: letters and digits, upper case, cut to length', () => {
    expect(cleanCode(' abcde-fghjk ', INVITE_LENGTH)).toBe('ABCDEFGHJK')
    expect(cleanCode('abcde fghjk lmnpq', INVITE_LENGTH)).toBe('ABCDEFGHJK')
    expect(cleanCode('ab-cd', INVITE_LENGTH)).toBe('ABCD')
    expect(cleanCode('', KEY_LENGTH)).toBe('')
  })

  it('shows codes in groups of five', () => {
    expect(groupCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
    expect(groupCode('ABCDEFGHJKLMNPQRSTUV')).toBe('ABCDE-FGHJK-LMNPQ-RSTUV')
    expect(groupCode('ABCDEFG')).toBe('ABCDE-FG')
    expect(groupCode('ABCDE')).toBe('ABCDE')
    expect(groupCode('')).toBe('')
  })

  it('takes the code out of a pasted invite link and notices a restore link', () => {
    expect(readInvite('https://example.org/foodwishus/#/join?code=abcdefghjk')).toEqual({ code: 'ABCDEFGHJK', restore: false })
    expect(readInvite('https://example.org/foodwishus/#/join?code=ABCDEFGHJK&restore=1')).toEqual({ code: 'ABCDEFGHJK', restore: true })
    expect(readInvite('abcde-fghjk')).toEqual({ code: 'ABCDEFGHJK', restore: false })
  })

  it('builds the route of an invite link, which reads back to the same code', () => {
    expect(invitePath('ABCDEFGHJK', false)).toBe('/join?code=ABCDEFGHJK')
    expect(invitePath('ABCDEFGHJK', true)).toBe('/join?code=ABCDEFGHJK&restore=1')
    expect(readInvite(`https://x.test/#${invitePath('ABCDEFGHJK', true)}`)).toEqual({ code: 'ABCDEFGHJK', restore: true })
  })

  it('keeps the cursor behind the same characters after regrouping', () => {
    // typing the sixth character: the dash appears in front of it
    expect(caretAfterGrouping('ABCDE-F', 6)).toBe(7)
    // editing in the middle stays in the middle
    expect(caretAfterGrouping('ABCDE-FGHJK', 3)).toBe(3)
    expect(caretAfterGrouping('ABCDE-FGHJK', 5)).toBe(5)
    expect(caretAfterGrouping('ABCDE-FGHJK', 0)).toBe(0)
    expect(caretAfterGrouping('ABCDE-FGHJK', 99)).toBe(11)
  })
})
