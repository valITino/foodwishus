// "Recipe from a link": paste a link (or share one to the app), set the switches, and
// Fork fills in the dish form. Nothing is saved here: the form is where she checks it.
// The same from photos of a recipe (a cookbook page, a handwritten card, a screenshot).

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { navigate, type Route } from '../../app/router'
import { isDemo } from '../../data/app'
import { DAILY_TICKETS, PHOTO_LIMITS } from '../../data/backend'
import { mostUsedTags, readProblem, readRecipe, readRecipePhotos, type ReadProblem } from '../../data/helper'
import { setPref, usePref } from '../../data/prefs'
import { useDishes } from '../../data/queries'
import { useCopy, useLang } from '../../i18n'
import { Button, Card, Field, PageHeader, Screen, Segmented, SteamLoader, toast, Toggle } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { assistantCopy } from '../assistant/copy'
import { PhotoButtons, PhotoStrip, usePickedPhotos } from '../assistant/photos'
import { useRecipesCopy } from './copy'
import { dishFromPage, draftFromCard, handOver, linkIn, pictureFile, siteName } from './importLogic'
import { emptyDraft } from './logic'
import { BottomBar, LineIcon } from './parts'

/** Problems that adding the dish by hand does not get around. */
const NO_WAY_AROUND: readonly ReadProblem[] = ['not_signed_in', 'not_member', 'bad_request', 'bad_link']

