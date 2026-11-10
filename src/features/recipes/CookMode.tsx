// Cook mode: the whole screen, one step at a time, big enough to read from the stove.
// The screen stays awake, timers keep running while you move around, and the
// ingredient checklist slides up from the bottom.

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { back, type Route } from '../../app/router'
import { useDish } from '../../data/queries'
import type { Dish, ID, Step } from '../../data/types'
import { useLang, useT } from '../../i18n'
import { Button, buzz, cx, IconButton, PhotoImg, Sheet, SteamLoader } from '../../ui/components'
import { Heart, Mascot, Sparkle } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import {
  checkedCount,
  endSession,
  getChosenServings,
  getStep,
  getTimer,
  isChecked,
  pauseTimer,
  remainingMs,
  resetTimer,
  setStep,
  startTimer,
  timersOf,
  toggleChecked,
  uncheckAll,
  useCookStore,
  useTimerSound,
  useWakeLock,
  useWatching,
} from './cookSession'
import { useRecipesCopy } from './copy'
import { DEFAULT_SERVINGS, formatCountdown, formatIngredient, formatTimer, ingredientsForStep, scaleFactor } from './logic'
import { LineIcon, RoundButton } from './parts'

// ------------------------------------------------------------------ timer --

function TimerDial({ dishId, step, seconds }: { dishId: ID; step: number; seconds: number }) {
  const c = useRecipesCopy().cook
  const lang = useLang()
  const timer = getTimer(dishId, step)
  const totalMs = seconds * 1000
  const left = timer ? remainingMs(timer) : totalMs
  const state = timer?.state ?? 'idle'
  const share = totalMs > 0 ? left / totalMs : 0
  const radius = 26
  const round = 2 * Math.PI * radius

  const toggle = () => {
    if (state === 'running' && timer) pauseTimer(timer.key)
    else if (state === 'done' && timer) resetTimer(timer.key)
    else startTimer({ dishId, step, totalMs, doneMessage: c.timerDone(step + 1) })
  }
  const label = state === 'running' ? c.pauseTimer : state === 'paused' ? c.resumeTimer : state === 'done' ? c.resetTimer : c.startTimer(formatTimer(seconds, lang))
  const caption = state === 'running' ? c.running : state === 'paused' ? c.paused : state === 'done' ? c.timeUp : c.tapToStart

  return (
    <div
      className={cx('mt-6 flex items-center gap-1 rounded-card border-[1.5px] pr-2', state === 'done' ? 'border-butter-ink bg-butter text-on-rose' : 'border-line-strong bg-surface')}
      style={state === 'done' ? { animation: 'soft-pulse 1.6s ease-in-out infinite' } : undefined}
      data-testid="timer"
      data-state={state}
    >
      <button type="button" aria-label={label} onClick={toggle} className="flex min-h-20 min-w-0 flex-1 items-center gap-4 rounded-card p-3 text-left">
        <span className="relative grid size-16 shrink-0 place-items-center">
          <svg width="64" height="64" viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--color-line-strong)" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={state === 'done' ? 'var(--color-on-rose)' : 'var(--color-rose-ink)'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={round}
              strokeDashoffset={round * (1 - (state === 'done' ? 1 : share))}
            />
          </svg>
          {state === 'running' ? <LineIcon name="pause" size={24} /> : state === 'done' ? <Icon name="check" size={26} /> : <LineIcon name="play" size={24} className="ml-0.5" />}
        </span>
        <span className="min-w-0">
          <span className="tabular block font-display text-3xl font-bold leading-none font-soft" data-testid="timer-time">
            {formatCountdown(left)}
          </span>
          <span className={cx('mt-1 block text-xs font-bold', state === 'done' ? 'text-on-rose' : 'text-ink-soft')}>{caption}</span>
        </span>
      </button>
      {(state === 'running' || state === 'paused') && timer && (
        <RoundButton label={c.resetTimer} onClick={() => resetTimer(timer.key)}>
          <LineIcon name="reset" />
        </RoundButton>
      )}
    </div>
  )
}

