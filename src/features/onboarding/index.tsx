// Onboarding: everything a phone sees while it is not paired with a kitchen.
//
//   /                      welcome (or "this phone was signed out")
//   /start                 make a profile, start the kitchen
//   /join                  type an invite or restore code
//   /join?code=XXXX        invite link: make a profile, join
//   /join?code=XXXX&restore=1   restore link: move an existing profile here
//   /recover               recovery key, then "which one are you?"
//
// The app shell swaps this for the real app the instant the phone is paired. So each
// pairing call first moves the address to where the app should open, and whatever still
// has to happen afterwards (showing the recovery key, saving the status line) is handed
// over through handoff.ts.

import { MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import { navigate, type Route } from '../../app/router'
import { backend, enterDemo, joinKitchen, recoverKitchen, resumeKitchen, startKitchen } from '../../data/app'
import { isBackendError, type RecoveryPeek } from '../../data/backend'
import type { ID } from '../../data/types'
import { setLang, useCopy, useLang, useT, type Lang } from '../../i18n'
import { Avatar, Button, buzz, Card, cx, Field, Segmented, toast, Toggle } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { defaultDraft, extrasOf, isReady, toProfileInput, type ProfileDraft } from '../profile/draft'
import { focusNameField, ProfileForm } from '../profile/ProfileForm'
import { CodeField } from './CodeField'
import { cleanCode, groupCode, INVITE_LENGTH, invitePath, KEY_LENGTH } from './codes'
import { pairingCopy } from './copy'
import { errorCopy, explain } from './errors'
import { applyParkedProfile, keepKey, oweKey, parkProfile, setStarting } from './handoff'
import { BusyScreen, ErrorNote, StepPage } from './parts'

type Busy = 'start' | 'join' | 'restore' | 'recover'
type Problem = { at: 'start' | 'code' | 'recover'; message: string }

/**
 * Taking over an existing seat needs a login that holds no seat yet. A phone whose
 * storage was cleared can still carry its old login; in that case sign out and try once more.
 */
async function withFreshLogin<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (e) {
    if (!isBackendError(e) || e.code !== 'already_in_kitchen') throw e
    await backend.signOut()
    return attempt()
  }
}