/** `/recipes/import`, optionally with `?link=` (that is how a link shared from another app arrives) or `?way=photo`. */
export function ImportPage({ route }: { route: Route }) {
  const c = useRecipesCopy().link
  const lang = useLang()
  const translate = usePref('linkTranslate')
  const metric = usePref('linkMetric')
  const photo = usePref('linkPhoto')
  // Calories are a kitchen's choice: where they are not shown, nothing is estimated.
  const showCalories = usePref('showCalories')
  const calories = usePref('linkCalories')
  const dishes = useDishes({ includeArchived: true })
  const [link, setLink] = useState(() => route.query.get('link') ?? '')
  /** Where the recipe is: behind a link, or on photos. */
  const [way, setWay] = useState<'link' | 'photo'>(() => (route.query.get('way') === 'photo' ? 'photo' : 'link'))
  const photos = usePickedPhotos(PHOTO_LIMITS.photos)
  const photoWords = useCopy(assistantCopy).photos
  const [reading, setReading] = useState(false)
  // The demo kitchen says so before anyone has typed a link in vain.
  const [problem, setProblem] = useState<ReadProblem | null>(isDemo ? 'demo' : null)
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'

  // Whoever leaves while Fork is still reading does not get pulled into a form later.
  const here = useRef(true)
  useEffect(() => {
    here.current = true
    return () => {
      here.current = false
    }
  }, [])

  /** The dish that was made from this page before, so nothing ends up in the book twice by accident. */
  const known = (address: string | null) => {
    const dish = address ? dishFromPage(dishes ?? [], address) : null
    return dish ? { id: dish.id, name: dish.name } : null
  }
  const already = known(linkIn(link))
  const problemBox = useRef<HTMLDivElement>(null)

  const paste = async () => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      toast(c.pasteFailed, 'oops')
      return
    }
    const found = linkIn(text)
    if (!found) {
      toast(c.pasteEmpty, 'oops')
      return
    }
    setLink(found)
    if (!isDemo) setProblem(null)
  }

  const read = async (event?: FormEvent) => {
    event?.preventDefault()
    if (reading) return
    const found = linkIn(link)
    if (!found) {
      setProblem('bad_link')
      document.getElementById('recipe-link')?.focus()
      return
    }
    setProblem(null)
    setReading(true)
    try {
      const result = await readRecipe(found, { lang, translate, metric, photo, nutrition: showCalories && calories })
      if (!here.current) return
      const ticket = handOver({
        draft: draftFromCard(result.card, result.source.url, mostUsedTags(dishes ?? [], 200)),
        cover: pictureFile(result.photo),
        read: { site: siteName(result.source), by: result.by, checks: result.card.checks, already: known(result.source.url) },
      })
      // The form takes this page's place: back from it leads to where she came from.
      navigate(`/recipes/new?from=${ticket}`, { replace: true })
    } catch (error) {
      if (!here.current) return
      setReading(false)
      setProblem(readProblem(error))
      // The button that was tapped is back, but focus is not: hand it to the message.
      requestAnimationFrame(() => problemBox.current?.focus())
    }
  }

  /** The same from photos: Fork reads the recipe off them, and the form opens filled in. */
  const readPhotos = async () => {
    if (reading || photos.picked.length === 0) return
    setProblem(null)
    setReading(true)
    try {
      const result = await readRecipePhotos(photos.picked.map((picked) => picked.file), { lang, translate, metric, nutrition: showCalories && calories })
      if (!here.current) return
      const ticket = handOver({ draft: draftFromCard(result.card, '', mostUsedTags(dishes ?? [], 200)), cover: null, read: { site: c.fromPhoto, by: 'helper', checks: result.card.checks, already: null } })
      navigate(`/recipes/new?from=${ticket}`, { replace: true })
    } catch (error) {
      if (!here.current) return
      setReading(false)
      setProblem(readProblem(error))
      requestAnimationFrame(() => problemBox.current?.focus())
    }
  }

  const byPhoto = way === 'photo'
  const title = byPhoto ? c.photoTitle : c.title
  const problemWords = (why: ReadProblem): string => (byPhoto && c.photoProblems[why]) || (why === 'limit' ? c.problems.limit(DAILY_TICKETS) : c.problems[why])

  /** The way out when a page cannot be read: the empty form, with the link already noted as its source. */
  const byHand = () => {
    const ticket = handOver({ draft: { ...emptyDraft(), sourceUrl: linkIn(link) ?? '' }, cover: null, read: null })
    navigate(`/recipes/new?from=${ticket}`, { replace: true })
  }

  if (reading) {
    return (
      <Screen>
        <PageHeader title={title} backTo="/recipes" />
        <main className="app-column px-6 pt-12 text-center">
          <SteamLoader label={byPhoto ? c.readingPhoto : c.reading} />
          <p className="text-sm text-ink-soft">{c.readingHint}</p>
        </main>
      </Screen>
    )
  }

  return (
    <Screen>
      <PageHeader title={title} backTo="/recipes" />
      <main className="app-column flex flex-col gap-5 px-4 pb-28 pt-5">
        <div className="flex items-center gap-4 px-1">
          <Mascot size={72} mood="happy" label="" className="shrink-0" />
          <p className="min-w-0 text-sm font-semibold leading-snug">{byPhoto ? c.photoIntro : c.intro}</p>
        </div>

        <Segmented
          label={c.ways}
          value={way}
          options={[
            { value: 'link', label: c.way.link },
            { value: 'photo', label: c.way.photo },
          ]}
          onChange={(next) => {
            setWay(next)
            // What went wrong with a link says nothing about a photo, and the other way round.
            setProblem(isDemo ? 'demo' : null)
          }}
        />

        {byPhoto && (
          <Card className="flex flex-col gap-3" data-testid="recipe-photos">
            <p className="text-sm leading-snug">{c.photoHint}</p>
            <PhotoStrip picked={photos.picked} words={photoWords} onRemove={photos.remove} />
            <PhotoButtons words={photoWords} onFiles={photos.add} disabled={photos.full} testId="recipe-photo" />
            <p className="text-xs leading-relaxed text-ink-soft">{c.photoPrivacy}</p>
          </Card>
        )}

        <form id="link-form" hidden={byPhoto} onSubmit={(event) => void read(event)} noValidate>
          <Card className="flex flex-col gap-3">
            <Field
              id="recipe-link"
              label={c.field}
              placeholder="https://"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={link}
              aria-invalid={problem === 'bad_link' || undefined}
              onChange={(event) => {
                setLink(event.target.value)
                if (problem && problem !== 'demo') setProblem(null)
              }}
            />
            {canPaste && !link.trim() && (
              <Button variant="secondary" block icon={<LineIcon name="link" size={20} />} onClick={() => void paste()}>
                {c.paste}
              </Button>
            )}
          </Card>
        </form>

        {already && !reading && !byPhoto && (
          <Card tone="blush" data-testid="link-known">
            <p className="text-sm font-extrabold">{c.knownTitle}</p>
            <p className="mt-1 break-words text-sm leading-snug">{c.knownBody(already.name)}</p>
            <Button variant="secondary" className="mt-3" onClick={() => navigate(`/recipes/${already.id}`, { replace: true })}>
              {c.openKnown}
            </Button>
          </Card>
        )}

        {problem && (
          <div ref={problemBox} tabIndex={-1} role="alert" className="rounded-card focus:outline-none">
            <Card tone="blush" data-testid="link-problem">
              <p className="text-sm font-extrabold">{problem === 'demo' ? c.demoTitle : c.problemTitle}</p>
              <p className="mt-1 text-sm leading-snug">{problemWords(problem)}</p>
              {!NO_WAY_AROUND.includes(problem) && (byPhoto ? problem !== 'bad_photo' && problem !== 'too_big' && problem !== 'demo' : linkIn(link)) && (
                <Button variant="secondary" className="mt-3" onClick={byPhoto ? () => navigate('/recipes/new', { replace: true }) : byHand}>
                  {c.byHand}
                </Button>
              )}
            </Card>
          </div>
        )}

        <section aria-labelledby="link-options">
          <h2 id="link-options" className="mb-2.5 px-1 text-lg">
            {c.options}
          </h2>
          <Card pad={false} className="divide-y divide-line px-4 py-1">
            <Toggle label={c.translate} checked={translate} onChange={(on) => setPref('linkTranslate', on)} />
            <Toggle label={c.metric} checked={metric} onChange={(on) => setPref('linkMetric', on)} />
            {!byPhoto && <Toggle label={c.photo} checked={photo} onChange={(on) => setPref('linkPhoto', on)} />}
            {showCalories && <Toggle label={c.calories} checked={calories} onChange={(on) => setPref('linkCalories', on)} />}
          </Card>
        </section>

        <p className="px-1 text-xs leading-relaxed text-ink-soft">{c.honest}</p>
      </main>

      <BottomBar>
        {byPhoto ? (
          <Button block disabled={photos.picked.length === 0} onClick={() => void readPhotos()}>
            {c.read}
          </Button>
        ) : (
          <Button block type="submit" form="link-form">
            {c.read}
          </Button>
        )}
      </BottomBar>
    </Screen>
  )
}
