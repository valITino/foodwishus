// The first screen on a device nobody is logged in on: logo, slogan, language, then
// three doors (start from scratch, I have a code, look around first) and the quiet way
// back in for someone who has been here before.

import { useEffect, useRef } from 'react'
import { setLang, useCopy, useLang, useT, type Lang } from '../../i18n'
import { Button, Segmented } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { pairingCopy } from './copy'
import { WarningNote } from './parts'

interface Props {
  /** True while we ask the cloud whether a kitchen exists already. */
  checking: boolean
  /** Why "Start from scratch" did not go on, if it did not. */
  problem: string | null
  onStart: () => void
  onCode: () => void
  onDemo: () => void
  onLogin: () => void
}

export function Welcome({ checking, problem, onStart, onCode, onDemo, onLogin }: Props) {
  const c = useCopy(pairingCopy)
  const t = useT()
  const lang = useLang()
  const hint = 'mx-auto mt-1.5 max-w-[40ch] text-balance text-center text-xs leading-snug text-ink-soft'

  // The note names two ways on: the code door right below it and the way back in at the
  // bottom. On a short screen the note pushes that one out of view, so bring it back.
  const wayBack = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!problem) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    wayBack.current?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' })
  }, [problem])

  return (
    <div className="gingham flex min-h-dvh flex-col bg-ground" data-testid="welcome">
      <header className="scallop-bottom bg-blush [--scallop:12px]">
        <div className="app-column flex flex-col items-center px-5 pb-5 pt-[max(2rem,env(safe-area-inset-top))] text-center">
          {/* A little smaller on short screens, so the way back in stays in view. */}
          <Mascot size={120} mood="love" className="h-36 w-auto [@media(max-height:780px)]:h-24" />
          <h1 className="mt-2 font-display text-[2.6rem] font-bold leading-none tracking-tight font-soft" aria-label={t.brand.name}>
            Food<span className="font-semibold italic text-cherry">wish</span>
            <span className="text-rose-ink">Us</span>
          </h1>
          <p className="mt-1 font-script text-3xl text-rose-ink">{t.brand.slogan}</p>
          <div className="mt-4 w-52 [@media(max-height:780px)]:mt-3">
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
      </header>

      <main className="app-column flex flex-1 flex-col px-5 pb-6 pt-6 [@media(max-height:780px)]:pb-3 [@media(max-height:780px)]:pt-4">
        <div className="flex flex-col gap-4 [@media(max-height:780px)]:gap-3">
          <div>
            <Button size="lg" block disabled={checking} onClick={onStart}>
              {checking ? c.welcome.checking : c.welcome.start}
            </Button>
            <p className={hint}>{c.welcome.startHint}</p>
          </div>
          {problem && (
            <div data-testid="welcome-note">
              <WarningNote>{problem}</WarningNote>
            </div>
          )}
          <div>
            <Button variant="secondary" block onClick={onCode}>
              {c.welcome.code}
            </Button>
            <p className={hint}>{c.welcome.codeHint}</p>
          </div>
          <div>
            <Button variant="secondary" block onClick={onDemo}>
              {c.welcome.demo}
            </Button>
            <p className={hint}>{c.welcome.demoHint}</p>
          </div>
        </div>
        <div ref={wayBack} className="mt-auto flex scroll-mb-3 flex-wrap items-center justify-center gap-x-1 pt-5 [@media(max-height:780px)]:pt-2">
          <span className="text-sm text-ink-soft">{c.welcome.beenHere}</span>
          <Button variant="quiet" onClick={onLogin}>
            {c.welcome.login}
          </Button>
        </div>
      </main>
    </div>
  )
}
