// "Ask Fork": a talk with the kitchen assistant. Fork knows food, this kitchen (the phone
// tells him with every question) and the app. He never changes anything himself: under an
// answer there can be buttons, and a tap on one is what does it.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { navigate } from '../../app/router'
import { isDemo } from '../../data/app'
import { notePantry, planServing, proposeServing, putOnBasket } from '../../data/actions'
import { cardFromText, mostUsedTags, readProblem, type ReadProblem } from '../../data/helper'
import { usePref } from '../../data/prefs'
import { useCopy, useLang, useT } from '../../i18n'
import { Button, Card, Chip, PageHeader, Screen, Sheet, TextArea, toast } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { defaultCook } from '../planning/logic'
import { StickyFooter, useKitchen, useWhen, type Kitchen } from '../planning/shared'
import { draftFromCard, handOver } from '../recipes/importLogic'
import { askAbout } from './ask'
import { assistantCopy, PLACE_ROUTES, problemWords, type AssistantCopy } from './copy'
import { loadTalk, saveTalk, turnId, type Offer, type Turn } from './talk'

/** The entry on Today, next to the basket and the bell. */
export function ForkButton() {
  const c = useCopy(assistantCopy)
  return (
    <button
      type="button"
      data-testid="fork-button"
      aria-label={c.entry}
      onClick={() => navigate('/fork')}
      className="grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong bg-surface transition-transform duration-100 active:scale-90"
    >
      <Mascot size={24} mood="happy" label="" />
    </button>
  )
}

interface OfferProps {
  offer: Offer
  /** What came of it, once it was tapped. */
  done: string | undefined
  kitchen: Kitchen
  c: AssistantCopy
  busy: boolean
  onTap: () => void
}

/** One button under an answer, or the line that says what it did. */
function OfferButton({ offer, done, kitchen, c, busy, onTap }: OfferProps) {
  const when = useWhen(kitchen.today)
  if (done !== undefined) {
    return (
      <p className="flex min-h-11 items-center gap-2 px-1 text-sm font-bold" data-testid="offer-done">
        <Icon name="check" size={18} className="shrink-0" /> {done}
      </p>
    )
  }
  const dish = 'dishId' in offer ? kitchen.dishes.get(offer.dishId) : undefined
  if ('dishId' in offer && (!dish || dish.deletedAt)) return <p className="px-1 text-xs text-ink-soft">{c.offers.gone}</p>
  if (offer.kind === 'plan' && offer.day < kitchen.today) return <p className="px-1 text-xs text-ink-soft">{c.offers.over}</p>

  const things = offer.kind === 'basket' || offer.kind === 'pantry' ? offer.lines : null
  const label =
    offer.kind === 'plan'
      ? c.offers.plan(dish?.name ?? '', when.atInline(offer.day, offer.slot, 'long'))
      : offer.kind === 'wish'
        ? c.offers.wish(dish?.name ?? '')
        : offer.kind === 'dish'
          ? c.offers.dish(dish?.name ?? '')
          : offer.kind === 'basket'
            ? c.offers.basket(offer.lines.length)
            : offer.kind === 'pantry'
              ? c.offers.pantry(offer.lines.length)
              : offer.kind === 'recipe'
                ? c.offers.recipe
                : c.offers.go[offer.place]
  return (
    <div>
      {things && <p className="mb-1.5 px-1 text-xs text-ink-soft">{things.map((line) => (line.amount ? `${line.name} ${line.amount}` : line.name)).join(', ')}</p>}
      <Button variant="secondary" block disabled={busy} onClick={onTap} className="h-auto min-h-12 whitespace-normal py-2 text-left leading-snug">
        {label}
      </Button>
    </div>
  )
}

