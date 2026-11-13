// The frame around every screen: decides between onboarding and the app, switches
// tabs, and hosts the things that float above pages (add sheet, toasts).

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { boot, isDemo, leaveDemo, useSyncStatus } from '../data/app'
import { useMe } from '../data/hooks'
import { useUnseenNews } from '../data/queries'
import { AssistantScreen } from '../features/assistant'
import { BasketScreen, useForkWatch } from '../features/basket'
import { NewsScreen } from '../features/news'
import { Onboarding, PausedScreen, usePaused } from '../features/onboarding'
import { LogSheet, PlanningRoutes, TodayPicker, TodayScreen, WeekScreen, WishlistScreen } from '../features/planning'
import { RecipeBookScreen, RecipesRoutes } from '../features/recipes'
import { isReviewPath, ReviewRoutes, usePlate } from '../features/review'
import { SettingsRoutes } from '../features/settings'
import { useT } from '../i18n'
import { Screen, Sheet, SteamLoader, TabBar, Toaster, type TabId } from '../ui/components'
import { Cherry, Cloche, Flower, Mascot } from '../ui/deco/Deco'
import { Icon } from '../ui/deco/Icon'
import { currentPath, navigate, useRoute } from './router'
import { startSettingsSync } from './settingsSync'

// The sync lab talks to the pretend cloud, so it only exists in development builds.
// Loaded when first opened, so the app starts with less to download. The service worker
// saves these pieces too, so they open offline like everything else.
const CockpitScreen = lazy(() => import('../features/cockpit').then((m) => ({ default: m.CockpitScreen })))
const CockpitRoutes = lazy(() => import('../features/cockpit').then((m) => ({ default: m.CockpitRoutes })))
const Styleguide = lazy(() => import('../features/styleguide/Styleguide').then((m) => ({ default: m.Styleguide })))
const TodayPreview = lazy(() => import('../features/styleguide/TodayPreview').then((m) => ({ default: m.TodayPreview })))

/** What shows for the moment a piece is still on its way. */
const loading = (
  <Screen className="grid place-items-center">
    <SteamLoader />
  </Screen>
)

const SyncLab = import.meta.env.DEV ? lazy(() => import('../features/lab/SyncLab').then((m) => ({ default: m.SyncLab }))) : null

export const TAB_PATHS: Record<TabId, string> = { today: '/', wishlist: '/wishlist', week: '/week', cockpit: '/cockpit', recipes: '/recipes' }
const TAB_BY_PATH = Object.fromEntries(Object.entries(TAB_PATHS).map(([id, path]) => [path, id])) as Record<string, TabId>

interface AddSheetProps {
  open: boolean
  onClose: () => void
  onToday: () => void
  onLog: () => void
  /** Opens the camera. Called straight from the tap, or the phone will not open it. */
  onPlate: () => void
}

function AddSheet({ open, onClose, onToday, onLog, onPlate }: AddSheetProps) {
  const t = useT()
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  const choice = 'flex min-h-20 w-full items-center gap-4 rounded-card border-[1.5px] border-line-strong bg-surface p-4 text-left active:translate-y-[2px]'
  return (
    <Sheet open={open} onClose={onClose} title={t.addSheet.title}>
      <div className="flex flex-col gap-3 pb-2">
        {/* The spontaneous way: no wish, no planning ahead. Pick it, and it is today's meal. */}
        <button
          type="button"
          className={choice}
          onClick={() => {
            onClose()
            onToday()
          }}
        >
          <Cherry size={44} />
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.today}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.todayHint}</span>
          </span>
        </button>
        {/* The plate is there and nothing was entered: the camera first, then "What is it?". */}
        <button
          type="button"
          className={choice}
          onClick={() => {
            onPlate()
            onClose()
          }}
        >
          <span className="mx-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-blush">
            <Icon name="camera" size={24} />
          </span>
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.plate}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.plateHint}</span>
          </span>
        </button>
        {/* Eaten, and nobody entered it: today or any day before. */}
        <button
          type="button"
          className={choice}
          onClick={() => {
            onClose()
            onLog()
          }}
        >
          <span className="mx-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-blush">
            <Icon name="calendar" size={24} />
          </span>
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.log}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.logHint}</span>
          </span>
        </button>
        <button type="button" className={choice} onClick={() => go('/recipes/new')}>
          <Cloche size={44} />
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.dish}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.dishHint}</span>
          </span>
        </button>
        {/* Fork reads the page and fills in the dish form. */}
        <button type="button" className={choice} onClick={() => go('/recipes/import')}>
          <Mascot size={40} mood="happy" label="" className="mx-0.5 shrink-0" />
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.link}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.linkHint}</span>
          </span>
        </button>
        <button type="button" className={choice} onClick={() => go('/basket?add=1')}>
          <span className="mx-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-blush">
            <Icon name="basket" size={24} />
          </span>
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.basket}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.basketHint}</span>
          </span>
        </button>
        <button type="button" className={choice} onClick={() => go('/menus/new')}>
          <Flower size={44} />
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.menu}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.menuHint}</span>
          </span>
        </button>
        {/* Not something to add, but where people look for "what else can I do": a question to Fork. */}
        <button type="button" className={choice} onClick={() => go('/fork')}>
          <span className="mx-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-blush">
            <Icon name="note" size={24} />
          </span>
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.fork}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.forkHint}</span>
          </span>
        </button>
      </div>
    </Sheet>
  )
}

