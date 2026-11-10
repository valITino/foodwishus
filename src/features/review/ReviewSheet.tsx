// The full verdict on one dish: overall, the criteria, portions, "again?", chips and a
// few words. Everything is optional. Closing the sheet keeps what was entered, however
// it is closed, so nothing typed between two bites gets lost.

import { useEffect, useRef, useState } from 'react'
import { setBlocker } from '../../app/router'
import { CHIP_KEYS, chipLabel } from '../../content/chips'
import { ActionError, saveReview, type ReviewInput } from '../../data/actions'
import { usePref } from '../../data/prefs'
import type { Criterion, Dish, ID, Reaction, Review, Score5 } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { Button, Chip, Sheet, SpoonMeter, TextArea, toast } from '../../ui/components'
import { reviewCopy } from './copy'
import { portionChoice, PORTIONS } from './logic'
import { BigSpoons, FacePicker } from './parts'

interface Draft {
  reaction: Reaction | null
  overall: Score5 | null
  scores: Record<ID, Score5>
  portionsEaten: number
  wouldEatAgain: boolean | null
  comment: string
  chips: string[]
}

function draftOf(review: Review | null): Draft {
  return {
    reaction: review?.reaction ?? null,
    overall: review?.overall ?? null,
    scores: { ...(review?.scores ?? {}) },
    portionsEaten: review?.portionsEaten ?? 1,
    wouldEatAgain: review?.wouldEatAgain ?? null,
    comment: review?.comment ?? '',
    chips: [...(review?.chips ?? [])],
  }
}

interface Props {
  open: boolean
  onClose: () => void
  servingId: ID
  dishId: ID
  dishName: string
  dish: Dish | null
  /** What is stored so far. Read once, when the sheet opens: give the sheet a new key to open it afresh. */
  review: Review | null
  /** For one course of a menu: its own face is chosen here as well. */
  withFace: boolean
  criteria: Criterion[]
  labels?: Partial<Record<string, string>>
}

export function ReviewSheet({ open, onClose, servingId, dishId, dishName, dish, review, withFace, criteria, labels }: Props) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const showCalories = usePref('showCalories')
  const [draft, setDraft] = useState(() => draftOf(review))
  const [before] = useState(() => JSON.stringify(draftOf(review)))
  const [saving, setSaving] = useState(false)

  const change = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }))
  const active = criteria.filter((criterion) => criterion.active)
  const portion = portionChoice(draft.portionsEaten)
  const kcal = showCalories && dish?.nutrition.kcalPerServing ? t.common.kcal(Math.round(dish.nutrition.kcalPerServing * draft.portionsEaten)) : null
  // Chips written before a key was retired stay on the review and can still be switched off.
  const chipKeys = [...CHIP_KEYS, ...draft.chips.filter((chip) => !(CHIP_KEYS as string[]).includes(chip))]

  function score(id: ID, value: Score5) {
    const scores = { ...draft.scores }
    if (scores[id] === value) delete scores[id]
    else scores[id] = value
    change({ scores })
  }

  /** Close, keeping whatever changed. */
  async function finish() {
    if (saving) return
    if (JSON.stringify(draft) === before) return onClose()
    setSaving(true)
    try {
      const input: ReviewInput = { overall: draft.overall, scores: draft.scores, portionsEaten: draft.portionsEaten, wouldEatAgain: draft.wouldEatAgain, comment: draft.comment, chips: draft.chips }
      if (withFace) input.reaction = draft.reaction
      await saveReview(servingId, dishId, input)
      toast(t.common.saved)
      onClose()
    } catch (error) {
      if (error instanceof ActionError && error.code === 'review_sealed') {
        toast(c.submit.sealed, 'oops')
        onClose()
      } else toast(t.common.somethingWrong, 'oops')
    }
    setSaving(false)
  }

  // The phone's own back button closes the sheet (keeping what was entered) instead of leaving the page.
  const finishRef = useRef(finish)
  finishRef.current = finish
  useEffect(() => {
    if (!open) return
    setBlocker(() => {
      void finishRef.current()
      return true
    })
    return () => setBlocker(null)
  }, [open])

  return (
    <Sheet
      open={open}
      onClose={() => void finish()}
      title={withFace ? dishName : c.details.sheetTitle}
      footer={
        <Button size="lg" block disabled={saving} onClick={() => void finish()}>
          {c.details.save}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 pb-1" data-testid="review-sheet">
        {withFace && (
          <div>
            <p className="mb-2 text-xs font-extrabold">{t.reactions.title}</p>
            <FacePicker value={draft.reaction} onChange={(reaction) => change({ reaction })} labels={labels} />
          </div>
        )}

        <div>
          <p className="text-xs font-extrabold">{c.details.overall}</p>
          <BigSpoons label={c.details.overall} value={draft.overall} onChange={(overall) => change({ overall })} hint={c.details.overallHint} />
        </div>

        {active.length > 0 && (
          <div>
            <p className="text-xs font-extrabold">{c.details.criteria}</p>
            <div className="mt-1 divide-y divide-line rounded-card border border-line bg-surface px-4 py-1">
              {active.map((criterion) => (
                <SpoonMeter key={criterion.id} label={criterion.label} value={draft.scores[criterion.id] ?? null} onChange={(value) => score(criterion.id, value)} />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-extrabold">{c.details.portions}</p>
          <div role="group" aria-label={c.details.portions} className="flex flex-wrap gap-2">
            {PORTIONS.map((amount) => (
              <Chip key={amount} selected={portion === amount} className="px-3.5" onClick={() => change({ portionsEaten: amount })}>
                {c.details.portionLabels[amount]}
              </Chip>
            ))}
          </div>
          {(portion === 3 || kcal) && (
            <p className="mt-2 text-xs text-ink-soft" aria-live="polite">
              {[portion === 3 ? c.details.secondsNote : null, kcal ? c.details.kcal(kcal) : null].filter(Boolean).join(' ')}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-extrabold">{c.details.again}</p>
          <div role="group" aria-label={c.details.again} className="flex flex-wrap gap-2">
            <Chip selected={draft.wouldEatAgain === true} onClick={() => change({ wouldEatAgain: draft.wouldEatAgain === true ? null : true })}>
              {c.details.yes}
            </Chip>
            <Chip selected={draft.wouldEatAgain === false} onClick={() => change({ wouldEatAgain: draft.wouldEatAgain === false ? null : false })}>
              {c.details.no}
            </Chip>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-extrabold">{c.details.chips}</p>
          <div role="group" aria-label={c.details.chips} className="flex flex-wrap gap-2">
            {chipKeys.map((chip) => {
              const on = draft.chips.includes(chip)
              return (
                <Chip key={chip} selected={on} className="px-3.5" onClick={() => change({ chips: on ? draft.chips.filter((other) => other !== chip) : [...draft.chips, chip] })}>
                  {chipLabel(chip, lang)}
                </Chip>
              )
            })}
          </div>
        </div>

        <TextArea label={c.details.comment} placeholder={c.details.commentPlaceholder} rows={2} maxLength={280} value={draft.comment} onChange={(event) => change({ comment: event.target.value })} />
      </div>
    </Sheet>
  )
}
