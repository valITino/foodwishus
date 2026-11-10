// The frame around every screen: decides between onboarding and the app, switches
// tabs, and hosts the things that float above pages (add sheet, toasts).

import { lazy, Suspense, useEffect, useState } from 'react'
import { boot, isDemo, leaveDemo, useSyncStatus } from '../data/app'
import { useMe } from '../data/hooks'
import { CockpitRoutes, CockpitScreen } from '../features/cockpit'
import { Onboarding, PausedScreen, usePaused } from '../features/onboarding'
import { PlanningRoutes, TodayScreen, WeekScreen, WishlistScreen } from '../features/planning'
import { RecipeBookScreen, RecipesRoutes } from '../features/recipes'
import { isReviewPath, ReviewRoutes } from '../features/review'
import { SettingsRoutes } from '../features/settings'
import { Styleguide } from '../features/styleguide/Styleguide'
import { TodayPreview } from '../features/styleguide/TodayPreview'
import { useT } from '../i18n'
import { Screen, Sheet, SteamLoader, TabBar, Toaster, type TabId } from '../ui/components'
import { Cloche, Flower } from '../ui/deco/Deco'
import { currentPath, navigate, useRoute } from './router'
import { startSettingsSync } from './settingsSync'

// The sync lab talks to the pretend cloud, so it only exists in development builds.
const SyncLab = import.meta.env.DEV ? lazy(() => import('../features/lab/SyncLab').then((m) => ({ default: m.SyncLab }))) : null

export const TAB_PATHS: Record<TabId, string> = { today: '/', wishlist: '/wishlist', week: '/week', cockpit: '/cockpit', recipes: '/recipes' }
const TAB_BY_PATH = Object.fromEntries(Object.entries(TAB_PATHS).map(([id, path]) => [path, id])) as Record<string, TabId>

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  const choice = 'flex min-h-20 w-full items-center gap-4 rounded-card border-[1.5px] border-line-strong bg-surface p-4 text-left active:translate-y-[2px]'
  return (
    <Sheet open={open} onClose={onClose} title={t.addSheet.title}>
      <div className="flex flex-col gap-3 pb-2">
        <button type="button" className={choice} onClick={() => go('/recipes/new')}>
          <Cloche size={44} />
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.dish}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.dishHint}</span>
          </span>
        </button>
        <button type="button" className={choice} onClick={() => go('/menus/new')}>
          <Flower size={44} />
          <span>
            <span className="block text-base font-extrabold">{t.addSheet.menu}</span>
            <span className="block text-xs text-ink-soft">{t.addSheet.menuHint}</span>
          </span>
        </button>
      </div>
    </Sheet>
  )
}

/** Shown on every screen of the demo kitchen, so it is never mistaken for the real one. */
function DemoBanner() {
  const t = useT()
  return (
    <div className="sticky top-0 z-40 bg-sage text-on-rose">
      <div className="app-column flex min-h-10 items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] text-xs font-extrabold">
        <span>{t.demo.banner}</span>
        <button type="button" className="min-h-10 underline underline-offset-4" onClick={() => void leaveDemo()}>
          {t.demo.leave}
        </button>
      </div>
    </div>
  )
}

export function Shell() {
  const route = useRoute()
  const me = useMe()
  const status = useSyncStatus()
  const paused = usePaused()
  const [adding, setAdding] = useState(false)
  const { path } = route

  useEffect(() => {
    void boot()
    // Language, candlelight and calories follow the person to every device.
    startSettingsSync()
    // Page headers stick below the demo banner instead of hiding under it.
    if (isDemo) document.documentElement.style.setProperty('--banner-h', '2.5rem')
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])

  // Pages that work without a kitchen.
  if (path.startsWith('/styleguide')) return <Styleguide />
  if (path.startsWith('/preview/today')) return <TodayPreview />
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
  else if (tab === 'cockpit') page = <CockpitScreen />
  else if (tab === 'recipes') page = <RecipeBookScreen />
  else if (path.startsWith('/cockpit/dish/')) page = <CockpitRoutes route={route} />
  else if (path.startsWith('/recipes/') || path.startsWith('/menus/')) page = <RecipesRoutes route={route} />
  else if (path.startsWith('/serving/') || path.startsWith('/propose/')) page = <PlanningRoutes route={route} />
  else if (isReviewPath(path)) page = <ReviewRoutes route={route} />
  else if (path.startsWith('/settings')) page = <SettingsRoutes route={route} />
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
      {tab && <TabBar active={tab} onSelect={(id) => navigate(TAB_PATHS[id], { replace: true })} onAdd={() => setAdding(true)} />}
      <AddSheet open={adding} onClose={() => setAdding(false)} />
      <Toaster />
    </>
  )
}
