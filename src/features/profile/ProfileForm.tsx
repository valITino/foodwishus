// The parts a profile is made of: the name field, the role question, the avatar maker
// (in AvatarMaker.tsx) and the status line. The start wizard shows them one per step;
// Settings shows them together as ProfileForm. The caller owns the draft and the buttons.

import { motion } from 'motion/react'
import { useState } from 'react'
import { useCopy, useT } from '../../i18n'
import type { Role } from '../../data/types'
import { Avatar, Button, buzz, Chip, cx, Field, Segmented } from '../../ui/components'
import { Sparkle } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { AvatarMaker } from './AvatarMaker'
import { profileCopy } from './copy'
import { clip, defaultDraft, NAME_MAX, nextSuggestion, STATUS_MAX, type ProfileDraft } from './draft'
import { ProfileBubble } from './ProfileBubble'

const NAME_FIELD_ID = 'profile-name'

/** Bring the name field into view and put the cursor in it (after "your name is missing"). */
export function focusNameField(): void {
  const field = document.getElementById(NAME_FIELD_ID)
  field?.scrollIntoView({ block: 'center' })
  field?.focus({ preventScroll: true })
}

interface Props {
  draft: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
}

/** The name. It is also what the person logs in with, and the hint says so. */
export function NameField({ draft, onChange }: Props) {
  const c = useCopy(profileCopy)
  return (
    <Field
      id={NAME_FIELD_ID}
      label={c.nameLabel}
      hint={c.nameHint}
      placeholder={c.namePlaceholder}
      value={draft.name}
      maxLength={NAME_MAX}
      autoComplete="off"
      autoCapitalize="words"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      onChange={(e) => onChange({ name: e.target.value })}
    />
  )
}

interface RoleCardsProps {
  /** Null until one of the two was picked. */
  value: Role | null
  onChange: (role: Role) => void
}

/** "Who are you at the table?" as two big cards. */
export function RoleCards({ value, onChange }: RoleCardsProps) {
  const c = useCopy(profileCopy)
  const t = useT()
  return (
    <div role="radiogroup" aria-label={c.roleQuestion} className="flex flex-col gap-3">
      {(['chef', 'taster'] as const).map((role) => {
        const on = value === role
        const look = defaultDraft(role)
        return (
          <motion.button
            key={role}
            type="button"
            role="radio"
            aria-checked={on}
            data-role={role}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              buzz(10)
              onChange(role)
            }}
            className={cx('flex min-h-24 w-full items-center gap-4 rounded-card border-[1.5px] bg-surface p-4 text-left transition-colors duration-150', on ? 'border-ink' : 'border-line-strong')}
          >
            <Avatar avatar={look.avatar} color={look.color} size={64} />
            <span className="min-w-0 flex-1">
              <span className="block text-2xs font-extrabold text-ink-soft">{t.roles[role]}</span>
              <span className="block font-display text-lg font-bold leading-tight font-soft">{c.roleCards[role].title}</span>
              <span className="mt-1 block text-xs leading-snug text-ink-soft">{c.roleCards[role].body}</span>
            </span>
            <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border-[1.5px]', on ? 'border-ink bg-ink text-ground' : 'border-line-strong text-transparent')} aria-hidden>
              <Icon name="check" size={16} />
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** The status line: a live bubble, the field with its counter, and suggestions to borrow. */
export function StatusEditor({ draft, onChange }: Props) {
  const c = useCopy(profileCopy)
  const [hops, setHops] = useState(0)
  const used = draft.status.length
  const suggestions = c.suggestions[draft.role]

  const take = (status: string) => {
    buzz([10, 40, 14])
    setHops((n) => n + 1)
    onChange({ status })
  }

  return (
    <div className="flex flex-col gap-3">
      <ProfileBubble
        name={draft.name.trim() || c.you}
        status={draft.status}
        placeholder={c.statusEmpty}
        avatar={draft.avatar}
        color={draft.color}
        accessory={draft.accessory}
        hop={hops}
      />
      <Field
        label={c.statusLabel}
        hint={c.statusHint}
        placeholder={c.statusPlaceholder}
        value={draft.status}
        maxLength={STATUS_MAX}
        enterKeyHint="done"
        onChange={(e) => onChange({ status: clip(e.target.value, STATUS_MAX) })}
      />
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => take(nextSuggestion(suggestions, draft.status))}
          icon={
            <motion.span key={hops} initial={hops ? { rotate: -90, scale: 0.6 } : false} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="grid">
              <Sparkle size={18} />
            </motion.span>
          }
        >
          {c.surprise}
        </Button>
        <span role="status" data-testid="status-counter" className={cx('tabular text-xs', used >= STATUS_MAX ? 'font-extrabold text-ink' : 'font-bold text-ink-soft')}>
          <span aria-hidden>{c.counter(used, STATUS_MAX)}</span>
          <span className="sr-only">{c.counterLabel(used, STATUS_MAX)}</span>
        </span>
      </div>
      <div>
        <p className="mb-2 text-xs font-extrabold">{c.statusBorrow}</p>
        <div className="flex flex-wrap gap-2" data-testid="status-suggestions">
          {suggestions.slice(0, 4).map((line) => (
            <Chip key={line} selected={draft.status === line} onClick={() => take(line)}>
              {line}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Everything at once, for "My profile" in Settings. */
export function ProfileForm({ draft, onChange }: Props) {
  const c = useCopy(profileCopy)
  const t = useT()

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 px-4">
        <NameField draft={draft} onChange={onChange} />
        <div>
          <p className="mb-1.5 text-xs font-extrabold">{c.roleLabel}</p>
          <Segmented<Role>
            label={c.roleLabel}
            value={draft.role}
            options={[
              { value: 'chef', label: t.roles.chef },
              { value: 'taster', label: t.roles.taster },
            ]}
            onChange={(role) => {
              buzz(8)
              onChange({ role })
            }}
          />
          <p className="mt-1.5 text-xs text-ink-soft">{c.roleHint[draft.role]}</p>
        </div>
      </section>

      <AvatarMaker draft={draft} onChange={onChange} />

      <section aria-labelledby="status-title" className="flex flex-col gap-3 px-4">
        <h2 id="status-title" className="text-lg">
          {c.statusTitle}
        </h2>
        <StatusEditor draft={draft} onChange={onChange} />
      </section>
    </div>
  )
}
