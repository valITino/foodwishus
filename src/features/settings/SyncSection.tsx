// The Sync section of Settings: where things stand, in words and numbers, plus
// "Sync now" and a report to copy when something needs looking at.

import { useState } from 'react'
import { version } from '../../../package.json'
import { backend, db, isDemo, sync, useSyncStatus } from '../../data/app'
import { useMe } from '../../data/hooks'
import { useMembers } from '../../data/queries'
import { useCopy, useLang, useT } from '../../i18n'
import { formatTime, relativeDay, toDay } from '../../lib/dates'
import { Button, Card, SyncPill, toast } from '../../ui/components'
import { useTheme } from '../../ui/theme'
import { copyText } from '../onboarding/parts'
import { settingsCopy } from './copy'
import { syncReport } from './syncReport'

function Fact({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="tabular text-right text-sm font-extrabold" data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}

export function SyncSection() {
  const c = useCopy(settingsCopy)
  const t = useT()
  const lang = useLang()
  const theme = useTheme()
  const status = useSyncStatus()
  const me = useMe()
  const members = useMembers()
  const [working, setWorking] = useState(false)

  const lastSync = status.lastSyncAt ? `${relativeDay(toDay(status.lastSyncAt), lang, t.common)}, ${formatTime(status.lastSyncAt, lang)}` : c.sync.never

  const syncNow = async () => {
    setWorking(true)
    await sync.sync()
    setWorking(false)
    const { state } = sync.status
    if (state === 'idle') toast(c.sync.synced)
    else toast(state === 'offline' ? c.sync.stillOffline : c.sync.syncFailed, 'oops')
  }

  const copyDetails = async () => {
    const refused = await db.deadLetters.toArray()
    const report = syncReport({
      version,
      backend: backend.name,
      now: new Date().toISOString(),
      status: sync.status,
      online: navigator.onLine,
      demo: isDemo,
      lang,
      theme,
      members: members?.length ?? 0,
      householdId: me?.householdId,
      memberId: me?.memberId,
      userAgent: navigator.userAgent,
      refused: refused.map((r) => ({ table: r.table, kind: r.kind, lastError: r.lastError, failedAt: r.failedAt })),
    })
    const ok = await copyText(report)
    toast(ok ? t.common.copied : t.common.somethingWrong, ok ? 'ok' : 'oops')
  }

  return (
    <section aria-labelledby="sync-title">
      <h2 id="sync-title" className="mb-2.5 px-1 text-lg">
        {c.sync.title}
      </h2>
      <Card pad={false} className="px-4 pb-4 pt-3.5" data-testid="sync-section">
        {isDemo ? (
          <p className="text-sm text-ink-soft">{c.sync.demo}</p>
        ) : (
          <>
            <SyncPill status={status} />
            <p className="mt-2.5 text-sm" data-testid="sync-words">
              {c.sync.states[status.state]}
            </p>
            <dl className="mt-2 divide-y divide-line border-y border-line">
              <Fact label={c.sync.lastSync} value={lastSync} testId="sync-last" />
              <Fact label={c.sync.waiting} value={status.pending} testId="sync-pending" />
              <Fact label={c.sync.photos} value={status.uploads} />
              <Fact label={c.sync.refused} value={status.stuck} />
            </dl>
            {status.stuck > 0 && <p className="mt-2.5 text-xs leading-snug text-ink-soft">{c.sync.refusedHint}</p>}
            {status.lastError && (
              <div className="mt-3 rounded-field border border-line bg-ground px-3 py-2.5">
                <p className="text-2xs font-extrabold text-ink-soft">{c.sync.lastError}</p>
                <p className="mt-0.5 break-words text-xs font-semibold leading-snug">{status.lastError}</p>
              </div>
            )}
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <Button variant="secondary" block disabled={working} onClick={() => void syncNow()}>
                {c.sync.syncNow}
              </Button>
              <Button variant="quiet" onClick={() => void copyDetails()}>
                {c.sync.copyDetails}
              </Button>
            </div>
          </>
        )}
      </Card>
    </section>
  )
}
