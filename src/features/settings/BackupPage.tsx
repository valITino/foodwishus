// "Backup": save everything in the kitchen as one file, and bring such a file back.
// Importing first shows what the file holds and what will happen, and asks.

import { useRef, useState, type ReactNode } from 'react'
import { BackupError, exportBackup, importBackup, openBackup, type ExportResult, type ImportResult, type OpenedBackup } from '../../data/actions'
import { isDemo } from '../../data/app'
import type { TableCount } from '../../data/backup'
import { useLastBackupAt, usePartner } from '../../data/queries'
import { useCopy, useLang } from '../../i18n'
import { formatDay, toDay } from '../../lib/dates'
import { Button, buzz, Card, Sheet, toast, Toggle } from '../../ui/components'
import { Cloche } from '../../ui/deco/Deco'
import { ErrorNote, StepPage, WarningNote } from '../onboarding/parts'
import { backupCopy } from './backupCopy'

/** Hand a file to the browser, which puts it with the device's downloads. */
function download(file: Blob, name: string): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Not at once: the browser needs a moment to start reading the file.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const asShareable = (result: ExportResult): File => new File([result.file], result.name, { type: 'application/zip' })

function canShare(result: ExportResult): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [asShareable(result)] })
  } catch {
    return false
  }
}

function Fact({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-right">
        <span className="tabular text-sm font-extrabold">{value}</span>
        {note && <span className="block text-xs text-ink-soft">{note}</span>}
      </dd>
    </div>
  )
}

