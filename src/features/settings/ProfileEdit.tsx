// "My profile": the same form as in onboarding, filled with what is saved.

import { useEffect, useState } from 'react'
import { back } from '../../app/router'
import { updateMyProfile } from '../../data/actions'
import { useMe } from '../../data/hooks'
import { useCopy, useT } from '../../i18n'
import { Button, buzz, SteamLoader, toast } from '../../ui/components'
import { ErrorNote, StepPage } from '../onboarding/parts'
import { changesBetween, draftFromMember, isReady, type ProfileDraft } from '../profile/draft'
import { focusNameField, ProfileForm } from '../profile/ProfileForm'
import { settingsCopy } from './copy'

export function ProfileEdit() {
  const c = useCopy(settingsCopy)
  const t = useT()
  const me = useMe()
  const member = me?.member
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // Fill the form once, as soon as the saved profile is there. Later changes from a sync must not wipe what is being typed.
  useEffect(() => {
    if (!draft && member) setDraft(draftFromMember(member))
  }, [draft, member])

  const save = async () => {
    if (!draft || !member) return
    if (!isReady(draft)) {
      focusNameField()
      return setProblem(c.profile.nameMissing)
    }
    const changes = changesBetween(draftFromMember(member), draft)
    try {
      if (Object.keys(changes).length > 0) await updateMyProfile(changes)
    } catch {
      return setProblem(t.common.somethingWrong)
    }
    buzz(12)
    toast(t.common.saved)
    back('/settings')
  }

  return (
    <StepPage
      title={c.profile.title}
      backTo="/settings"
      footer={
        draft && (
          <>
            {problem && <ErrorNote>{problem}</ErrorNote>}
            <Button size="lg" block onClick={() => void save()}>
              {c.profile.save}
            </Button>
          </>
        )
      }
    >
      {draft ? (
        <ProfileForm
          draft={draft}
          onChange={(patch) => {
            setProblem(null)
            setDraft((was) => (was ? { ...was, ...patch } : was))
          }}
        />
      ) : (
        <SteamLoader />
      )}
    </StepPage>
  )
}