/** Timers of other steps that are still going (or just finished). Tap one to go back to its step. */
function OtherTimers({ dishId, current, onGo }: { dishId: ID; current: number; onGo: (step: number) => void }) {
  const c = useRecipesCopy().cook
  const others = timersOf(dishId).filter((timer) => timer.step !== current)
  if (others.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5" data-testid="other-timers">
      {others.map((timer) => {
        const done = timer.state === 'done'
        return (
          <li key={timer.key}>
            <button
              type="button"
              aria-label={`${c.goToStep(timer.step + 1)}: ${done ? c.timeUp : formatCountdown(remainingMs(timer))}`}
              onClick={() => onGo(timer.step)}
              className={cx(
                'tabular inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold',
                done ? 'bg-butter text-on-rose' : 'border-[1.5px] border-line-strong bg-surface text-ink',
              )}
              style={done ? { animation: 'soft-pulse 1.6s ease-in-out infinite' } : undefined}
            >
              <Icon name="clock" size={16} />
              {c.timerOf(timer.step + 1)}
              <span>{done ? c.timeUp : formatCountdown(remainingMs(timer))}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ------------------------------------------------------------- celebration --

const CONFETTI = [
  { x: -120, y: -150, r: -30, s: 26, d: 0, heart: true },
  { x: -70, y: -210, r: 20, s: 18, d: 0.05, heart: false },
  { x: 0, y: -230, r: -10, s: 30, d: 0.02, heart: true },
  { x: 75, y: -200, r: 25, s: 20, d: 0.08, heart: false },
  { x: 125, y: -140, r: 35, s: 24, d: 0.04, heart: true },
  { x: -150, y: -60, r: -45, s: 18, d: 0.1, heart: false },
  { x: 150, y: -50, r: 40, s: 20, d: 0.12, heart: true },
  { x: -40, y: -140, r: 15, s: 16, d: 0.14, heart: true },
  { x: 45, y: -130, r: -20, s: 14, d: 0.16, heart: false },
]

function Celebration({ onDone }: { onDone: () => void }) {
  const c = useRecipesCopy().cook
  const calm = useReducedMotion()
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-10 text-center" data-testid="celebration">
      <div className="relative">
        {!calm &&
          CONFETTI.map((piece, i) => (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2"
              initial={{ x: -piece.s / 2, y: 0, scale: 0.2, opacity: 0, rotate: 0 }}
              animate={{ x: piece.x - piece.s / 2, y: piece.y, scale: 1, opacity: [0, 1, 1, 0.85], rotate: piece.r }}
              transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.15 + piece.d }}
              aria-hidden
            >
              {piece.heart ? <Heart size={piece.s} /> : <Sparkle size={piece.s} />}
            </motion.span>
          ))}
        <motion.div initial={calm ? false : { scale: 0.6, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
          <Mascot size={148} mood="love" />
        </motion.div>
      </div>
      <h2 className="mt-5 text-2xl">{c.doneTitle}</h2>
      <p className="mt-2 font-script text-3xl leading-tight text-rose-ink">{c.doneBody}</p>
      <Button size="lg" className="mt-8" onClick={onDone}>
        {c.doneAction}
      </Button>
    </div>
  )
}

// ------------------------------------------------------------- ingredients --

function IngredientSheet({ dish, servings, open, onClose }: { dish: Dish; servings: number; open: boolean; onClose: () => void }) {
  const t = useT()
  const c = useRecipesCopy().cook
  const lang = useLang()
  const ingredients = dish.recipe.ingredients ?? []
  const factor = scaleFactor(dish.recipe.servings ?? DEFAULT_SERVINGS, servings)
  const done = checkedCount(dish.id)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.ingredients}
      footer={
        <div className="flex items-center gap-3">
          <Button variant="quiet" disabled={done === 0} onClick={() => uncheckAll(dish.id)}>
            {c.uncheck}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            {t.actions.done}
          </Button>
        </div>
      }
    >
      <p className="text-xs font-bold text-ink-soft">{done === ingredients.length && done > 0 ? c.allReady : c.forServings(t.common.servings(servings))}</p>
      <ul className="mt-2" data-testid="checklist">
        {ingredients.map((ingredient, i) => {
          const { amount, name } = formatIngredient(ingredient, factor, lang)
          const checked = isChecked(dish.id, i)
          return (
            <li key={i} className="border-b border-line last:border-b-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => {
                  buzz(8)
                  toggleChecked(dish.id, i)
                }}
                className="flex min-h-13 w-full items-center gap-3 py-2 text-left"
              >
                <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150', checked ? 'border-rose bg-rose text-on-rose' : 'border-line-strong')}>
                  {checked && <Icon name="check" size={18} />}
                </span>
                <span className={cx('min-w-0 flex-1 break-words text-base', checked && 'text-ink-soft line-through')}>
                  {amount && <span className="tabular font-extrabold">{amount} </span>}
                  {name}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

// ---------------------------------------------------------------- the step --

function StepView({ dish, step, index, servings }: { dish: Dish; step: Step; index: number; servings: number }) {
  const c = useRecipesCopy()
  const lang = useLang()
  const ingredients = dish.recipe.ingredients ?? []
  const factor = scaleFactor(dish.recipe.servings ?? DEFAULT_SERVINGS, servings)
  const mentioned = useMemo(() => ingredientsForStep(step.text, ingredients), [step.text, ingredients])
  return (
    <>
      <p className={cx('whitespace-pre-line break-words font-bold leading-snug', step.text.length > 240 ? 'text-lg' : 'text-xl')} data-testid="cook-step">
        {step.text}
      </p>
      {mentioned.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-extrabold text-ink-soft">{c.cook.forThisStep}</p>
          <ul className="mt-1.5 flex flex-wrap gap-2" data-testid="step-ingredients">
            {mentioned.map((i) => {
              const { amount, name } = formatIngredient(ingredients[i], factor, lang)
              return (
                <li key={i} className="rounded-full bg-blush px-3.5 py-1.5 text-sm">
                  {amount && <span className="tabular font-extrabold">{amount} </span>}
                  {name}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {step.timerSeconds ? <TimerDial dishId={dish.id} step={index} seconds={step.timerSeconds} /> : null}
      {step.photoId && <PhotoImg photoId={step.photoId} variant="full" alt={c.dish.photoAlt(dish.name, index + 1)} className="mt-6 aspect-[4/3] w-full rounded-card" />}
    </>
  )
}

/**
 * One step sliding in or out. While a step is on its way out it is switched off:
 * it cannot be tapped and screen readers no longer read it.
 */
function StepSlide({ direction, label, onSwipe, children }: { direction: number; label: string; onSwipe: (by: 1 | -1) => void; children: ReactNode }) {
  const present = useIsPresent()
  const calm = useReducedMotion()
  return (
    <motion.section
      custom={direction}
      variants={{
        enter: (dir: number) => ({ x: calm ? 0 : dir * 56, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (dir: number) => ({ x: calm ? 0 : dir * -56, opacity: 0 }),
      }}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: 'spring', stiffness: 460, damping: 40 }}
      drag={present ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.3}
      onDragEnd={(_, info) => {
        if (info.offset.x < -64 || info.velocity.x < -500) onSwipe(1)
        else if (info.offset.x > 64 || info.velocity.x > 500) onSwipe(-1)
      }}
      aria-label={label}
      aria-hidden={present ? undefined : true}
      inert={!present}
      data-testid={present ? 'current-step' : undefined}
      className="absolute inset-0 touch-pan-y overflow-y-auto px-5 pb-8 pt-6"
    >
      {children}
    </motion.section>
  )
}

function Cooking({ dish, servings }: { dish: Dish; servings: number }) {
  const c = useRecipesCopy().cook
  useCookStore()
  useWatching(dish.id)
  const awake = useWakeLock()
  const [sound, setSound] = useTimerSound()
  const steps = dish.recipe.steps ?? []
  const total = steps.length
  const index = Math.min(getStep(dish.id), total - 1)
  const [direction, setDirection] = useState(1)
  const [listOpen, setListOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const ingredientCount = (dish.recipe.ingredients ?? []).length
  const last = index === total - 1

  const leave = () => back(`/recipes/${dish.id}`)
  const go = (to: number) => {
    if (to < 0 || to >= total || to === index) return
    setDirection(to > index ? 1 : -1)
    setStep(dish.id, to)
    buzz(8)
  }
  const finish = () => {
    buzz([40, 60, 40, 60, 140])
    endSession(dish.id)
    setFinished(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (listOpen || finished) return
      if (event.key === 'ArrowRight') go(index + 1)
      if (event.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const doneTimers = timersOf(dish.id).filter((timer) => timer.state === 'done')

  return (
    <div className="gingham fixed inset-0 z-50 flex flex-col bg-ground" data-testid="cook-mode">
      <div className="app-column flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-line px-2 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-1">
            <IconButton icon="close" label={c.leave} onClick={leave} />
            <div className="min-w-0 flex-1 text-center">
              <h1 className="truncate text-lg" data-testid="cook-progress">
                {finished ? dish.name : c.stepOf(index + 1, total)}
              </h1>
              {!finished && <p className="truncate text-xs font-bold text-ink-soft">{dish.name}</p>}
            </div>
            <RoundButton label={sound ? c.soundOn : c.soundOff} pressed={sound} onClick={() => setSound(!sound)}>
              <LineIcon name={sound ? 'bell' : 'bellOff'} className={sound ? 'text-rose-ink' : 'text-ink-soft'} />
            </RoundButton>
          </div>
          {!finished && (
            <div className="mt-2 flex gap-1 px-2" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label={c.stepOf(index + 1, total)}>
              {steps.map((_, i) => (
                <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-200', i <= index ? 'bg-rose-ink' : 'bg-line-strong')} />
              ))}
            </div>
          )}
        </header>

        {finished ? (
          <Celebration onDone={leave} />
        ) : (
          <>
            <OtherTimers dishId={dish.id} current={index} onGo={go} />
            <p className="sr-only" role="status">
              {doneTimers.map((timer) => timer.doneMessage).join('. ')}
            </p>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <AnimatePresence initial={false} custom={direction}>
                <StepSlide key={index} direction={direction} label={c.stepOf(index + 1, total)} onSwipe={(by) => go(index + by)}>
                  <StepView dish={dish} step={steps[index]} index={index} servings={servings} />
                </StepSlide>
              </AnimatePresence>
            </div>

            <footer className="shrink-0 rounded-t-sheet border-x border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1.5">
              {ingredientCount > 0 && (
                <button type="button" aria-haspopup="dialog" aria-label={c.ingredientsCount(checkedCount(dish.id), ingredientCount)} onClick={() => setListOpen(true)} className="flex min-h-12 w-full flex-col items-center">
                  <span className="h-1.5 w-11 rounded-full bg-line-strong" aria-hidden />
                  <span className="mt-1.5 flex w-full items-center justify-between gap-3 px-1">
                    <span className="flex items-center gap-2 text-sm font-extrabold">
                      <LineIcon name="list" size={20} />
                      {c.ingredients}
                    </span>
                    <span className="tabular flex items-center gap-1 text-xs font-bold text-ink-soft">
                      {checkedCount(dish.id)}/{ingredientCount}
                      <LineIcon name="up" size={18} />
                    </span>
                  </span>
                </button>
              )}
              <div className={cx('grid grid-cols-2 gap-3', ingredientCount > 0 ? 'mt-2' : 'mt-3')}>
                <Button variant="secondary" size="lg" className="px-4" disabled={index === 0} onClick={() => go(index - 1)}>
                  {c.back}
                </Button>
                <Button size="lg" className="px-4" onClick={() => (last ? finish() : go(index + 1))}>
                  {last ? c.finish : c.next}
                </Button>
              </div>
              {awake && (
                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-2xs font-bold text-ink-soft" data-testid="awake">
                  <span className="size-1.5 rounded-full bg-sage-ink" aria-hidden />
                  {c.awake}
                </p>
              )}
            </footer>
          </>
        )}
      </div>
      <IngredientSheet dish={dish} servings={servings} open={listOpen} onClose={() => setListOpen(false)} />
    </div>
  )
}

/** `/recipes/:id/cook`, optionally with `?servings=4`. */
export function CookMode({ id, route }: { id: ID; route: Route }) {
  const c = useRecipesCopy()
  const dish = useDish(id)
  const steps = dish?.recipe.steps ?? []
  if (!dish || steps.length === 0) {
    return (
      <div className="gingham fixed inset-0 z-50 flex flex-col bg-ground">
        <div className="px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <IconButton icon="close" label={c.cook.leave} onClick={() => back(`/recipes/${id}`)} />
        </div>
        <div className="grid flex-1 place-items-center px-6 text-center">{dish === undefined ? <SteamLoader /> : <p className="text-lg font-bold">{dish === null ? c.dish.goneTitle : c.cook.noSteps}</p>}</div>
      </div>
    )
  }
  const asked = Number(route.query.get('servings'))
  const servings = Number.isFinite(asked) && asked >= 1 ? Math.min(Math.round(asked), 99) : (getChosenServings(id) ?? dish.recipe.servings ?? DEFAULT_SERVINGS)
  return <Cooking dish={dish} servings={servings} />
}
