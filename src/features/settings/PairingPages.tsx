// Pairing pages inside Settings: the first steps right after starting a kitchen
// (recovery key, then the invite), inviting again, moving a profile to a new phone, and
// making a new recovery key.

import { useState } from 'react'
import { back, navigate } from '../../app/router'
import { backend } from '../../data/app'
import { useMe } from '../../data/hooks'
import { useMembers, usePartner } from '../../data/queries'
import type { ID } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { Avatar, Button, buzz, cx } from '../../ui/components'
import { Icon } from '../../ui/deco/Icon'
import { pairingCopy } from '../onboarding/copy'
import { errorCopy, explain } from '../onboarding/errors'
import { forgetKey, keepKey, usePendingKey, useStarting } from '../onboarding/handoff'
import { InvitePanel } from '../onboarding/InvitePanel'
import { BusyScreen, ErrorNote, StepPage } from '../onboarding/parts'
import { RecoveryKeyNote } from '../onboarding/RecoveryKeyNote'
import { settingsCopy } from './copy'

function Intro({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="px-4">
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{lead}</p>
    </div>
  )
}

/** Right after "Start our kitchen": the recovery key once, then the invite for the partner. */
export function FirstSteps() {
  const p = useCopy(pairingCopy)
  const c = useCopy(settingsCopy)
  const starting = useStarting()
  const recoveryKey = usePendingKey()
  const partner = usePartner()
  const [confirmed, setConfirmed] = useState(false)

  if (recoveryKey) {
    return (
      <StepPage
        footer={
          <>
            {!confirmed && <p className="text-center text-xs text-ink-soft">{p.keyCard.confirmFirst}</p>}
            <Button size="lg" block disabled={!confirmed} onClick={forgetKey}>
              {p.keyCard.nextInvite}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6 pt-[max(1.25rem,env(safe-area-inset-top))]" data-testid="first-key">
          <Intro title={p.keyCard.title} lead={p.keyCard.lead} />
          <div className="px-4">
            <RecoveryKeyNote recoveryKey={recoveryKey} confirmed={confirmed} onConfirm={setConfirmed} />
          </div>
        </div>
      </StepPage>
    )
  }

  if (starting) return <BusyScreen label={p.busy.start} />

  return (
    <StepPage
      footer={
        <Button variant={partner ? 'primary' : 'secondary'} size={partner ? 'lg' : 'md'} block onClick={() => navigate('/', { replace: true })}>
          {c.first.done}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 pt-[max(1.25rem,env(safe-area-inset-top))]" data-testid="first-invite">
        <Intro title={partner ? p.invite.completeTitle : p.invite.title} lead={partner ? p.invite.completeLead : p.invite.lead} />
        <div className="px-4">
          <InvitePanel kind="join" />
        </div>
      </div>
    </StepPage>
  )
}

/** Settings, while alone: the invite again. */
export function InvitePage() {
  const p = useCopy(pairingCopy)
  const partner = usePartner()
  return (
    <StepPage title={partner ? p.invite.completeTitle : p.invite.title} backTo="/settings">
      <div className="flex flex-col gap-5 px-4">
        <p className="text-sm text-ink-soft">{partner ? p.invite.completeLead : p.invite.lead}</p>
        <InvitePanel kind="join" />
      </div>
    </StepPage>
  )
}

/** Move a profile to a new phone: pick whose, then hand over the restore code. */
export function MovePage() {
  const p = useCopy(pairingCopy)
  const c = useCopy(settingsCopy)
  const me = useMe()
  const members = useMembers()
  const [who, setWho] = useState<ID | null>(null)
  const [made, setMade] = useState(false)
  const chosen = members?.find((m) => m.id === who)

  if (made && chosen) {
    const mine = chosen.id === me?.memberId
    return (
      <StepPage title={c.move.title} backTo="/settings">
        <div className="flex flex-col gap-5 px-4" data-testid="restore-invite">
          <div>
            <h2 className="text-xl">{p.restoreInvite.title(chosen.name)}</h2>
            <p className="mt-1.5 text-sm text-ink-soft">{p.restoreInvite.lead}</p>
          </div>
          <InvitePanel kind="restore" memberId={chosen.id} />
          <p className="text-xs leading-snug text-ink-soft">{mine ? c.move.mine : c.move.theirs(chosen.name)}</p>
          <Button variant="quiet" className="-ml-3 self-start" onClick={() => setMade(false)}>
            {c.move.other}
          </Button>
        </div>
      </StepPage>
    )
  }

  return (
    <StepPage
      title={c.move.title}
      backTo="/settings"
      footer={
        <Button size="lg" block disabled={!chosen} onClick={() => setMade(true)}>
          {chosen ? c.move.make : c.move.pickFirst}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 px-4">
        <p className="text-sm text-ink-soft">{c.move.lead}</p>
        <div>
          <h2 className="mb-3 text-xl">{c.move.whose}</h2>
          <div role="radiogroup" aria-label={c.move.whose} className="flex flex-col gap-3">
            {(members ?? []).map((member) => {
              const on = member.id === who
              return (
                <button
                  key={member.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    buzz(10)
                    setWho(member.id)
                  }}
                  className={cx(
                    'flex min-h-20 w-full items-center gap-4 rounded-card border-[1.5px] bg-surface p-4 text-left transition-colors duration-150 active:translate-y-[2px]',
                    on ? 'border-ink' : 'border-line-strong',
                  )}
                >
                  <Avatar avatar={member.avatar} color={member.color} accessory={member.accessory} size={56} />
                  <span className="min-w-0 flex-1 truncate font-display text-lg font-bold font-soft">{member.id === me?.memberId ? c.move.me(member.name) : member.name}</span>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border-[1.5px]', on ? 'border-ink bg-ink text-ground' : 'border-line-strong text-transparent')} aria-hidden>
                    <Icon name="check" size={16} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </StepPage>
  )
}

/** A new recovery key. The old one stops working, so this asks first. */
export function NewKeyPage() {
  const p = useCopy(pairingCopy)
  const c = useCopy(settingsCopy)
  const errors = useCopy(errorCopy)
  const t = useT()
  const recoveryKey = usePendingKey()
  const [confirmed, setConfirmed] = useState(false)
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const make = async () => {
    setProblem(null)
    setWorking(true)
    try {
      keepKey(await backend.rotateRecoveryKey())
      buzz([12, 40, 12])
    } catch (e) {
      setProblem(explain(e, errors))
    }
    setWorking(false)
  }

  if (recoveryKey) {
    return (
      <StepPage
        title={p.keyCard.title}
        backTo="/settings"
        footer={
          <>
            {!confirmed && <p className="text-center text-xs text-ink-soft">{p.keyCard.confirmFirst}</p>}
            <Button
              size="lg"
              block
              disabled={!confirmed}
              onClick={() => {
                forgetKey()
                back('/settings')
              }}
            >
              {t.actions.done}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 px-4" data-testid="new-key">
          <p className="text-sm text-ink-soft">{p.keyCard.lead}</p>
          <RecoveryKeyNote recoveryKey={recoveryKey} confirmed={confirmed} onConfirm={setConfirmed} />
        </div>
      </StepPage>
    )
  }

  return (
    <StepPage
      title={c.newKey.title}
      backTo="/settings"
      footer={
        <>
          {problem && <ErrorNote>{problem}</ErrorNote>}
          <Button size="lg" block disabled={working} onClick={() => void make()}>
            {working ? c.newKey.making : c.newKey.make}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-4">
        <p className="text-sm text-ink-soft">{c.newKey.lead}</p>
        <div role="note" className="flex items-start gap-2.5 rounded-card border-[1.5px] border-butter-ink bg-surface px-3.5 py-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-butter text-xs font-extrabold text-on-rose" aria-hidden>
            !
          </span>
          <p className="min-w-0 text-sm font-bold leading-snug">{c.newKey.warning}</p>
        </div>
      </div>
    </StepPage>
  )
}
