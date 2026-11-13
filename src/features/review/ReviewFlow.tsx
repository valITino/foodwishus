// The Taster's path through a meal: the proof photo, one face, the details if there is
// time, and the wax seal. For 24 hours after handing in, the same page changes the verdict.

import { motion, useAnimationControls } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { back, navigate } from '../../app/router'
import { quotes } from '../../content/quotes'
import { ActionError, finishMeal, reactToMeal, saveReview, setEatenAt } from '../../data/actions'
import { useCriteria, useHousehold, useReviews } from '../../data/queries'
import type { ExtraReaction, ID, ISO, Reaction } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { formatDay, formatTime, toDay } from '../../lib/dates'
import { Button, buzz, Card, DishThumb, EmptyState, PageHeader, REACTION_EMOJI, Screen, Stamp, toast } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { planningCopy } from '../planning/copy'
import { cookOf } from '../planning/logic'
import { MealThumb, nameOf, StickyFooter, TextAction, useKitchen, useMealInfo } from '../planning/shared'
import { reviewCopy } from './copy'
import { canJudge, celebrates, earliestSeal, eatenGuess, EXTRA_REACTIONS, hasDetails, hasVerdict, myVerdicts, reactionsDiffer, sharedExtras, sharedReaction, timeLeft, verdictDishIds } from './logic'
import { ExtrasTray, FacePicker, HeartConfetti, useNow } from './parts'
import { ProofSection } from './ProofSection'
import { ReviewSheet } from './ReviewSheet'
import { VerdictSummary } from './Verdict'

/** The seal comes down, with hearts for a 5 out of 5. Stays until it is tapped away. */
function Celebration({ confetti, body, onDone }: { confetti: boolean; body: string; onDone: () => void }) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const [quote] = useState(() => quotes[lang][Math.floor(Math.random() * quotes[lang].length)])

  useEffect(() => {
    // The buzz lands with the seal.
    const timer = setTimeout(() => buzz([40, 60, 20]), 280)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = previous
    }
  }, [])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={c.submit.doneTitle} data-testid="celebration" className="gingham fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-ground px-6 text-center">
      <div className="relative">
        <Stamp size={176} />
        {confetti && <HeartConfetti />}
      </div>
      <h2 className="mt-9 text-2xl">{c.submit.doneTitle}</h2>
      <p className="mt-2 max-w-[19rem] text-sm text-ink-soft">{body}</p>
      <p className="mt-5 max-w-[19rem] font-script text-[1.7rem] leading-tight text-rose-ink">{quote}</p>
      <Button size="lg" className="mt-8 min-w-48" autoFocus onClick={onDone}>
        {t.actions.done}
      </Button>
    </div>,
    document.body,
  )
}

