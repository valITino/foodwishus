// The Settings page: my profile, our kitchen and its people, my own settings (they follow
// me to every device), log-in, sync, the demo kitchen and a little "about".

import { useState, type ReactNode } from 'react'
import { version } from '../../../package.json'
import { navigate } from '../../app/router'
import { renameKitchen } from '../../data/actions'
import { enterDemo, isDemo, leaveDemo } from '../../data/app'
import { useMe } from '../../data/hooks'
import { setPref, usePref } from '../../data/prefs'
import { useHousehold, usePartner } from '../../data/queries'
import { setLang, useCopy, useLang, useT, type Lang } from '../../i18n'
import { Avatar, Button, buzz, Card, Field, PageHeader, Screen, Segmented, Sheet, SteamLoader, Tag, toast, Toggle } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { setTheme, useTheme } from '../../ui/theme'
import { ErrorNote } from '../onboarding/parts'
import { ProfileBubble } from '../profile/ProfileBubble'
import { settingsCopy } from './copy'
import { SyncSection } from './SyncSection'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="mb-2.5 px-1 text-lg">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** A row that opens another page. */
function LinkRow({ title, hint, onClick }: { title: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-blush/40">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{hint}</span>}
      </span>
      <Icon name="next" size={20} className="shrink-0 text-ink-soft" />
    </button>
  )
}

