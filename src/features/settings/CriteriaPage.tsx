// "Review criteria": what the Taster rates with spoons. Add one, rename it, give it an
// icon, drag it to another place (the grip also works with the keyboard), switch it off
// and on again. A criterion with ratings can only be switched off, never removed.

import { useState } from 'react'
import { ActionError, addCriterion, CRITERION_LABEL_MAX, moveCriterion, removeCriterion, setCriterionActive, updateCriterion } from '../../data/actions'
import { useCriteria, useCriterionUse } from '../../data/queries'
import type { Criterion } from '../../data/types'
import { useCopy, useT } from '../../i18n'
import { Button, buzz, Card, cx, EmptyState, Field, Sheet, SteamLoader, toast, Toggle } from '../../ui/components'
import { CRITERION_ICONS, CriterionIcon, isCriterionIcon, type CriterionIconName } from '../../ui/deco/CriterionIcon'
import { ErrorNote, StepPage } from '../onboarding/parts'
import { DragHandle, SortableList } from '../recipes/Sortable'
import { criteriaCopy } from './criteriaCopy'

/** The sheet for a new criterion (criterion is null) or an existing one. */
function CriterionSheet({ open, criterion, used, onClose }: { open: boolean; criterion: Criterion | null; used: number; onClose: () => void }) {
  const c = useCopy(criteriaCopy)
  const t = useT()
  const [label, setLabel] = useState(criterion?.label ?? '')
  const [icon, setIcon] = useState<CriterionIconName>(criterion && isCriterionIcon(criterion.icon) ? criterion.icon : 'spoon')
  const [problem, setProblem] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const explain = (error: unknown): string => {
    if (error instanceof ActionError) {
      if (error.code === 'criterion_unnamed') return c.errors.unnamed
      if (error.code === 'criterion_twice') return c.errors.twice(label.trim())
      if (error.code === 'criterion_missing') return c.errors.missing
      if (error.code === 'criterion_used') return c.errors.used
    }
    return t.common.somethingWrong
  }

  const run = async (action: () => Promise<unknown>, done: string) => {
    if (working) return
    setWorking(true)
    setProblem(null)
    try {
      await action()
      toast(done)
      onClose()
    } catch (error) {
      setProblem(explain(error))
    }
    setWorking(false)
  }

  const save = () => (criterion ? run(() => updateCriterion(criterion.id, { label, icon }), t.common.saved) : run(() => addCriterion({ label, icon }), c.added))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={criterion ? c.sheet.editTitle : c.sheet.newTitle}
      footer={
        <Button block size="lg" disabled={working} onClick={() => void save()}>
          {criterion ? c.sheet.save : c.sheet.create}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-1" data-testid="criterion-sheet">
        <Field
          label={c.sheet.name}
          value={label}
          maxLength={CRITERION_LABEL_MAX}
          placeholder={criterion ? undefined : c.sheet.placeholder}
          enterKeyHint="done"
          onChange={(event) => {
            setLabel(event.target.value)
            setProblem(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
          }}
        />
        <div>
          <p id="criterion-icon-label" className="mb-2 text-xs font-extrabold">
            {c.sheet.icon}
          </p>
          <div role="radiogroup" aria-labelledby="criterion-icon-label" className="flex flex-wrap gap-2">
            {CRITERION_ICONS.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={icon === name}
                aria-label={c.icons[name]}
                onClick={() => {
                  buzz(8)
                  setIcon(name)
                }}
                className={cx('grid size-11 place-items-center rounded-full border-[1.5px] transition-colors duration-150', icon === name ? 'border-ink bg-ink text-ground' : 'border-line-strong bg-surface text-ink')}
              >
                <CriterionIcon name={name} />
              </button>
            ))}
          </div>
        </div>
        {problem && <ErrorNote>{problem}</ErrorNote>}
        {criterion &&
          (used > 0 ? (
            <p className="text-xs leading-snug text-ink-soft">{c.sheet.used(used)}</p>
          ) : (
            <div className="flex flex-col items-start gap-1">
              <p className="text-xs leading-snug text-ink-soft">{c.sheet.unused}</p>
              <Button variant="quiet" className="-ml-3" disabled={working} onClick={() => void run(() => removeCriterion(criterion.id), c.removed)}>
                {c.sheet.remove}
              </Button>
            </div>
          ))}
      </div>
    </Sheet>
  )
}

export function CriteriaPage() {
  const c = useCopy(criteriaCopy)
  const t = useT()
  const criteria = useCriteria()
  const use = useCriterionUse()
  // What the sheet shows: a criterion as it was when it was opened, or null for a new one.
  // It stays put while the sheet slides away, so the words do not change under the thumb.
  const [sheet, setSheet] = useState<{ round: number; criterion: Criterion | null }>({ round: 0, criterion: null })
  const [open, setOpen] = useState(false)

  const show = (criterion: Criterion | null) => {
    setSheet((current) => ({ round: current.round + 1, criterion }))
    setOpen(true)
  }

  const act = (action: Promise<unknown>) => void action.catch(() => toast(t.common.somethingWrong, 'oops'))

  return (
    <StepPage
      title={c.title}
      backTo="/settings"
      footer={
        <Button block size="lg" onClick={() => show(null)}>
          {c.add}
        </Button>
      }
    >
      {!criteria || !use ? (
        <SteamLoader />
      ) : (
        <div className="flex flex-col gap-4 px-4" data-testid="criteria-page">
          <p className="text-sm text-ink-soft">{c.lead}</p>
          {criteria.length === 0 ? (
            <EmptyState title={c.emptyTitle} body={c.emptyBody} />
          ) : (
            <Card pad={false} className="overflow-hidden">
              <SortableList
                items={criteria.map((criterion) => ({ key: criterion.id, criterion }))}
                name={({ criterion }) => criterion.label}
                onMove={(from, to) => act(moveCriterion(criteria[from].id, to))}
                rowClassName="flex items-center gap-1 border-b border-line pl-1 pr-3 last:border-b-0"
              >
                {({ criterion }, _index, handle) => (
                  <>
                    <DragHandle {...handle} label={c.move(criterion.label)} />
                    <button
                      type="button"
                      onClick={() => show(criterion)}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 py-2 pr-1 text-left"
                      data-testid="criterion-row"
                    >
                      <span className={cx('grid size-9 shrink-0 place-items-center rounded-full bg-blush', !criterion.active && 'opacity-50')}>
                        <CriterionIcon name={criterion.icon} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx('block break-words text-sm font-extrabold leading-snug', !criterion.active && 'text-ink-soft')}>{criterion.label}</span>
                        {!criterion.active && <span className="block text-xs leading-snug text-ink-soft">{c.off}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-extrabold text-rose-ink">{c.edit}</span>
                    </button>
                    <Toggle bare label={c.ask(criterion.label)} checked={criterion.active} onChange={(on) => act(setCriterionActive(criterion.id, on))} />
                  </>
                )}
              </SortableList>
            </Card>
          )}
        </div>
      )}

      <CriterionSheet key={sheet.round} open={open} criterion={sheet.criterion} used={sheet.criterion ? (use?.get(sheet.criterion.id) ?? 0) : 0} onClose={() => setOpen(false)} />
    </StepPage>
  )
}