export function ReviewFlowScreen({ id }: { id: ID }) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const goneDish = useCopy(planningCopy).shared.goneDish
  const gone = useCopy(planningCopy).serving
  const kitchen = useKitchen()
  const reviews = useReviews()
  const criteria = useCriteria()
  const household = useHousehold()
  const mealInfo = useMealInfo()
  const now = useNow()
  const proofShake = useAnimationControls()
  const facesShake = useAnimationControls()
  const proofRef = useRef<HTMLDivElement>(null)
  const facesRef = useRef<HTMLDivElement>(null)
  /** A corrected eating time, kept here until the meal is handed in. */
  const [corrected, setCorrected] = useState<ISO | null>(null)
  const [refusal, setRefusal] = useState<'proof' | 'verdict' | null>(null)
  const [busy, setBusy] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [trayOpened, setTrayOpened] = useState<boolean | null>(null)
  const [sheet, setSheet] = useState<{ dishId: ID; turn: number } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const backTo = `/serving/${id}`
  const shell = (children: ReactNode, title = c.flow.title) => (
    <Screen>
      <PageHeader title={title} backTo={backTo} />
      {children}
    </Screen>
  )

  if (!kitchen || !reviews || !criteria) return shell(null)

  const serving = kitchen.servings.find((s) => s.id === id)
  if (!serving) return shell(<EmptyState title={gone.goneTitle} body={gone.goneBody} action={<Button onClick={() => navigate('/wishlist', { replace: true })}>{gone.goneAction}</Button>} />)

  const info = mealInfo(serving, kitchen)
  const isMenu = info.kind === 'menu'
  const dishIds = verdictDishIds(serving, kitchen.menus)
  const dishName = (dishId: ID) => kitchen.dishes.get(dishId)?.name ?? goneDish
  const cookName = kitchen.partner ? nameOf(kitchen, cookOf(serving)) : ''
  const eaten = serving.status === 'eaten'
  const mine = myVerdicts(serving.id, dishIds, reviews, kitchen.meId)
  const left = timeLeft(earliestSeal(mine), now)
  const sealed = left?.sealed === true
  const openMeal = <Button onClick={() => navigate(backTo, { replace: true })}>{c.flow.openMeal}</Button>

  const done = () => back(backTo)

  if (celebrating) {
    return shell(<Celebration confetti={celebrates(mine)} body={kitchen.partner ? c.submit.doneBody(cookName) : c.submit.doneBodyAlone} onDone={done} />)
  }

  if (!canJudge(serving, kitchen.meId, kitchen.partner !== null)) {
    return shell(
      <main className="app-column flex flex-col items-center px-6 pt-10 text-center" data-testid="not-yours">
        <Mascot size={104} mood="happy" />
        <h2 className="mt-4 text-xl">{c.flow.notYoursTitle}</h2>
        <p className="mt-1.5 font-script text-2xl leading-tight text-rose-ink">{c.flow.notYoursQuip}</p>
        <p className="mt-3 max-w-[20rem] text-sm text-ink-soft">{c.flow.notYoursBody(kitchen.partner?.name ?? '')}</p>
        <div className="mt-6">{openMeal}</div>
      </main>,
    )
  }

  if (serving.status === 'skipped') return shell(<EmptyState title={c.flow.skippedTitle} body={c.flow.skippedBody} action={openMeal} />)

  if (eaten && sealed) {
    const since = earliestSeal(mine) as ISO
    return shell(
      <main className="app-column flex flex-col items-center px-6 pt-12 text-center" data-testid="sealed">
        <Stamp size={136} play={false} />
        <h2 className="mt-7 text-xl">{c.flow.sealedTitle}</h2>
        <p className="mt-2 max-w-[20rem] text-sm text-ink-soft">{c.flow.sealedBody}</p>
        <p className="mt-3 max-w-[20rem] text-sm font-bold">{c.window.sealedSince(c.proof.caption(formatDay(toDay(since), lang, 'date'), formatTime(since, lang)))}</p>
        <div className="mt-7">{openMeal}</div>
      </main>,
    )
  }

  const photos = serving.proofPhotos
  const face = sharedReaction(mine)
  const extras = sharedExtras(mine)
  const judged = dishIds.length > 0 && mine.every((verdict) => hasVerdict(verdict.review))
  const ready = photos.length > 0 && judged
  const trayOpen = trayOpened ?? extras.length > 0
  const eatenAt = serving.eatenAt ?? corrected ?? eatenGuess(serving)
  const labels = household?.settings.reactionLabels
  const stillRefused = refusal === 'proof' ? photos.length === 0 : refusal === 'verdict' ? !judged : false
  const sheetVerdict = sheet ? mine.find((verdict) => verdict.dishId === sheet.dishId) : undefined
  const extraLabel = (extra: ExtraReaction) => c.verdict.extras[extra](cookName)

  /** Say in words why something did not work. */
  function explain(error: unknown) {
    if (error instanceof ActionError && error.code === 'review_sealed') toast(c.submit.sealed, 'oops')
    else if (error instanceof ActionError && error.code === 'serving_missing') toast(c.submit.gone, 'oops')
    else toast(t.common.somethingWrong, 'oops')
  }

  async function react(reaction: Reaction) {
    try {
      await reactToMeal(serving!.id, reaction)
    } catch (error) {
      explain(error)
    }
  }

  /** Holding a face picks it and opens the extras. */
  async function hold(reaction: Reaction) {
    if (face !== reaction) await react(reaction)
    setTrayOpened(true)
  }

  /** An extra from the meal's own bar goes on every course, like the face. */
  async function toggleExtra(extra: ExtraReaction) {
    const on = !extras.includes(extra)
    try {
      for (const verdict of mine) {
        const current = verdict.review?.extraReactions ?? []
        await saveReview(serving!.id, verdict.dishId, { extraReactions: EXTRA_REACTIONS.filter((e) => (e === extra ? on : current.includes(e))) })
      }
    } catch (error) {
      explain(error)
    }
  }

  async function correctTime(moment: ISO) {
    if (!eaten) return setCorrected(moment)
    try {
      await setEatenAt(serving!.id, moment)
      toast(t.common.saved)
    } catch (error) {
      explain(error)
    }
  }

  function refuse(what: 'proof' | 'verdict') {
    setRefusal(what)
    buzz([20, 40, 20])
    const place = what === 'proof' ? proofRef : facesRef
    place.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    void (what === 'proof' ? proofShake : facesShake).start({ x: [0, -7, 7, -4, 4, 0], transition: { duration: 0.42 } })
  }

  async function handIn() {
    setBusy(true)
    try {
      await finishMeal(serving!.id, corrected ?? undefined)
      setRefusal(null)
      setCelebrating(true)
    } catch (error) {
      if (error instanceof ActionError && error.code === 'proof_missing') refuse('proof')
      else if (error instanceof ActionError && error.code === 'reaction_missing') refuse('verdict')
      else explain(error)
    }
    setBusy(false)
  }

  /** The photo is in: bring the faces within thumb reach, once the polaroid has had its moment. */
  function showFaces() {
    if (judged) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setTimeout(() => facesRef.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'nearest' }), 700)
  }

  function openSheet(dishId: ID) {
    setSheet((current) => ({ dishId, turn: (current?.turn ?? 0) + 1 }))
    setSheetOpen(true)
  }

  return shell(
    <>
      <main className="app-column flex flex-col gap-6 px-4 pb-32 pt-5">
        <div className="flex items-center gap-3 px-1">
          <MealThumb info={info} seed={serving.id} size={56} />
          <div className="min-w-0">
            <h2 className="text-xl hyphens-auto [overflow-wrap:anywhere]">{info.name}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">{kitchen.partner ? c.flow.cookedBy(cookName) : c.flow.cookedByMe}</p>
          </div>
        </div>

        {eaten && left && !left.sealed && (
          <p className="-mt-1 flex items-start gap-2.5 rounded-2xl bg-blush px-3.5 py-2.5 text-sm font-bold" data-testid="time-left">
            <Icon name="clock" size={19} className="mt-px shrink-0" />
            <span>{c.window.mine(left.amount, left.unit)}</span>
          </p>
        )}

        {(serving.status === 'wishlist' || serving.status === 'planned') && <p className="-mt-1 rounded-2xl bg-blush px-3.5 py-2.5 text-sm font-bold">{c.flow.notServedYet}</p>}

        <motion.div ref={proofRef} animate={proofShake}>
          <ProofSection
            serving={serving}
            mealName={info.name}
            dishIds={dishIds}
            dishName={dishName}
            isMenu={isMenu}
            today={kitchen.today}
            main={!eaten}
            eatenAt={eatenAt}
            onEatenAt={(moment) => void correctTime(moment)}
            onFirstPhoto={showFaces}
          />
        </motion.div>

        <motion.div ref={facesRef} animate={facesShake} className="scroll-mb-32">
          <Card pad={false} className="px-3 pb-2 pt-4" data-testid="faces">
            <h2 className="mb-3 px-1 text-lg">{isMenu ? c.verdict.headingMenu : t.reactions.title}</h2>
            <FacePicker value={face} onChange={(reaction) => void react(reaction)} onHold={(reaction) => void hold(reaction)} labels={labels} />
            {reactionsDiffer(mine) && <p className="mt-2 px-2 text-balance text-center text-xs text-ink-soft">{c.verdict.mixed}</p>}
            <div className="flex min-h-11 items-center justify-center">
              {!judged ? (
                <p className="text-center text-xs text-ink-soft">{c.verdict.holdHint}</p>
              ) : trayOpen ? (
                <p className="pt-2 text-xs font-extrabold">{c.verdict.more}</p>
              ) : (
                <TextAction aria-expanded={false} onClick={() => setTrayOpened(true)}>
                  {c.verdict.more}
                </TextAction>
              )}
            </div>
            <ExtrasTray open={trayOpen} label={c.verdict.more} selected={extras} onToggle={(extra) => void toggleExtra(extra)} labelFor={extraLabel} />
          </Card>
        </motion.div>

        {isMenu ? (
          <Card pad={false} data-testid="courses">
            <div className="p-4 pb-3">
              <h2 className="text-lg">{c.details.coursesHeading}</h2>
              <p className="mt-1 text-sm text-ink-soft">{c.details.coursesHint}</p>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {mine.map(({ dishId, review }) => {
                const dish = kitchen.dishes.get(dishId)
                const words = [review?.reaction ? (labels?.[String(review.reaction)] ?? t.reactions.levels[review.reaction - 1]) : c.details.noFace, review?.overall ? t.review.levels[review.overall - 1] : null]
                return (
                  <li key={dishId}>
                    <button type="button" aria-label={c.details.judgeCourse(dishName(dishId))} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left" onClick={() => openSheet(dishId)}>
                      <DishThumb dish={dish ?? { id: dishId, name: goneDish, coverPhotoId: null, icon: null }} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-extrabold leading-snug">{dishName(dishId)}</span>
                        <span className="block text-xs text-ink-soft" data-testid="course-verdict">
                          {words.filter(Boolean).join(', ')}
                        </span>
                      </span>
                      {review?.reaction && (
                        <span aria-hidden className="text-2xl leading-none">
                          {REACTION_EMOJI[review.reaction]}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        ) : (
          dishIds.map((dishId) => {
            const review = mine[0]?.review ?? null
            const detailed = hasDetails(review)
            return (
              <Card key={dishId} pad={false} className="p-4" data-testid="details">
                <h2 className="text-lg">{c.details.heading}</h2>
                {review && detailed ? (
                  <VerdictSummary className="mt-3" review={review} criteria={criteria} dish={kitchen.dishes.get(dishId)} labels={labels} extraLabel={extraLabel} showFace={false} />
                ) : (
                  <p className="mt-1 text-sm text-ink-soft">{c.details.hint}</p>
                )}
                <Button variant="secondary" block className="mt-4" onClick={() => openSheet(dishId)}>
                  {detailed ? c.details.change : c.details.add}
                </Button>
              </Card>
            )
          })
        )}
      </main>

      <StickyFooter>
        {stillRefused && (
          <p role="alert" className="mb-2.5 rounded-2xl bg-butter px-3.5 py-2.5 text-sm font-bold text-on-rose">
            {refusal === 'proof' ? c.submit.noProof : c.submit.noVerdict}
          </p>
        )}
        {eaten ? (
          <Button size="lg" block onClick={done}>
            {t.actions.done}
          </Button>
        ) : (
          <Button size="lg" block variant={ready ? 'primary' : 'secondary'} disabled={busy} onClick={() => void handIn()}>
            {c.submit.handIn}
          </Button>
        )}
      </StickyFooter>

      {sheet && (
        <ReviewSheet
          key={`${sheet.dishId}:${sheet.turn}`}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          servingId={serving.id}
          dishId={sheet.dishId}
          dishName={dishName(sheet.dishId)}
          dish={kitchen.dishes.get(sheet.dishId) ?? null}
          review={sheetVerdict?.review ?? null}
          withFace={isMenu}
          criteria={criteria}
          labels={labels}
        />
      )}
    </>,
    eaten ? c.flow.titleEdit : c.flow.title,
  )
}