/** The add sheet and everything it opens: the two pickers, and the camera for "Take a photo and rate". */
function Adding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pickingToday, setPickingToday] = useState(false)
  const [logging, setLogging] = useState(false)
  const plate = usePlate('add')
  return (
    <>
      <AddSheet open={open} onClose={onClose} onToday={() => setPickingToday(true)} onLog={() => setLogging(true)} onPlate={plate.shoot} />
      <TodayPicker open={pickingToday} onClose={() => setPickingToday(false)} />
      <LogSheet open={logging} onClose={() => setLogging(false)} />
      {plate.parts}
    </>
  )
}

/** Shown on every screen of the demo kitchen, so it is never mistaken for the real one. */
function DemoBanner() {
  const t = useT()
  return (
    <aside aria-label={t.demo.banner} className="sticky top-0 z-40 bg-sage text-on-rose">
      <div className="app-column flex min-h-10 items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] text-xs font-extrabold">
        <span>{t.demo.banner}</span>
        <button type="button" className="min-h-10 underline underline-offset-4" onClick={() => void leaveDemo()}>
          {t.demo.leave}
        </button>
      </div>
    </aside>
  )
}

export function Shell() {
  const route = useRoute()
  const me = useMe()
  const status = useSyncStatus()
  const paused = usePaused()
  const [adding, setAdding] = useState(false)
  // From any tab: a number on Today says the other one did something.
  const unseenNews = useUnseenNews() ?? 0
  const { path } = route
  // Fork checks the plan against the pantry by himself, once somebody is logged in.
  useForkWatch(Boolean(me) && !paused && status.state !== 'locked-out')

  useEffect(() => {
    void boot()
    // Language, candlelight and calories follow the person to every device.
    startSettingsSync()
    // Page headers stick below the demo banner instead of hiding under it.
    if (isDemo) document.documentElement.style.setProperty('--banner-h', '2.5rem')
  }, [])

  const shown = useRef(path)
  useEffect(() => {
    window.scrollTo(0, 0)
    if (shown.current === path) return
    shown.current = path
    // A new page: whatever was tapped is gone, and focus with it. Hand it to the page's
    // title, so a screen reader says where we are and the keyboard starts at the top.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return
      const title = document.querySelector('h1')
      if (!title) return
      title.setAttribute('tabindex', '-1')
      title.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [path])

  // Pages that work without a kitchen.
  if (path.startsWith('/styleguide')) return <Suspense fallback={loading}><Styleguide /></Suspense>
  if (path.startsWith('/preview/today')) return <Suspense fallback={loading}><TodayPreview /></Suspense>
  if (path.startsWith('/lab') && SyncLab) {
    return (
      <Suspense fallback={<SteamLoader />}>
        <SyncLab />
      </Suspense>
    )
  }

  if (me === undefined) {
    return (
      <Screen className="grid place-items-center">
        <SteamLoader />
      </Screen>
    )
  }

  const lockedOut = status.state === 'locked-out'
  if (me === null || lockedOut) {
    return (
      <>
        <Onboarding route={route} lockedOut={lockedOut} />
        <Toaster />
      </>
    )
  }

  // The admin has paused this seat: nothing can be read or changed until it is switched on again.
  if (paused) {
    return (
      <>
        <PausedScreen />
        <Toaster />
      </>
    )
  }

  const tab = TAB_BY_PATH[path]
  let page
  if (tab === 'today') page = <TodayScreen />
  else if (tab === 'wishlist') page = <WishlistScreen />
  else if (tab === 'week') page = <WeekScreen />
  else if (tab === 'cockpit') page = <Suspense fallback={loading}><CockpitScreen /></Suspense>
  else if (tab === 'recipes') page = <RecipeBookScreen />
  else if (path.startsWith('/cockpit/dish/')) page = <Suspense fallback={loading}><CockpitRoutes route={route} /></Suspense>
  else if (path.startsWith('/recipes/') || path.startsWith('/menus/')) page = <RecipesRoutes route={route} />
  else if (path.startsWith('/serving/') || path.startsWith('/propose/')) page = <PlanningRoutes route={route} />
  else if (isReviewPath(path)) page = <ReviewRoutes route={route} />
  else if (path.startsWith('/settings')) page = <SettingsRoutes route={route} />
  else if (path === '/news') page = <NewsScreen />
  else if (path === '/basket') page = <BasketScreen route={route} />
  else if (path === '/fork') page = <AssistantScreen />
  else page = null

  // An address that leads nowhere (an old link, a start-screen path after logging in) goes home.
  if (page === null) {
    const lost = path
    // Only if nobody has navigated in the meantime (the start screens do, right after logging in).
    queueMicrotask(() => {
      if (currentPath() === lost) navigate('/', { replace: true })
    })
    page = <TodayScreen />
  }

  return (
    <>
      {isDemo && <DemoBanner />}
      {page}
      {tab && <TabBar active={tab} onSelect={(id) => navigate(TAB_PATHS[id], { replace: true })} onAdd={() => setAdding(true)} badges={tab === 'today' ? {} : { today: unseenNews }} />}
      <Adding open={adding} onClose={() => setAdding(false)} />
      <Toaster />
    </>
  )
}
