// Takes Android-sized screenshots of the styleguide and previews, in light and
// candlelight mode. Needs the dev server running:  npm run dev  →  node tools/shots.mjs [outDir] [scale]
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'shots'
const scale = Number(process.argv[3] ?? 1)
const base = process.env.SHOTS_URL ?? `http://127.0.0.1:${process.env.FOODWISHUS_PORT ?? 5173}`
const pages = [
  ['today', '/#/preview/today', false],
  ['styleguide', '/#/styleguide', true],
  ['home', '/#/', false],
]

const browser = await chromium.launch()
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: scale, hasTouch: true, isMobile: true, locale: 'en-GB' })
  await context.addInitScript((t) => {
    localStorage.setItem('foodwishus.theme', t)
    localStorage.setItem('foodwishus.lang', 'en')
  }, theme)
  const page = await context.newPage()
  const problems = []
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  page.on('pageerror', (e) => problems.push(String(e)))
  for (const [name, path, fullPage] of pages) {
    await page.goto(base + path)
    await page.reload()
    await page.waitForTimeout(1400)
    await page.screenshot({ path: `${out}/${name}-${theme}.png`, fullPage })
  }
  if (problems.length) console.log(`[${theme}] console problems:\n  ` + problems.join('\n  '))
  await context.close()
}
await browser.close()
console.log('done')