export function AssistantScreen() {
  const t = useT()
  const lang = useLang()
  const c = useCopy(assistantCopy)
  const kitchen = useKitchen()
  const when = useWhen(kitchen?.today ?? '')
  const showCalories = usePref('showCalories')
  const meId = kitchen?.meId
  const [turns, setTurns] = useState<Turn[] | null>(null)
  const [text, setText] = useState('')
  /** The question that is on its way. It joins the talk when its answer is there. */
  const [waiting, setWaiting] = useState<string | null>(null)
  const [problem, setProblem] = useState<{ why: ReadProblem; question: string } | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [wiping, setWiping] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const here = useRef(true)
  useEffect(() => {
    here.current = true
    return () => {
      here.current = false
    }
  }, [])

  // The talk is this person's, on this phone.
  useEffect(() => {
    if (meId) setTurns(loadTalk(meId, isDemo))
  }, [meId])

  // What is new shows: the answer, the waiting line, or what went wrong.
  const last = turns?.at(-1)?.id
  useEffect(() => {
    if (last || waiting || problem) end.current?.scrollIntoView({ block: 'end' })
  }, [last, waiting, problem])

  if (!kitchen || !meId || turns === null) {
    return (
      <Screen>
        <PageHeader title={c.title} backTo="/" />
      </Screen>
    )
  }

  /** Change the talk as it is now (an answer may have arrived while a button was working), and keep it. */
  function change(update: (talk: Turn[]) => Turn[]) {
    setTurns((current) => {
      const next = update(current ?? [])
      saveTalk(meId as string, next, isDemo)
      return next
    })
  }

  async function ask(question: string) {
    const asked = question.trim()
    if (!asked || waiting !== null || !kitchen) return
    setText('')
    setProblem(null)
    setWaiting(asked)
    const before = turns ?? []
    try {
      const answer = await askAbout(before, asked, { meId: kitchen.meId, lang, calories: showCalories })
      if (!here.current) return
      const said: Turn[] = [{ id: turnId(), who: 'me', text: asked }, { id: turnId(), who: 'fork', text: answer.text, offers: answer.offers }]
      change((talk) => [...talk, ...said])
      setLeft(answer.left)
    } catch (error) {
      if (!here.current) return
      // The question is not lost: it waits in the note, one tap from being asked again.
      setProblem({ why: readProblem(error), question: asked })
    }
    setWaiting(null)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void ask(text)
  }

  /** A button was tapped: now the app does it, and the button turns into what came of it. */
  async function run(turn: Turn, index: number) {
    const offer = turn.offers?.[index]
    if (!offer || working !== null || !kitchen) return
    const mark = (done: string) => {
      toast(done)
      change((talk) => talk.map((entry) => (entry.id === turn.id ? { ...entry, done: { ...entry.done, [index]: done } } : entry)))
    }
    if (offer.kind === 'dish') return navigate(`/recipes/${offer.dishId}`)
    if (offer.kind === 'go') return navigate(PLACE_ROUTES[offer.place])
    setWorking(`${turn.id}/${index}`)
    try {
      const cook = kitchen.me ? defaultCook(kitchen.me, kitchen.partner) : kitchen.meId
      if (offer.kind === 'plan') {
        // A wish for this dish is the meal that gets its day: no second one next to it.
        const wish = kitchen.servings.find((serving) => serving.status === 'wishlist' && serving.dishId === offer.dishId)
        if (wish) await planServing(wish.id, offer.day, offer.slot)
        else await proposeServing({ dishId: offer.dishId, cookedBy: cook, plan: { date: offer.day, slot: offer.slot } })
        mark(c.offers.planned(when.atInline(offer.day, offer.slot, 'long')))
      } else if (offer.kind === 'wish') {
        await proposeServing({ dishId: offer.dishId, cookedBy: cook })
        mark(c.offers.wished)
      } else if (offer.kind === 'basket') {
        const { added, there } = await putOnBasket(offer.lines.map((line) => ({ name: line.name, amount: line.amount })))
        mark(c.offers.basketDone(added, there))
      } else if (offer.kind === 'pantry') {
        await notePantry(offer.lines.map((line) => ({ name: line.name, amount: line.amount })))
        mark(c.offers.pantryDone)
      } else {
        // The recipe in this answer becomes a card, and the card fills the dish form to look over.
        const result = await cardFromText(turn.text, lang, showCalories)
        if (!here.current) return
        const ticket = handOver({ draft: draftFromCard(result.card, '', mostUsedTags([...kitchen.dishes.values()], 200)), cover: null, read: { site: c.fromFork, by: 'helper', checks: result.card.checks, already: null } })
        navigate(`/recipes/new?from=${ticket}`)
        return
      }
    } catch (error) {
      if (!here.current) return
      const why = readProblem(error)
      toast(offer.kind === 'recipe' ? problemWords(c, why) : t.common.somethingWrong, 'oops')
    }
    if (here.current) setWorking(null)
  }

  function startOver() {
    setWiping(false)
    change(() => [])
    setProblem(null)
    setLeft(null)
    toast(c.startedOver)
  }

  const empty = turns.length === 0 && waiting === null && problem === null

  return (
    <Screen>
      <PageHeader
        title={c.title}
        backTo="/"
        action={
          turns.length > 0 ? (
            <Button variant="quiet" onClick={() => setWiping(true)}>
              {c.startOver}
            </Button>
          ) : undefined
        }
      />
      <main className="app-column flex flex-col gap-4 px-4 pb-48 pt-4">
        <div className="flex items-start gap-3">
          <Mascot size={56} mood="happy" label="" className="shrink-0" />
          <p className="min-w-0 flex-1 pt-1 text-sm font-bold">{c.hello}</p>
        </div>

        {empty && (
          <>
            <div>
              <p className="mb-2 px-1 text-xs font-extrabold">{c.ideasLabel}</p>
              <div className="flex flex-col items-start gap-2">
                {c.ideas.map((idea) => (
                  <Chip key={idea} onClick={() => void ask(idea)} className="h-auto min-h-11 whitespace-normal py-2 text-left leading-snug">
                    {idea}
                  </Chip>
                ))}
              </div>
            </div>
            <p className="px-1 text-xs text-ink-soft">{c.about}</p>
          </>
        )}

        {(turns.length > 0 || waiting !== null) && (
          <ol aria-label={c.talk} className="flex flex-col gap-3" data-testid="talk">
            {turns.map((turn) =>
              turn.who === 'me' ? (
                <li key={turn.id} className="ml-10 self-end rounded-card bg-blush px-4 py-2.5" data-testid="said-me">
                  <span className="sr-only">{c.you}: </span>
                  <p className="whitespace-pre-line break-words text-sm font-bold">{turn.text}</p>
                </li>
              ) : (
                <li key={turn.id} className="mr-6">
                  <Card pad={false} className="px-4 py-3" data-testid="said-fork">
                    <span className="sr-only">{c.fork}: </span>
                    <p className="whitespace-pre-line break-words text-sm leading-relaxed">{turn.text}</p>
                  </Card>
                  {turn.offers && turn.offers.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2" data-testid="offers">
                      {turn.offers.map((offer, index) => (
                        <OfferButton key={index} offer={offer} done={turn.done?.[index]} kitchen={kitchen} c={c} busy={working !== null} onTap={() => void run(turn, index)} />
                      ))}
                      {working?.startsWith(`${turn.id}/`) && turn.offers[Number(working.split('/')[1])]?.kind === 'recipe' && (
                        <p role="status" className="px-1 text-xs font-bold text-ink-soft">
                          {c.offers.writing}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ),
            )}
            {waiting !== null && (
              <li className="ml-10 self-end rounded-card bg-blush px-4 py-2.5 opacity-70" data-testid="said-me">
                <span className="sr-only">{c.you}: </span>
                <p className="whitespace-pre-line break-words text-sm font-bold">{waiting}</p>
              </li>
            )}
          </ol>
        )}

        {waiting !== null && (
          <p role="status" className="flex items-center gap-2 px-1 text-sm font-bold text-ink-soft" data-testid="thinking">
            <Mascot size={28} mood="happy" label="" className="shrink-0 motion-safe:animate-pulse" /> {c.thinking}
          </p>
        )}

        {problem && (
          <Card pad={false} className="flex flex-col gap-3 p-4" data-testid="fork-problem">
            <p role="alert" className="text-sm font-bold">
              {problemWords(c, problem.why)}
            </p>
            <p className="text-xs text-ink-soft">{problem.question}</p>
            {problem.why !== 'demo' && problem.why !== 'helper_off' && problem.why !== 'limit' && (
              <Button variant="secondary" onClick={() => void ask(problem.question)}>
                {c.again}
              </Button>
            )}
          </Card>
        )}

        {left !== null && left <= 5 && !problem && <p className="px-1 text-xs text-ink-soft">{c.left(left)}</p>}
        <div ref={end} className="scroll-mb-48" />
      </main>

      <StickyFooter>
        <form onSubmit={submit} className="flex items-end gap-2">
          <TextArea className="min-w-0 flex-1" label={c.field} placeholder={c.placeholder} rows={2} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
          <Button type="submit" className="min-h-13 shrink-0 px-5" disabled={!text.trim() || waiting !== null}>
            {c.ask}
          </Button>
        </form>
      </StickyFooter>

      <Sheet
        open={wiping}
        onClose={() => setWiping(false)}
        title={c.startOverTitle}
        footer={
          <div className="flex flex-col gap-1">
            <Button size="lg" block onClick={startOver}>
              {c.startOver}
            </Button>
            <Button variant="quiet" onClick={() => setWiping(false)}>
              {t.actions.cancel}
            </Button>
          </div>
        }
      >
        <p className="text-sm">{c.startOverBody}</p>
      </Sheet>
    </Screen>
  )
}
