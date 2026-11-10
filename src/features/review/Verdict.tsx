// A verdict to read: the face, the extras, the spoons, what was eaten and what was said.
// Used on the meal page and as the summary inside the flow.

import { chipLabel } from '../../content/chips'
import { usePref } from '../../data/prefs'
import type { Criterion, Dish, ExtraReaction, Review } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { cx, REACTION_EMOJI, Tag } from '../../ui/components'
import { reviewCopy } from './copy'
import { hasDetails, portionChoice } from './logic'
import { ExtraTags, SmallSpoons } from './parts'

interface Props {
  review: Review
  criteria: Criterion[]
  /** For the calories on the plate. */
  dish?: Dish | null
  /** Custom names for the six faces, from Settings. */
  labels?: Partial<Record<string, string>>
  extraLabel: (extra: ExtraReaction) => string
  /** Leave the face out where it is already on screen. */
  showFace?: boolean
  className?: string
}

export function VerdictSummary({ review, criteria, dish, labels, extraLabel, showFace = true, className }: Props) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const showCalories = usePref('showCalories')

  const scored = criteria.filter((criterion) => review.scores[criterion.id] !== undefined)
  const detailed = hasDetails(review)

  const facts: string[] = []
  if (detailed) {
    const kcal = showCalories && dish?.nutrition.kcalPerServing ? t.common.kcal(Math.round(dish.nutrition.kcalPerServing * review.portionsEaten)) : null
    const words = c.summary.portionWords[portionChoice(review.portionsEaten)]
    facts.push(c.summary.portionsAte(kcal ? `${words}, ${c.summary.kcal(kcal)}` : words))
  }
  if (review.wouldEatAgain !== null) facts.push(review.wouldEatAgain ? c.summary.againYes : c.summary.againNo)

  return (
    <div className={cx('flex flex-col gap-3.5', className)} data-testid="verdict">
      {showFace && review.reaction !== null && (
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-blush text-[2rem] leading-none">
            {REACTION_EMOJI[review.reaction]}
          </span>
          <p className="min-w-0 font-display text-lg font-bold leading-tight font-soft" data-testid="verdict-face">
            {labels?.[String(review.reaction)] ?? t.reactions.levels[review.reaction - 1]}
          </p>
        </div>
      )}

      {showFace && <ExtraTags extras={review.extraReactions} labelFor={extraLabel} />}

      {(review.overall !== null || scored.length > 0) && (
        <dl className="flex flex-col gap-1.5">
          {review.overall !== null && (
            <div className="flex min-h-7 items-center justify-between gap-3">
              <dt className="text-sm font-extrabold">{c.details.overall}</dt>
              <dd className="flex items-center gap-2.5">
                <span className="text-right text-xs font-extrabold leading-tight text-rose-ink">{t.review.levels[review.overall - 1]}</span>
                <SmallSpoons value={review.overall} />
              </dd>
            </div>
          )}
          {scored.map((criterion) => (
            <div key={criterion.id} className="flex min-h-7 items-center justify-between gap-3">
              <dt className="min-w-0 truncate text-sm text-ink-soft">{criterion.label}</dt>
              <dd className="flex">
                <SmallSpoons value={review.scores[criterion.id]} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {facts.length > 0 && <p className="text-sm">{facts.map((fact) => `${fact}.`).join(' ')}</p>}

      {review.chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {review.chips.map((chip) => (
            <li key={chip} className="flex">
              <Tag tone="butter">{chipLabel(chip, lang)}</Tag>
            </li>
          ))}
        </ul>
      )}

      {review.comment && <p className="break-words font-script text-[1.6rem] leading-tight text-rose-ink">{review.comment}</p>}
    </div>
  )
}
