// What the meal page shows about proof and verdict:
//   ProofCard     a served meal waits for its photo (the Taster's way into the flow)
//   EarlyProof    the cook forgot to tap "Served": the Taster can prove it anyway
//   MealReview    an eaten meal: the polaroids, the verdict, the Chef's guess and answer

import { motion, MotionConfig } from 'motion/react'
import { useState } from 'react'
import { navigate } from '../../app/router'
import { answerReview, type ChefAnswer } from '../../data/actions'
import { useCriteria, useHousehold, useReviews } from '../../data/queries'
import type { ExtraReaction, ID, ProofPhoto, Reaction, Review, Score5, Serving } from '../../data/types'
import { useCopy, useLang, useT } from '../../i18n'
import { formatDay, formatTime, toDay } from '../../lib/dates'
import { Avatar, Button, buzz, Card, cx, REACTION_EMOJI, TextArea, toast } from '../../ui/components'
import { Cloche, WaxSeal } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { planningCopy } from '../planning/copy'
import { cookOf, roleIn } from '../planning/logic'
import { nameOf, TextAction, type Kitchen } from '../planning/shared'
import { reviewCopy } from './copy'
import { awaitsGuess, canJudge, chefAnswer, earliestSeal, EXTRA_EMOJI, EXTRA_REACTIONS, guessOutcome, hasAnswer, hasVerdict, mealOverall, mealVerdicts, myVerdicts, sortProof, tiltOf, timeLeft, verdictDishIds } from './logic'
import { BigSpoons, ExtrasTray, FacePicker, PhotoViewer, ProofPolaroid, useNow, type ViewedPhoto } from './parts'
import { VerdictSummary } from './Verdict'

interface Props {
  serving: Serving
  kitchen: Kitchen
}

// ------------------------------------------------------- before it is eaten --

/** On the table and waiting: the Taster's way to the camera. */
export function ProofCard({ serving, kitchen }: Props) {
  const t = useT()
  const c = useCopy(reviewCopy)
  const reviews = useReviews()
  if (!reviews) return null
  const started = serving.proofPhotos.length > 0
  const judged = started && myVerdicts(serving.id, verdictDishIds(serving, kitchen.menus), reviews, kitchen.meId).every((verdict) => hasVerdict(verdict.review))
  return (
    <Card pad={false} className="flex flex-col gap-3 p-4" data-testid="proof-card">
      <div>
        <h2 className="text-lg">{started ? c.meal.continueTitle : c.meal.proofTitle}</h2>
        <p className="mt-1 text-sm text-ink-soft">{started ? (judged ? c.meal.continueReady : c.meal.continueBody) : c.meal.proofBody}</p>
      </div>
      <Button size="lg" block icon={started ? undefined : <Icon name="camera" size={22} />} onClick={() => navigate(`/review/${serving.id}`)}>
        {started ? c.meal.continueAction : t.actions.takeProof}
      </Button>
    </Card>
  )
}

/** The cook has not tapped "Served", but the plate is there: a quiet way to the camera. */
export function EarlyProof({ servingId, className }: { servingId: ID; className?: string }) {
  const c = useCopy(reviewCopy)
  return (
    <TextAction className={className} onClick={() => navigate(`/review/${servingId}`)}>
      {c.today.early}
    </TextAction>
  )
}

// ------------------------------------------------------------ the polaroids --

const TAPES = ['sage', 'butter', 'rose'] as const