export function Onboarding({ route, lockedOut }: { route: Route; lockedOut: boolean }) {
  const c = useCopy(pairingCopy)
  const errors = useCopy(errorCopy)
  const { path, query } = route
  const linkCode = cleanCode(query.get('code') ?? '', INVITE_LENGTH)
  const linkRestore = query.get('restore') === '1'

  const [draft, setDraft] = useState<ProfileDraft>(() => defaultDraft(path === '/join' ? 'taster' : 'chef'))
  const [touched, setTouched] = useState(false)
  const [kitchenName, setKitchenName] = useState('')
  const [code, setCode] = useState(linkCode)
  const [restore, setRestore] = useState(linkRestore || lockedOut)
  const [recoveryKey, setRecoveryKey] = useState('')
  const [peek, setPeek] = useState<RecoveryPeek | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)

  // An invite link opened while the app is already showing: take its code over,
  // and forget what was wrong with the code before it.
  useEffect(() => {
    if (path !== '/join' || !linkCode) return
    setCode(linkCode)
    setProblem(null)
    if (linkRestore) setRestore(true)
  }, [path, linkCode, linkRestore])

  useEffect(() => {
    if (lockedOut) setRestore(true)
  }, [lockedOut])

  // Back on the first screen, old complaints are forgotten.
  useEffect(() => {
    if (path === '/') setProblem(null)
  }, [path])

  const edit = (patch: Partial<ProfileDraft>) => {
    setTouched(true)
    setDraft((was) => ({ ...was, ...patch }))
  }

  /** Open a step. Until something was typed, the profile starts out as that step's usual role. */
  const open = (to: string, role?: 'chef' | 'taster') => {
    if (role && !touched) setDraft(defaultDraft(role))
    setProblem(null)
    navigate(to)
  }

  const fail = (at: Problem['at'], e: unknown, backTo: string) => {
    parkProfile(null)
    setBusy(null)
    setProblem({ at, message: explain(e, errors) })
    navigate(backTo, { replace: true })
  }

  const start = async () => {
    if (!isReady(draft)) {
      focusNameField()
      return setProblem({ at: 'start', message: c.nameMissing })
    }
    setProblem(null)
    setBusy('start')
    setStarting(true)
    oweKey(true)
    parkProfile(extrasOf(draft))
    // Where the app opens once the kitchen exists: the recovery key, then the invite.
    navigate('/settings/welcome', { replace: true })
    try {
      keepKey(await startKitchen(kitchenName.trim() || c.start.defaultKitchen, toProfileInput(draft)))
      await applyParkedProfile()
      setStarting(false)
    } catch (e) {
      setStarting(false)
      oweKey(false)
      // The kitchen may exist already: the first try reached the cloud but its answer got lost.
      // The recovery key from that try is gone, so go straight to making a new one.
      if (isBackendError(e) && e.code === 'already_in_kitchen' && (await resumeKitchen().catch(() => false))) {
        await applyParkedProfile().catch(() => undefined)
        setBusy(null)
        navigate('/settings/key', { replace: true })
        return
      }
      fail('start', e, '/start')
    }
  }

  const join = async (joinCode: string, asRestore: boolean) => {
    if (joinCode.length < INVITE_LENGTH) return setProblem({ at: 'code', message: c.code.tooShort })
    if (!asRestore && !isReady(draft)) {
      focusNameField()
      return setProblem({ at: 'code', message: c.nameMissing })
    }
    setProblem(null)
    setBusy(asRestore ? 'restore' : 'join')
    parkProfile(asRestore ? null : extrasOf(draft))
    navigate('/', { replace: true })
    try {
      const attempt = () => joinKitchen(joinCode, asRestore ? { name: '' } : toProfileInput(draft))
      const kind = await (asRestore ? withFreshLogin(attempt) : attempt())
      if (kind === 'restore') {
        // The profile already exists and came along. Nothing typed here may overwrite it.
        parkProfile(null)
        toast(c.done.restored)
      } else if (asRestore) {
        // It was an ordinary invite after all: a new seat, so the profile still needs making.
        navigate('/settings/profile', { replace: true })
        toast(c.done.joinedFinishProfile)
      } else {
        await applyParkedProfile()
        toast(c.done.joined)
      }
      buzz([12, 40, 12])
    } catch (e) {
      fail('code', e, '/join')
    }
  }

  const findKitchen = async () => {
    if (recoveryKey.length < KEY_LENGTH) return setProblem({ at: 'recover', message: c.recover.tooShort })
    setProblem(null)
    setBusy('recover')
    try {
      setPeek(await backend.recoveryPeek(recoveryKey))
    } catch (e) {
      setProblem({ at: 'recover', message: explain(e, errors) })
    }
    setBusy(null)
  }

  const recover = async (memberId: ID) => {
    setProblem(null)
    setBusy('recover')
    parkProfile(null)
    navigate('/', { replace: true })
    try {
      await withFreshLogin(() => recoverKitchen(recoveryKey, memberId))
      toast(c.done.recovered)
      buzz([12, 40, 12])
    } catch (e) {
      if (isBackendError(e) && e.code === 'recovery_key_invalid') setPeek(null)
      fail('recover', e, '/recover')
    }
  }

  let screen
  if (busy) {
    screen = <BusyScreen label={c.busy[busy]} />
  } else if (path === '/join' && linkCode.length === INVITE_LENGTH && !restore) {
    screen = (
      <JoinStep draft={draft} onEdit={edit} code={linkCode} problem={problem?.at === 'code' ? problem.message : null} onSubmit={() => void join(linkCode, false)} />
    )
  } else if (path === '/join') {
    screen = (
      <CodeStep
        code={code}
        restore={restore}
        problem={problem?.at === 'code' ? problem.message : null}
        onCode={(next, meta) => {
          setCode(next)
          if (meta.restore) setRestore(true)
          setProblem(null)
        }}
        onRestore={setRestore}
        onSubmit={() => {
          if (restore) return void join(code, true)
          if (code.length < INVITE_LENGTH) return setProblem({ at: 'code', message: c.code.tooShort })
          setProblem(null)
          if (!touched) setDraft(defaultDraft('taster'))
          navigate(invitePath(code, false))
        }}
      />
    )
  } else if (path === '/recover') {
    screen = (
      <RecoverStep
        recoveryKey={recoveryKey}
        peek={peek}
        problem={problem?.at === 'recover' ? problem.message : null}
        onKey={(next) => {
          setRecoveryKey(next)
          setProblem(null)
        }}
        onFind={() => void findKitchen()}
        onRecover={(id) => void recover(id)}
        onOtherKey={() => {
          setPeek(null)
          setProblem(null)
        }}
      />
    )
  } else if (lockedOut) {
    screen = <LockedOut onRestore={() => open('/join')} onKey={() => open('/recover')} />
  } else if (path === '/start') {
    screen = (
      <StartStep
        draft={draft}
        onEdit={edit}
        kitchenName={kitchenName}
        onKitchenName={setKitchenName}
        problem={problem?.at === 'start' ? problem.message : null}
        onSubmit={() => void start()}
      />
    )
  } else {
    screen = <Welcome onStart={() => open('/start', 'chef')} onInvite={() => open('/join', 'taster')} onKey={() => open('/recover')} />
  }

  return <MotionConfig reducedMotion="user">{screen}</MotionConfig>
}