function RenameSheet({ open, current, onClose }: { open: boolean; current: string; onClose: () => void }) {
  const c = useCopy(settingsCopy)
  const t = useT()
  const [name, setName] = useState(current)
  const [problem, setProblem] = useState(false)

  const save = async () => {
    if (!name.trim()) return setProblem(true)
    if (name.trim() !== current) await renameKitchen(name)
    toast(t.common.saved)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.kitchen.renameTitle}
      footer={
        <Button block size="lg" onClick={() => void save()}>
          {c.kitchen.saveName}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 pb-1">
        <Field
          label={c.kitchen.nameLabel}
          value={name}
          maxLength={80}
          enterKeyHint="done"
          onChange={(e) => {
            setName(e.target.value)
            setProblem(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
        />
        {problem && <ErrorNote>{c.kitchen.nameMissing}</ErrorNote>}
      </div>
    </Sheet>
  )
}

export function SettingsHome() {
  const c = useCopy(settingsCopy)
  const t = useT()
  const me = useMe()
  const partner = usePartner()
  const household = useHousehold()
  const lang = useLang()
  const theme = useTheme()
  // What is on screen right now: the phone's own setting while "follow phone" is on.
  const showing = theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
  const showCalories = usePref('showCalories')
  const [renaming, setRenaming] = useState(false)
  const member = me?.member

  return (
    <Screen>
      <PageHeader title={c.title} backTo="/" />
      <main className="app-column flex flex-col gap-8 px-4 pt-5">
        {/* My profile */}
        {member ? (
          <button
            type="button"
            data-testid="my-profile"
            onClick={() => navigate('/settings/profile')}
            className="flex w-full items-center gap-4 rounded-card border border-line bg-surface p-4 pt-5 text-left active:translate-y-[2px]"
          >
            <Avatar avatar={member.avatar} color={member.color} accessory={member.accessory} size={68} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-display text-xl font-bold leading-tight font-soft">{member.name}</span>
                <Tag tone={member.defaultRole === 'chef' ? 'butter' : 'sage'}>{t.roles[member.defaultRole]}</Tag>
              </span>
              <span className={member.status ? 'mt-1 block break-words text-sm font-bold leading-snug' : 'mt-1 block text-sm leading-snug text-ink-soft'} data-testid="my-status">
                {member.status || c.profile.noStatus}
              </span>
            </span>
            {/* Read aloud after the name and status, so what is seen is also what is said. */}
            <span className="sr-only">{c.profile.edit}</span>
            <Icon name="next" size={20} className="shrink-0 text-ink-soft" />
          </button>
        ) : (
          <Card>
            <SteamLoader />
          </Card>
        )}

        {/* Our kitchen */}
        <Section id="kitchen" title={c.kitchen.title}>
          <div className="flex flex-col gap-3">
            {partner ? (
              <Card data-testid="partner-card">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <p className="text-2xs font-extrabold text-ink-soft">{c.kitchen.partnerLabel}</p>
                  <Tag tone={partner.defaultRole === 'chef' ? 'butter' : 'sage'}>{t.roles[partner.defaultRole]}</Tag>
                </div>
                <ProfileBubble
                  name={partner.name}
                  status={partner.status ?? ''}
                  placeholder={c.kitchen.partnerNoStatus}
                  avatar={partner.avatar}
                  color={partner.color}
                  accessory={partner.accessory}
                />
              </Card>
            ) : partner === null ? (
              <Card pad={false} className="flex items-center gap-3 p-4" data-testid="alone-card">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base">{c.kitchen.aloneTitle}</h3>
                  <p className="mt-1 text-xs leading-snug text-ink-soft">{isDemo ? c.kitchen.demoNote : c.kitchen.aloneBody}</p>
                  {!isDemo && member?.isAdmin && (
                    <Button variant="secondary" className="mt-3" onClick={() => navigate('/settings/invite')}>
                      {c.kitchen.invite}
                    </Button>
                  )}
                </div>
                <Mascot size={64} mood="sleepy" className="shrink-0" />
              </Card>
            ) : null}

            <Card pad={false} className="divide-y divide-line overflow-hidden">
              <button type="button" onClick={() => setRenaming(true)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-blush/40">
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs font-extrabold text-ink-soft">{c.kitchen.nameLabel}</span>
                  <span className="block truncate text-sm font-bold" data-testid="kitchen-name">
                    {household?.name ?? ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-extrabold text-rose-ink">{c.kitchen.rename}</span>
              </button>
              {!isDemo && <LinkRow title={c.kitchen.people} hint={member?.isAdmin ? c.kitchen.peopleHintAdmin : c.kitchen.peopleHint} onClick={() => navigate('/settings/people')} />}
              <LinkRow title={c.kitchen.criteria} hint={c.kitchen.criteriaHint} onClick={() => navigate('/settings/criteria')} />
              <LinkRow title={c.kitchen.backup} hint={c.kitchen.backupHint} onClick={() => navigate('/settings/backup')} />
            </Card>
            {isDemo && partner && <p className="px-1 text-xs text-ink-soft">{c.kitchen.demoNote}</p>}
          </div>
        </Section>

        {/* My settings: they live on the profile and follow the person */}
        <Section id="mine" title={c.mine.title}>
          {!isDemo && <p className="-mt-1 mb-2.5 px-1 text-xs text-ink-soft">{c.mine.follow}</p>}
          <Card pad={false} className="divide-y divide-line px-4">
            <div className="py-3.5">
              <p className="mb-2 text-sm font-bold">{c.mine.language}</p>
              <Segmented<Lang>
                label={c.mine.language}
                value={lang}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'Deutsch' },
                ]}
                onChange={(next) => {
                  buzz(8)
                  setLang(next)
                }}
              />
            </div>
            {/* Three choices: light, candlelight, or whatever the phone is set to. */}
            <div className="pb-1 pt-3.5">
              <p className="mb-2 text-sm font-bold">{c.mine.theme}</p>
              <Segmented<'light' | 'dark'>
                label={c.mine.theme}
                value={showing}
                options={[
                  { value: 'light', label: c.mine.light },
                  { value: 'dark', label: c.mine.candle },
                ]}
                onChange={(next) => {
                  buzz(8)
                  setTheme(next)
                }}
              />
              <Toggle label={c.mine.auto} checked={theme === 'auto'} onChange={(on) => setTheme(on ? 'auto' : showing)} />
            </div>
            <div className="py-1">
              <Toggle label={c.mine.calories} checked={showCalories} onChange={(on) => setPref('showCalories', on)} />
            </div>
          </Card>
        </Section>

        {!isDemo && (
          <Section id="access" title={c.access.title}>
            <Card pad={false} className="overflow-hidden">
              <LinkRow title={c.access.pin} hint={c.access.pinHint} onClick={() => navigate('/settings/pin')} />
            </Card>
          </Section>
        )}

        <SyncSection />

        {/* Demo kitchen */}
        <Section id="demo" title={c.demo.title}>
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink-soft">{isDemo ? c.demo.inside : c.demo.body}</p>
            {isDemo ? (
              <Button variant="secondary" onClick={() => void leaveDemo()}>
                {c.demo.leave}
              </Button>
            ) : (
              <Button variant="secondary" onClick={enterDemo}>
                {c.demo.enter}
              </Button>
            )}
          </Card>
        </Section>

        {/* About */}
        <Section id="about" title={c.about.title}>
          <Card pad={false} className="flex items-center gap-4 px-4 py-4">
            <Mascot size={56} mood="happy" className="shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-xl font-bold leading-none font-soft">{t.brand.name}</p>
              <p className="mt-1 font-script text-2xl leading-none text-rose-ink">{t.brand.slogan}</p>
              <p className="mt-1.5 text-xs font-bold text-ink-soft" data-testid="app-version">
                {c.about.version(version)}
              </p>
            </div>
          </Card>
        </Section>
      </main>

      {household && <RenameSheet key={household.name} open={renaming} current={household.name} onClose={() => setRenaming(false)} />}
    </Screen>
  )
}