function ProofGallery({ serving, mealName, dishIds, dishName }: { serving: Serving; mealName: string; dishIds: ID[]; dishName: (id: ID) => string }) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const [viewing, setViewing] = useState<ViewedPhoto | null>(null)
  const photos = sortProof(serving.proofPhotos, dishIds)
  if (photos.length === 0) return <p className="px-1 text-sm text-ink-soft">{c.meal.noPhoto}</p>

  const [first, ...rest] = photos
  const timeOf = (photo: ProofPhoto) => formatTime(photo.takenAt, lang)
  const stampOf = (photo: ProofPhoto) => c.proof.caption(formatDay(toDay(photo.takenAt), lang, 'date-short'), timeOf(photo))
  const subjectOf = (photo: ProofPhoto) => (photo.courseDishId ? dishName(photo.courseDishId) : mealName)
  const view = (photo: ProofPhoto) => setViewing({ photoId: photo.photoId, alt: c.proof.photoOf(subjectOf(photo), stampOf(photo)), caption: stampOf(photo) })

  return (
    <div className="flex flex-col items-center pb-1 pt-2" data-testid="proof-gallery">
      <ProofPolaroid
        photo={first}
        alt={c.proof.photoOf(subjectOf(first), stampOf(first))}
        caption={stampOf(first)}
        width="15rem"
        variant="full"
        tilt={tiltOf(first.photoId, 2.5)}
        label={first.courseDishId ? dishName(first.courseDishId) : undefined}
        onOpen={() => view(first)}
        openLabel={c.proof.look(subjectOf(first))}
      >
        {/* Eaten with love: the seal sits on the corner of the proof. */}
        <WaxSeal size={62} text={t.review.sealText} label={t.review.sealLabel} className="pointer-events-none absolute -right-9 bottom-0.5 -rotate-12 drop-shadow-[0_3px_4px_#9f2f3a55]" />
      </ProofPolaroid>
      {rest.length > 0 && (
        <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-7">
          {rest.map((photo, index) => (
            <ProofPolaroid
              key={photo.photoId}
              photo={photo}
              alt={c.proof.photoOf(subjectOf(photo), stampOf(photo))}
              caption={timeOf(photo)}
              width="7.75rem"
              tilt={tiltOf(photo.photoId)}
              tape={TAPES[index % TAPES.length]}
              label={photo.courseDishId ? dishName(photo.courseDishId) : undefined}
              onOpen={() => view(photo)}
              openLabel={c.proof.look(subjectOf(photo))}
            />
          ))}
        </div>
      )}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

// ---------------------------------------------------------- the Chef's side --

/** "Before you look": the cook guesses first, then the verdict opens. */
function GuessGate({ taster, onGuess }: { taster: string; onGuess: (guess: Score5) => void }) {
  const c = useCopy(reviewCopy)
  return (
    <Card pad={false} className="flex flex-col items-center px-4 pb-5 pt-5 text-center" data-testid="guess-gate">
      <Cloche size={60} />
      <p className="mt-2 text-xs font-extrabold text-ink-soft">{c.chef.gateTitle}</p>
      <h2 className="mt-0.5 text-xl">{c.chef.gateQuestion}</h2>
      <div className="mt-3">
        <BigSpoons label={c.chef.guessLabel} value={null} onChange={(guess) => guess && onGuess(guess)} hint={c.chef.gateHint(taster)} centred />
      </div>
    </Card>
  )
}

interface AnswerProps {
  reviews: Review[]
  taster: string
  labels?: Partial<Record<string, string>>
}

/** The cook answers under the verdict: a face, a little extra, a few words. */
function AnswerEditor({ reviews, taster, labels }: AnswerProps) {
  const t = useT()
  const c = useCopy(reviewCopy)
  const answer = chefAnswer(reviews.map((review) => ({ dishId: review.dishId ?? '', review })))
  const [tray, setTray] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** What was just sent, shown until the stored reply has caught up. */
  const [sent, setSent] = useState<string | null>(null)
  const reply = answer.reply ?? sent
  const trayOpen = tray ?? answer.extras.length > 0
  const writing = draft !== null || reply === null
  const extraLabel = (extra: ExtraReaction) => c.chef.extras[extra](taster)

  /** For a menu the same answer goes on every course. */
  async function save(changes: ChefAnswer): Promise<boolean> {
    try {
      for (const review of reviews) await answerReview(review.id, changes)
      return true
    } catch {
      toast(t.common.somethingWrong, 'oops')
      return false
    }
  }

  async function hold(reaction: Reaction) {
    if (answer.reaction !== reaction) await save({ chefReaction: reaction })
    setTray(true)
  }

  async function send() {
    setBusy(true)
    const words = (draft ?? '').trim()
    if (await save({ chefReply: words })) {
      setSent(words || null)
      setDraft(null)
      toast(c.chef.sent)
    }
    setBusy(false)
  }

  return (
    <Card pad={false} className="px-3 pb-4 pt-4" data-testid="answer-editor">
      <h2 className="px-1 text-lg">{c.chef.answerHeading}</h2>
      <p className="mb-2 mt-1 px-1 text-sm text-ink-soft">{c.chef.reactionLabel}</p>
      <FacePicker value={answer.reaction} onChange={(reaction) => void save({ chefReaction: reaction })} onHold={(reaction) => void hold(reaction)} labels={labels} />
      <div className="flex min-h-11 items-center justify-center">
        {trayOpen ? (
          <p className="pt-2 text-xs font-extrabold">{c.verdict.more}</p>
        ) : (
          <TextAction aria-expanded={false} onClick={() => setTray(true)}>
            {c.verdict.more}
          </TextAction>
        )}
      </div>
      <ExtrasTray
        open={trayOpen}
        label={c.verdict.more}
        selected={answer.extras}
        onToggle={(extra) => void save({ chefExtraReactions: EXTRA_REACTIONS.filter((e) => (e === extra ? !answer.extras.includes(e) : answer.extras.includes(e))) })}
        labelFor={extraLabel}
      />

      <div className="mt-3 px-1">
        {writing ? (
          <div className="flex flex-col gap-3">
            <TextArea label={c.chef.replyLabel(taster)} placeholder={c.chef.replyPlaceholder} rows={2} maxLength={280} value={draft ?? ''} onChange={(event) => setDraft(event.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={busy || ((draft ?? '').trim() === '' && reply === null)} onClick={() => void send()}>
                {c.chef.send}
              </Button>
              {reply !== null && (
                <Button variant="quiet" onClick={() => setDraft(null)}>
                  {t.actions.cancel}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="rounded-card bg-blush px-5 py-4 stitched">
              <p className="text-2xs font-extrabold text-ink-soft">{c.chef.replyLabel(taster)}</p>
              <p className="mt-0.5 break-words font-script text-[1.6rem] leading-tight text-rose-ink" data-testid="chef-reply">
                {reply}
              </p>
            </div>
            <TextAction className="ml-1.5" onClick={() => setDraft(reply ?? '')}>
              {c.chef.editReply}
            </TextAction>
          </div>
        )}
      </div>
    </Card>
  )
}

/** What the cook answered, as the Taster sees it: like the first comment under a post. */
function AnswerView({ reviews, kitchen, cookId, labels }: { reviews: Review[]; kitchen: Kitchen; cookId: ID | null; labels?: Partial<Record<string, string>> }) {
  const t = useT()
  const c = useCopy(reviewCopy)
  const cook = kitchen.members.find((member) => member.id === cookId)
  const answer = chefAnswer(reviews.map((review) => ({ dishId: review.dishId ?? '', review })))
  const name = cook?.name ?? ''
  const guess = answer.guess !== null ? <p className="text-sm text-ink-soft">{c.chef.theirGuess(name, t.review.levels[answer.guess - 1])}</p> : null

  if (!hasAnswer(answer)) {
    return (
      <div className="flex flex-col gap-1 px-1" data-testid="answer-view">
        {guess}
        <p className="text-sm text-ink-soft">{c.chef.notYet(name)}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid="answer-view">
      <div className="flex items-start gap-2.5">
        <Avatar avatar={cook?.avatar ?? 'whisk'} color={cook?.color} accessory={cook?.accessory} size={40} name={name} />
        <div className="min-w-0 flex-1 rounded-card bg-blush px-5 py-4 stitched">
          <p className="text-2xs font-extrabold text-ink-soft">{c.chef.answerOf(name)}</p>
          {answer.reaction !== null && (
            <p className="mt-1.5 flex items-center gap-2 text-sm font-extrabold">
              <span aria-hidden className="text-2xl leading-none">
                {REACTION_EMOJI[answer.reaction]}
              </span>
              {labels?.[String(answer.reaction)] ?? t.reactions.levels[answer.reaction - 1]}
            </p>
          )}
          {answer.extras.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {answer.extras.map((extra) => (
                <li key={extra} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-extrabold">
                  <span aria-hidden className="leading-none">
                    {EXTRA_EMOJI[extra]}
                  </span>
                  {c.chef.extras[extra](kitchen.me?.name ?? '')}
                </li>
              ))}
            </ul>
          )}
          {answer.reply && (
            <p className="mt-1.5 break-words font-script text-[1.6rem] leading-tight text-rose-ink" data-testid="chef-reply">
              {answer.reply}
            </p>
          )}
        </div>
      </div>
      {guess && <div className="px-1">{guess}</div>}
    </div>
  )
}

// ------------------------------------------------------------ an eaten meal --

/** Proof and verdict of an eaten meal, for whoever is looking: the Taster or the cook. */
export function MealReview({ serving, kitchen }: Props) {
  const t = useT()
  const lang = useLang()
  const c = useCopy(reviewCopy)
  const goneDish = useCopy(planningCopy).shared.goneDish
  const allReviews = useReviews()
  const criteria = useCriteria()
  const household = useHousehold()
  const now = useNow()
  const [revealed, setRevealed] = useState(false)

  if (!allReviews || !criteria) return null

  const dishIds = verdictDishIds(serving, kitchen.menus)
  const dishName = (dishId: ID) => kitchen.dishes.get(dishId)?.name ?? goneDish
  const isMenu = serving.menuId !== null && dishIds.length > 0
  const mealName = isMenu ? (kitchen.menus.get(serving.menuId as ID)?.name ?? goneDish) : dishName(dishIds[0] ?? '')
  const verdicts = mealVerdicts(serving, dishIds, allReviews)
  const reviews = verdicts.map((verdict) => verdict.review).filter((review): review is Review => review !== null)
  const reviewerId = reviews[0]?.reviewerId ?? null
  const mine = reviewerId === kitchen.meId
  const cookId = cookOf(serving)
  const iCook = roleIn(serving, kitchen.meId) === 'cook'
  const taster = nameOf(kitchen, reviewerId)
  const cookName = kitchen.partner ? nameOf(kitchen, cookId) : ''
  const labels = household?.settings.reactionLabels
  const gate = iCook && !mine && awaitsGuess(verdicts, kitchen.meId)
  const answer = chefAnswer(verdicts)
  const left = timeLeft(earliestSeal(verdicts), now)
  const outcome = guessOutcome(answer.guess, mealOverall(verdicts))
  const extraLabel = (extra: ExtraReaction) => c.verdict.extras[extra](cookName)

  async function guess(score: Score5) {
    buzz([12, 40, 18])
    // Set before saving: the verdict card appears the moment the guess is stored.
    setRevealed(true)
    try {
      for (const review of reviews) await answerReview(review.id, { chefSelfRating: score })
    } catch {
      toast(t.common.somethingWrong, 'oops')
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <ProofGallery serving={serving} mealName={mealName} dishIds={dishIds} dishName={dishName} />

      {reviews.length === 0 ? (
        <p className="px-1 text-sm text-ink-soft">{c.meal.noVerdict}</p>
      ) : gate ? (
        <GuessGate taster={taster} onGuess={(score) => void guess(score)} />
      ) : (
        <motion.div initial={revealed ? { opacity: 0, rotateX: -80, y: 14 } : false} animate={{ opacity: 1, rotateX: 0, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} style={{ transformPerspective: 900, transformOrigin: 'top center' }}>
          <Card pad={false} className="p-4" data-testid="verdict-card">
            <h2 className="text-lg">{mine ? c.meal.verdictMine : c.meal.verdictOf(taster)}</h2>

            {iCook && !mine && answer.guess !== null && (
              <p className="mt-2 rounded-2xl bg-blush px-3.5 py-2.5 text-sm font-bold" data-testid="guess-result">
                {c.chef.yourGuess(t.review.levels[answer.guess - 1])}
                {outcome && ` ${c.chef.outcome[outcome]}`}
              </p>
            )}

            <div className={cx('mt-4 flex flex-col', isMenu && 'divide-y divide-line')}>
              {verdicts.map(({ dishId, review }) =>
                review ? (
                  <div key={dishId} className={cx(isMenu && 'py-4 first:pt-0 last:pb-0')} data-testid="dish-verdict">
                    {isMenu && <h3 className="mb-3 font-sans text-sm font-extrabold tracking-normal">{dishName(dishId)}</h3>}
                    <VerdictSummary review={review} criteria={criteria} dish={kitchen.dishes.get(dishId)} labels={labels} extraLabel={extraLabel} />
                  </div>
                ) : null,
              )}
            </div>

            {left && (
              <div className="mt-4 border-t border-line pt-3">
                {left.sealed ? (
                  <p className="flex items-start gap-2 text-sm text-ink-soft" data-testid="sealed-note">
                    <Icon name="check" size={18} className="mt-0.5 shrink-0" />
                    {c.window.sealedSince(c.proof.caption(formatDay(toDay(earliestSeal(verdicts) as string), lang, 'date'), formatTime(earliestSeal(verdicts) as string, lang)))}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-ink-soft" data-testid="time-left">
                      {mine ? c.window.mine(left.amount, left.unit) : c.window.theirs(taster, left.amount, left.unit)}
                    </p>
                    {mine && canJudge(serving, kitchen.meId, kitchen.partner !== null) && <TextAction onClick={() => navigate(`/review/${serving.id}`)}>{c.window.change}</TextAction>}
                  </>
                )}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {reviews.length > 0 && !gate && iCook && !mine && <AnswerEditor reviews={reviews} taster={taster} labels={labels} />}
      {reviews.length > 0 && mine && kitchen.partner && cookId !== kitchen.meId && <AnswerView reviews={reviews} kitchen={kitchen} cookId={cookId} labels={labels} />}

      <TextAction className="-my-2 self-center" onClick={() => navigate('/photos')}>
        {c.meal.wall}
      </TextAction>
    </MotionConfig>
  )
}
