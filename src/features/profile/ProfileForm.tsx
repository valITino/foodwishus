// The profile form shared by onboarding and Settings: name, role, the avatar maker and
// the status line. The caller owns the draft and the save button.

import { motion } from 'motion/react'
import { useState } from 'react'
import { useCopy, useT } from '../../i18n'
import type { Role } from '../../data/types'
import { Button, buzz, cx, Field, Segmented } from '../../ui/components'
import { Sparkle } from '../../ui/deco/Deco'
import { AvatarMaker } from './AvatarMaker'
import { profileCopy } from './copy'
import { clip, NAME_MAX, nextSuggestion, STATUS_MAX, type ProfileDraft } from './draft'
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

export function ProfileForm({ draft, onChange }: Props) {
  const c = useCopy(profileCopy)
  const t = useT()
  const [surprises, setSurprises] = useState(0)
  const used = draft.status.length

  const surprise = () => {
    buzz([10, 40, 14])
    setSurprises((n) => n + 1)
    onChange({ status: nextSuggestion(c.suggestions[draft.role], draft.status) })
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 px-4">
        <Field
          id={NAME_FIELD_ID}
          label={c.nameLabel}
          placeholder={c.namePlaceholder}
          value={draft.name}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="done"
          onChange={(e) => onChange({ name: e.target.value })}
        />
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
        <ProfileBubble
          name={draft.name.trim() || c.you}
          status={draft.status}
          placeholder={c.statusEmpty}
          avatar={draft.avatar}
          color={draft.color}
          accessory={draft.accessory}
          hop={surprises}
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
            onClick={surprise}
            icon={
              <motion.span key={surprises} initial={surprises ? { rotate: -90, scale: 0.6 } : false} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="grid">
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
      </section>
    </div>
  )
}
