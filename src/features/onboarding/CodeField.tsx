// A field for invite codes and recovery keys. It shows the code in groups of five while
// you type, accepts a pasted invite link, and keeps the cursor where it was.

import { Field } from '../../ui/components'
import { caretAfterGrouping, cleanCode, groupCode, readInvite } from './codes'

interface Props {
  label: string
  hint?: string
  placeholder?: string
  /** The clean code: letters and digits only. */
  value: string
  length: number
  onChange: (code: string, meta: { restore: boolean }) => void
  /** Pressing "go" on the keyboard. */
  onEnter?: () => void
  /** Also understand a whole invite link. */
  acceptLinks?: boolean
}

export function CodeField({ label, hint, placeholder, value, length, onChange, onEnter, acceptLinks = false }: Props) {
  return (
    <Field
      label={label}
      hint={hint}
      placeholder={placeholder}
      value={groupCode(value)}
      inputMode="text"
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="go"
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.()
      }}
      onChange={(e) => {
        const input = e.target
        const raw = input.value
        const isLink = acceptLinks && /code=/.test(raw)
        const next = isLink ? readInvite(raw) : { code: cleanCode(raw, length), restore: false }
        // Count the letters and digits in front of the cursor, then put it back behind the same ones.
        const before = isLink ? next.code.length : cleanCode(raw.slice(0, input.selectionStart ?? raw.length), length).length
        onChange(next.code, { restore: next.restore })
        requestAnimationFrame(() => {
          if (document.activeElement !== input) return
          const at = caretAfterGrouping(groupCode(next.code), before)
          input.setSelectionRange(at, at)
        })
      }}
    />
  )
}