/** One line of "what will happen". */
function Line({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-rose-ink" />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

const total = (counts: Record<string, TableCount>, key: keyof TableCount): number => Object.values(counts).reduce((sum, count) => sum + count[key], 0)

function PreviewSheet({ opened, open, working, progress, onConfirm, onClose }: { opened: OpenedBackup; open: boolean; working: boolean; progress: [number, number] | null; onConfirm: () => void; onClose: () => void }) {
  const c = useCopy(backupCopy)
  const lang = useLang()
  const partner = usePartner()
  const { summary, plan } = opened
  const nothing = plan.writes.length === 0 && plan.settings === null
  const date = (day: string) => formatDay(day, lang, 'date-year')
  const [add, keep, back, update] = [total(plan.counts, 'add'), total(plan.counts, 'keep'), total(plan.counts, 'back'), total(plan.counts, 'update')]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.preview.title}
      footer={
        nothing ? (
          <Button block size="lg" variant="secondary" onClick={onClose}>
            {c.preview.close}
          </Button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Button block size="lg" disabled={working} onClick={onConfirm}>
              {working && progress ? c.preview.importing(progress[0], progress[1]) : c.preview.confirm}
            </Button>
            <Button variant="quiet" block disabled={working} onClick={onClose}>
              {c.preview.cancel}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 pb-1" data-testid="backup-preview">
        <p className="text-sm leading-relaxed">{c.preview.from(summary.kitchenName, date(toDay(summary.madeAt)))}</p>
        {/* First thing on the sheet: it changes what the person should do before importing. */}
        {plan.strangers.length > 0 && <WarningNote>{c.preview.strangers(plan.strangers)}</WarningNote>}
        <section aria-labelledby="backup-in-file">
          <h3 id="backup-in-file" className="text-base">
            {c.preview.inFile}
          </h3>
          <dl className="mt-1 divide-y divide-line border-y border-line">
            <Fact label={c.preview.dishes} value={summary.dishes} />
            <Fact label={c.preview.menus} value={summary.menus} />
            <Fact label={c.preview.meals} value={summary.meals} note={summary.firstMeal && summary.lastMeal ? c.preview.span(date(summary.firstMeal), date(summary.lastMeal)) : undefined} />
            <Fact label={c.preview.wishes} value={summary.wishes} />
            <Fact label={c.preview.reviews} value={summary.reviews} />
            <Fact label={c.preview.photos} value={summary.withPhotos ? summary.photos : c.preview.noPhotos} />
          </dl>
        </section>
        <section aria-labelledby="backup-happens">
          <h3 id="backup-happens" className="text-base">
            {c.preview.happens}
          </h3>
          {nothing ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft" data-testid="backup-nothing">
              {c.preview.nothing}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm leading-snug text-ink-soft" data-testid="backup-plan">
              {plan.sameKitchen ? null : <Line>{c.preview.otherKitchen}</Line>}
              {add > 0 && <Line>{c.preview.add(add)}</Line>}
              {back > 0 && <Line>{c.preview.back(back)}</Line>}
              {update > 0 && <Line>{c.preview.update(update)}</Line>}
              {keep > 0 && <Line>{c.preview.keep(keep)}</Line>}
              {plan.counts.criteria.add > 0 && <Line>{c.preview.criteria(plan.counts.criteria.add)}</Line>}
              {plan.leftOut > 0 && <Line>{c.preview.leftOut(plan.leftOut)}</Line>}
              <Line>{c.preview.never}</Line>
              {!isDemo && partner && <Line>{c.preview.partner}</Line>}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}

export function BackupPage() {
  const c = useCopy(backupCopy)
  const lang = useLang()
  const partner = usePartner()
  const lastBackupAt = useLastBackupAt()
  const input = useRef<HTMLInputElement>(null)

  const [withPhotos, setWithPhotos] = useState(true)
  const [packing, setPacking] = useState<[number, number] | 'start' | null>(null)
  const [made, setMade] = useState<ExportResult | null>(null)
  const [saveProblem, setSaveProblem] = useState(false)

  const [reading, setReading] = useState(false)
  const [opened, setOpened] = useState<OpenedBackup | null>(null)
  const [asking, setAsking] = useState(false)
  const [importing, setImporting] = useState<[number, number] | null>(null)
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [imported, setImported] = useState<ImportResult | null>(null)

  const save = async () => {
    setPacking('start')
    setSaveProblem(false)
    setMade(null)
    try {
      const result = await exportBackup({ withPhotos, onProgress: (done, all) => setPacking([done, all]) })
      download(result.file, result.name)
      setMade(result)
      buzz(12)
      toast(c.save.saved)
    } catch {
      setSaveProblem(true)
    }
    setPacking(null)
  }

  const share = async () => {
    if (!made) return
    try {
      await navigator.share({ files: [asShareable(made)], title: made.name })
    } catch {
      /* closed without sending: nothing to say */
    }
  }

  const explain = (error: unknown): string => {
    if (error instanceof BackupError) return error.code === 'damaged' ? c.errors.damaged(error.where) : c.errors[error.code]
    return c.errors.other
  }

  const choose = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setProblem(null)
    setImported(null)
    try {
      setOpened(await openBackup(file))
      setAsking(true)
    } catch (error) {
      setProblem(explain(error))
    }
    setReading(false)
    // The same file can be chosen again straight away.
    if (input.current) input.current.value = ''
  }

  const run = async () => {
    if (!opened || working) return
    setWorking(true)
    setImporting([0, opened.plan.writes.length])
    try {
      const result = await importBackup(opened, (done, all) => setImporting([done, all]))
      setImported(result)
      buzz(12)
      toast(c.done.toast)
    } catch {
      setProblem(c.errors.importFailed)
    }
    setAsking(false)
    setWorking(false)
    setImporting(null)
  }

  const importedCount = imported ? Object.values(imported.written).reduce((sum, n) => sum + n, 0) : 0
  const busy = packing !== null

  return (
    <StepPage title={c.title} backTo="/settings">
      <div className="flex flex-col gap-8 px-4" data-testid="backup-page">
        <section aria-labelledby="backup-save-title" className="flex flex-col gap-3.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="backup-save-title" className="text-xl">
                {c.save.title}
              </h2>
              <p className="mt-1.5 text-sm text-ink-soft">{c.save.lead}</p>
            </div>
            <Cloche size={56} className="mt-1 shrink-0" />
          </div>
          {isDemo && <WarningNote>{c.save.demo}</WarningNote>}
          <Card pad={false} className="px-4 py-1.5">
            <Toggle label={c.save.photos} checked={withPhotos} onChange={setWithPhotos} />
            <p className="pb-2.5 text-xs leading-snug text-ink-soft">{withPhotos ? c.save.withPhotos : c.save.withoutPhotos}</p>
          </Card>
          <Button size="lg" block disabled={busy} onClick={() => void save()}>
            {c.save.button}
          </Button>
          <p className="text-center text-xs text-ink-soft" role="status" data-testid="backup-status">
            {packing === 'start'
              ? c.save.packing
              : packing
                ? packing[1] > 0
                  ? c.save.packingPhotos(packing[0], packing[1])
                  : c.save.packing
                : lastBackupAt === undefined
                  ? ''
                  : lastBackupAt
                    ? c.save.last(formatDay(toDay(lastBackupAt), lang, 'date-year'))
                    : c.save.never}
          </p>
          {saveProblem && <ErrorNote>{c.save.failed}</ErrorNote>}
          {made && (
            <Card pad={false} className="flex flex-col items-start gap-2 p-4" data-testid="backup-made">
              <p className="break-words text-sm leading-snug">{c.save.where(made.name)}</p>
              {made.photosSmall > 0 && <p className="text-xs leading-snug text-ink-soft">{c.save.small(made.photosSmall)}</p>}
              {made.photosMissing > 0 && <p className="text-xs leading-snug text-ink-soft">{c.save.missing(made.photosMissing)}</p>}
              {canShare(made) && (
                <Button variant="secondary" onClick={() => void share()}>
                  {c.save.share}
                </Button>
              )}
            </Card>
          )}
        </section>

        <section aria-labelledby="backup-restore-title" className="flex flex-col gap-3.5">
          <div>
            <h2 id="backup-restore-title" className="text-xl">
              {c.restore.title}
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft">{c.restore.lead}</p>
          </div>
          <input ref={input} type="file" hidden accept=".zip,application/zip,application/x-zip-compressed" aria-label={c.restore.fileLabel} data-testid="backup-file" onChange={(event) => void choose(event.target.files?.[0])} />
          <Button variant="secondary" block disabled={reading || working} onClick={() => input.current?.click()}>
            {reading ? c.restore.reading : c.restore.choose}
          </Button>
          {problem && <ErrorNote>{problem}</ErrorNote>}
          {imported && (
            <Card pad={false} className="flex flex-col gap-1.5 p-4" data-testid="backup-imported">
              <p className="text-sm font-bold leading-snug">{c.done.summary(importedCount)}</p>
              {!isDemo && partner && importedCount > 0 && <p className="text-xs leading-snug text-ink-soft">{c.done.syncing}</p>}
              {imported.photosDamaged > 0 && <p className="text-xs leading-snug text-ink-soft">{c.done.damaged(imported.photosDamaged)}</p>}
            </Card>
          )}
        </section>
      </div>

      {opened && <PreviewSheet opened={opened} open={asking} working={working} progress={importing} onConfirm={() => void run()} onClose={() => !working && setAsking(false)} />}
    </StepPage>
  )
}