// ------------------------------------------------------------------ welcome --

function Wordmark() {
  const t = useT()
  return (
    <>
      <h1 className="mt-3 font-display text-[2.6rem] font-bold leading-none tracking-tight font-soft" aria-label={t.brand.name}>
        Food<span className="font-semibold italic text-cherry">wish</span>
        <span className="text-rose-ink">Us</span>
      </h1>
      <p className="mt-1 font-script text-3xl text-rose-ink">{t.brand.slogan}</p>
    </>
  )
}

function Welcome({ onStart, onInvite, onKey }: { onStart: () => void; onInvite: () => void; onKey: () => void }) {
  const c = useCopy(pairingCopy)
  const t = useT()
  const lang = useLang()
  return (
    <div className="gingham flex min-h-dvh flex-col bg-ground" data-testid="welcome">
      <header className="scallop-bottom bg-blush [--scallop:12px]">
        <div className="app-column flex flex-col items-center px-5 pb-6 pt-[max(2.75rem,env(safe-area-inset-top))] text-center">
          <Mascot size={148} mood="love" />
          <Wordmark />
        </div>
      </header>
      <main className="app-column flex flex-1 flex-col px-5 pb-8 pt-7">
        <p className="mx-auto max-w-[30ch] text-balance text-center text-base text-ink-soft">{c.welcome.lead}</p>
        <div className="mt-7 flex flex-col gap-3.5">
          <Button size="lg" block onClick={onStart}>
            {c.welcome.start}
          </Button>
          <Button variant="secondary" block onClick={onInvite}>
            {c.welcome.invite}
          </Button>
          <Button variant="secondary" block onClick={onKey}>
            {c.welcome.key}
          </Button>
        </div>
        <div className="mt-auto flex flex-col items-center gap-3 pt-8">
          <Button variant="quiet" onClick={enterDemo}>
            {t.demo.enter}
          </Button>
          <div className="w-52">
            <Segmented<Lang>
              label={c.welcome.language}
              value={lang}
              options={[
                { value: 'en', label: 'English' },
                { value: 'de', label: 'Deutsch' },
              ]}
              onChange={setLang}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------- signed out --

function LockedOut({ onRestore, onKey }: { onRestore: () => void; onKey: () => void }) {
  const c = useCopy(pairingCopy)
  return (
    <div className="gingham flex min-h-dvh flex-col bg-ground" data-testid="locked-out">
      <main className="app-column flex flex-1 flex-col items-center px-6 pb-8 pt-[max(3.5rem,env(safe-area-inset-top))] text-center">
        <Mascot size={124} mood="sleepy" />
        <h1 className="mt-5 text-2xl">{c.lockedOut.title}</h1>
        <p className="mt-2 text-balance font-script text-[1.7rem] leading-tight text-rose-ink">{c.lockedOut.script}</p>
        <p className="mt-4 text-pretty text-sm text-ink-soft">{c.lockedOut.body}</p>
        <div className="mt-7 flex w-full flex-col gap-3.5">
          <Button size="lg" block onClick={onRestore}>
            {c.lockedOut.restore}
          </Button>
          <Button variant="secondary" block onClick={onKey}>
            {c.lockedOut.key}
          </Button>
        </div>
        <p className="mt-6 text-balance text-xs text-ink-soft">{c.lockedOut.hint}</p>
      </main>
    </div>
  )
}

// --------------------------------------------------------- profile + start --

interface StartProps {
  draft: ProfileDraft
  onEdit: (patch: Partial<ProfileDraft>) => void
  kitchenName: string
  onKitchenName: (name: string) => void
  problem: string | null
  onSubmit: () => void
}

function StartStep({ draft, onEdit, kitchenName, onKitchenName, problem, onSubmit }: StartProps) {
  const c = useCopy(pairingCopy)
  return (
    <StepPage
      title={c.start.title}
      footer={
        <>
          {problem && <ErrorNote>{problem}</ErrorNote>}
          <Button size="lg" block onClick={onSubmit}>
            {c.start.submit}
          </Button>
        </>
      }
    >
      <p className="px-4 text-base text-ink-soft">{c.start.lead}</p>
      <div className="mt-5">
        <ProfileForm draft={draft} onChange={onEdit} />
      </div>
      <section className="mt-8 px-4">
        <Field
          label={c.start.kitchenLabel}
          placeholder={c.start.kitchenPlaceholder}
          hint={c.start.kitchenHint}
          value={kitchenName}
          maxLength={80}
          enterKeyHint="done"
          onChange={(e) => onKitchenName(e.target.value)}
        />
      </section>
    </StepPage>
  )
}

// ---------------------------------------------------------- profile + join --

interface JoinProps {
  draft: ProfileDraft
  onEdit: (patch: Partial<ProfileDraft>) => void
  code: string
  problem: string | null
  onSubmit: () => void
}

function JoinStep({ draft, onEdit, code, problem, onSubmit }: JoinProps) {
  const c = useCopy(pairingCopy)
  return (
    <StepPage
      title={c.join.title}
      footer={
        <>
          {problem && <ErrorNote>{problem}</ErrorNote>}
          <Button size="lg" block onClick={onSubmit}>
            {c.join.submit}
          </Button>
        </>
      }
    >
      <p className="px-4 text-base text-ink-soft">{c.join.lead}</p>
      <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-card border border-line bg-surface py-1.5 pl-4 pr-1.5">
        <div className="min-w-0">
          <p className="text-2xs font-extrabold text-ink-soft">{c.join.codeTag}</p>
          <p className="tabular text-sm font-extrabold tracking-[0.08em]" data-testid="join-code">
            {groupCode(code)}
          </p>
        </div>
        <Button variant="quiet" onClick={() => navigate('/join', { replace: true })}>
          {c.join.change}
        </Button>
      </div>
      <div className="mt-6">
        <ProfileForm draft={draft} onChange={onEdit} />
      </div>
    </StepPage>
  )
}

// ------------------------------------------------------------- code entry --

interface CodeProps {
  code: string
  restore: boolean
  problem: string | null
  onCode: (code: string, meta: { restore: boolean }) => void
  onRestore: (restore: boolean) => void
  onSubmit: () => void
}

function CodeStep({ code, restore, problem, onCode, onRestore, onSubmit }: CodeProps) {
  const c = useCopy(pairingCopy)
  return (
    <StepPage
      title={restore ? c.lockedOut.restore : c.code.title}
      footer={
        <Button size="lg" block onClick={onSubmit}>
          {restore ? c.code.restoreSubmit : c.code.next}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 px-4">
        <p className="text-base text-ink-soft">{restore ? c.code.restoreLead : c.code.lead}</p>
        <CodeField
          label={restore ? c.restoreInvite.codeLabel : c.code.label}
          placeholder={c.code.placeholder}
          hint={c.code.hint}
          value={code}
          length={INVITE_LENGTH}
          acceptLinks
          onChange={onCode}
          onEnter={onSubmit}
        />
        {problem && <ErrorNote>{problem}</ErrorNote>}
        <Card pad={false} className="px-4 pb-3.5 pt-1">
          <Toggle label={c.code.restoreToggle} checked={restore} onChange={onRestore} />
          <p className="text-xs text-ink-soft">{c.code.restoreHint}</p>
        </Card>
      </div>
    </StepPage>
  )
}

// ------------------------------------------------------------ recovery key --

interface RecoverProps {
  recoveryKey: string
  peek: RecoveryPeek | null
  problem: string | null
  onKey: (key: string) => void
  onFind: () => void
  onRecover: (memberId: ID) => void
  onOtherKey: () => void
}

function RecoverStep({ recoveryKey, peek, problem, onKey, onFind, onRecover, onOtherKey }: RecoverProps) {
  const c = useCopy(pairingCopy)
  const [who, setWho] = useState<ID | null>(null)
  const chosen = peek?.members.find((m) => m.id === who)

  if (!peek) {
    return (
      <StepPage
        title={c.recover.title}
        footer={
          <Button size="lg" block onClick={onFind}>
            {c.recover.find}
          </Button>
        }
      >
        <div className="flex flex-col gap-5 px-4">
          <p className="text-base text-ink-soft">{c.recover.lead}</p>
          <CodeField label={c.recover.label} placeholder={c.recover.placeholder} value={recoveryKey} length={KEY_LENGTH} onChange={(next) => onKey(next)} onEnter={onFind} />
          {problem && <ErrorNote>{problem}</ErrorNote>}
        </div>
      </StepPage>
    )
  }

  return (
    <StepPage
      title={c.recover.title}
      footer={
        <>
          {problem && <ErrorNote>{problem}</ErrorNote>}
          <Button size="lg" block disabled={!chosen} onClick={() => chosen && onRecover(chosen.id)}>
            {chosen ? c.recover.letIn(chosen.name) : c.recover.pickFirst}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-4">
        <div>
          <h2 className="text-xl">{c.recover.whoTitle}</h2>
          <p className="mt-1.5 text-sm text-ink-soft">{c.recover.whoLead}</p>
        </div>
        <div role="radiogroup" aria-label={c.recover.whoTitle} className="flex flex-col gap-3">
          {peek.members.map((member) => {
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
                <Avatar avatar={member.avatar} color={member.color} size={56} />
                <span className="min-w-0 flex-1 truncate font-display text-lg font-bold font-soft">{member.name}</span>
                <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border-[1.5px]', on ? 'border-ink bg-ink text-ground' : 'border-line-strong text-transparent')} aria-hidden>
                  <Icon name="check" size={16} />
                </span>
              </button>
            )
          })}
        </div>
        <Button variant="quiet" className="-ml-3 self-start" onClick={onOtherKey}>
          {c.recover.otherKey}
        </Button>
      </div>
    </StepPage>
  )
}
