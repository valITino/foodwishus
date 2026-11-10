import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { wipeIfAsked } from './data/wipe'
import { getLang } from './i18n'
import { initTheme } from './ui/theme'
import './ui/styles.css'

initTheme()

// Development only: lets end-to-end tests set up data and wait for exact moments.
//   await page.evaluate(() => window.__foodwishus.actions.createDish({ name: 'Rösti' }))
if (import.meta.env.DEV) {
  void Promise.all([import('./data/app'), import('./data/actions')]).then(([app, actions]) => {
    Object.assign(window, { __foodwishus: { db: app.db, store: app.store, sync: app.sync, backend: app.backend, actions } })
  })
}
document.documentElement.lang = getLang()

// A device that was logged out drops its old copy of the kitchen before any screen reads from it.
void wipeIfAsked().then(() => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
