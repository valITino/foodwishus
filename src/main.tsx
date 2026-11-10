import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { getLang } from './i18n'
import { initTheme } from './ui/theme'
import './ui/styles.css'

initTheme()
document.documentElement.lang = getLang()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
