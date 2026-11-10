import { lazy, Suspense, useEffect, useState } from 'react'
import { Styleguide } from './features/styleguide/Styleguide'
import { TodayPreview } from './features/styleguide/TodayPreview'
import { Button, SteamLoader } from './ui/components'
import { Mascot } from './ui/deco/Deco'
import { useT } from './i18n'

// The sync lab talks to the pretend cloud, so it only exists in development builds.
const SyncLab = import.meta.env.DEV ? lazy(() => import('./features/lab/SyncLab').then((m) => ({ default: m.SyncLab }))) : null

function useRoute(): string {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

/** Until the real screens land (milestone 3), the front door shows the brand and the way to the styleguide. */
function ComingSoon() {
  const t = useT()
  return (
    <main className="gingham grid min-h-dvh place-items-center bg-ground p-6 text-center">
      <div className="flex flex-col items-center">
        <Mascot size={150} mood="love" />
        <h1 className="mt-3 text-3xl">
          Food<span className="font-semibold italic text-cherry">wish</span>
          <span className="text-rose-ink">Us</span>
        </h1>
        <p className="mt-1 font-script text-3xl text-rose-ink">{t.brand.slogan}</p>
        <p className="mt-5 max-w-[30ch] text-sm text-ink-soft">The kitchen is being set up. Have a look at how it is going to feel.</p>
        <div className="mt-5 flex flex-col gap-3">
          <Button onClick={() => (window.location.hash = '/styleguide')}>See the design</Button>
          <Button variant="secondary" onClick={() => (window.location.hash = '/preview/today')}>
            Preview the Today screen
          </Button>
        </div>
      </div>
    </main>
  )
}

export function App() {
  const route = useRoute()
  if (route.startsWith('/styleguide')) return <Styleguide />
  if (route.startsWith('/preview/today')) return <TodayPreview />
  if (route.startsWith('/lab') && SyncLab) {
    return (
      <Suspense fallback={<SteamLoader />}>
        <SyncLab />
      </Suspense>
    )
  }
  return <ComingSoon />
}
