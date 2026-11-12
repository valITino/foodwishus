import { describe, expect, it } from 'vitest'
import { cleanLink, decodeEntities, hostFamily, isPrivateAddress, PageError, pageMeta, pageText, pinTarget, readPage, readPicture, recipeData, type FetchLike } from '../../supabase/functions/ai/page'
import { BLOG, PIN, PIN_WITHOUT_LINK, SHOP, SLOPPY_DATA, SWISS_SITE } from './ai.fixtures'

/** A web made of a few pages. Anything else does not answer. */
function web(pages: Record<string, Response | (() => Response)>): FetchLike & { asked: string[] } {
  const asked: string[] = []
  const fetch: FetchLike = async (url) => {
    asked.push(url)
    const page = pages[url]
    if (!page) throw new Error('getaddrinfo ENOTFOUND')
    return typeof page === 'function' ? page() : page.clone()
  }
  return Object.assign(fetch, { asked })
}
const html = (body: string, type = 'text/html; charset=utf-8') => new Response(body, { headers: { 'content-type': type } })
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } })
const code = (run: Promise<unknown>) => run.then(() => 'no error', (error) => (error instanceof PageError ? error.code : String(error)))

describe('a pasted link', () => {
  it('is found with or without https, with spaces or a sentence around it', () => {
    expect(cleanLink('https://www.lecker-kochen.ch/rezepte/rueeblisuppe')?.href).toBe('https://www.lecker-kochen.ch/rezepte/rueeblisuppe')
    expect(cleanLink('  lecker-kochen.ch/rezepte/zopf  ')?.href).toBe('https://lecker-kochen.ch/rezepte/zopf')
    expect(cleanLink('Schau mal: https://pin.it/AbC123 sieht fein aus')?.href).toBe('https://pin.it/AbC123')
    expect(cleanLink('http://sunnykitchen.com/cornbread#comments')?.href).toBe('http://sunnykitchen.com/cornbread')
    expect(cleanLink('Rüeblisuppe mit Ingwer')).toBeNull()
    expect(cleanLink('')).toBeNull()
    expect(cleanLink('ftp://files.somewhere.ch/recipe.txt')?.protocol ?? null).not.toBe('ftp:')
  })

  it('is refused when it is not a public page', () => {
    const blocked = (link: string) => isPrivateAddress(new URL(link))
    for (const link of ['http://localhost/admin', 'http://127.0.0.1/', 'http://192.168.1.1/router', 'http://10.0.0.5/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://printer.local/', 'http://intranet/', 'https://db.internal/', 'https://www.lecker-kochen.ch:8080/', 'https://user:pass@lecker-kochen.ch/']) {
      expect(blocked(link), link).toBe(true)
    }
    for (const link of ['https://www.lecker-kochen.ch/rezepte', 'http://sunnykitchen.com/', 'https://pin.it/AbC', 'https://www.lecker-kochen.ch:443/']) expect(blocked(link), link).toBe(false)
  })

  it('knows a pin from the page behind it', () => {
    expect(hostFamily('https://www.pinterest.ch/pin/1/')).toBe('pinterest')
    expect(hostFamily('https://pin.it/AbC')).toBe('pinterest')
    expect(hostFamily('https://de.pinterest.com/pin/1/')).toBe('pinterest')
    expect(hostFamily('https://www.lecker-kochen.ch/a')).toBe('lecker-kochen.ch')
    expect(hostFamily('not a link')).toBe('')
  })
})

describe('reading a page', () => {
  it('follows redirects and says where the page really lives', async () => {
    const fetch = web({ 'https://pin.it/AbC': redirect('https://www.pinterest.ch/pin/1234/'), 'https://www.pinterest.ch/pin/1234/': redirect('/pin/1234/sent/'), 'https://www.pinterest.ch/pin/1234/sent/': html(PIN) })
    const page = await readPage(new URL('https://pin.it/AbC'), fetch)
    expect(page.url).toBe('https://www.pinterest.ch/pin/1234/sent/')
    expect(page.html).toContain('__PWS_DATA__')
  })

  it('checks every stop on the way: a redirect into a private network goes nowhere', async () => {
    const fetch = web({ 'https://trick.sunnykitchen.com/': redirect('http://169.254.169.254/latest/meta-data'), 'http://169.254.169.254/latest/meta-data': html('secrets') })
    expect(await code(readPage(new URL('https://trick.sunnykitchen.com/'), fetch))).toBe('blocked')
    expect(fetch.asked).toEqual(['https://trick.sunnykitchen.com/'])
    expect(await code(readPage(new URL('http://localhost/'), fetch))).toBe('blocked')
    expect(await code(readPage(new URL('https://trick2.sunnykitchen.com/'), web({ 'https://trick2.sunnykitchen.com/': redirect('file:///etc/passwd') })))).toBe('blocked')
  })

  it('gives up on a page that does not answer, loops, or is not a page', async () => {
    expect(await code(readPage(new URL('https://gone.sunnykitchen.com/'), web({})))).toBe('unreachable')
    expect(await code(readPage(new URL('https://a.sunnykitchen.com/'), web({ 'https://a.sunnykitchen.com/': new Response('nope', { status: 404 }) })))).toBe('unreachable')
    expect(await code(readPage(new URL('https://a.sunnykitchen.com/'), web({ 'https://a.sunnykitchen.com/': redirect('https://a.sunnykitchen.com/') })))).toBe('unreachable')
    expect(await code(readPage(new URL('https://a.sunnykitchen.com/book.pdf'), web({ 'https://a.sunnykitchen.com/book.pdf': html('%PDF', 'application/pdf') })))).toBe('not_a_page')
  })

  it('stops reading a page that is too big', async () => {
    const fetch = web({ 'https://a.sunnykitchen.com/': () => html('x'.repeat(5000)) })
    expect(await code(readPage(new URL('https://a.sunnykitchen.com/'), fetch, { maxBytes: 1000, timeoutMs: 1000, maxRedirects: 2 }))).toBe('too_big')
    expect((await readPage(new URL('https://a.sunnykitchen.com/'), fetch, { maxBytes: 6000, timeoutMs: 1000, maxRedirects: 2 })).html).toHaveLength(5000)
  })

  it('reads old pages in their own letters', async () => {
    const latin = new Uint8Array([0x52, 0xf6, 0x73, 0x74, 0x69]) // "Rösti" in ISO-8859-1
    const fetch = web({ 'https://alt.lecker-kochen.ch/': () => new Response(latin, { headers: { 'content-type': 'text/html; charset=iso-8859-1' } }) })
    expect((await readPage(new URL('https://alt.lecker-kochen.ch/'), fetch)).html).toBe('Rösti')
  })

  it('brings a picture along when it is one, and shrugs when it is not', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const fetch = web({
      'https://www.lecker-kochen.ch/bilder/suppe.jpg': () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }),
      'https://www.lecker-kochen.ch/bilder/suppe.svg': () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    })
    const picture = await readPicture('/bilder/suppe.jpg', 'https://www.lecker-kochen.ch/rezepte/suppe', fetch)
    expect(picture?.type).toBe('image/jpeg')
    expect([...(picture?.bytes ?? [])]).toEqual([...jpeg])
    expect(await readPicture('/bilder/suppe.svg', 'https://www.lecker-kochen.ch/', fetch)).toBeNull()
    expect(await readPicture('/bilder/fehlt.jpg', 'https://www.lecker-kochen.ch/', fetch)).toBeNull()
    expect(await readPicture('http://192.168.1.1/cam.jpg', 'https://www.lecker-kochen.ch/', fetch)).toBeNull()
    expect(await readPicture('/bilder/suppe.jpg', 'https://www.lecker-kochen.ch/', fetch, 3)).toBeNull()
  })
})

describe('taking a page apart', () => {
  it("finds the recipe a page describes for search engines, wherever it is tucked away", () => {
    expect(recipeData(SWISS_SITE)?.name).toBe('Rüeblisuppe mit Ingwer')
    expect(recipeData(SLOPPY_DATA)?.name).toBe('Zopf')
    expect(recipeData(SHOP)).toBeNull()
    expect(recipeData(BLOG)).toBeNull()
    expect(recipeData('<script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@type":"WebPage","mainEntity":{"@type":"Recipe","name":"Inside"}}]</script>')?.name).toBe('Inside')
    expect(recipeData('<script type="application/ld+json">{not json at all</script>')).toBeNull()
  })

  it('reads what a page says about itself', () => {
    expect(pageMeta(SWISS_SITE)).toEqual({ title: 'Rüeblisuppe mit Ingwer', image: 'https://www.lecker-kochen.ch/bilder/rueeblisuppe.jpg', site: 'Lecker Kochen', lang: 'de' })
    expect(pageMeta(BLOG)).toEqual({ title: "Grandma's Skillet Cornbread - Sunny Kitchen", image: '/pics/cornbread.jpg', site: null, lang: 'en' })
    expect(pageMeta('<p>nothing</p>')).toEqual({ title: null, image: null, site: null, lang: null })
  })

  it('keeps the words of a page and drops its machinery', () => {
    const text = pageText(BLOG)
    expect(text).toContain("Grandma's Skillet Cornbread")
    expect(text).toContain('- 1 1/2 cups cornmeal')
    expect(text).toContain('Heat the oven to 400°F with the skillet inside.')
    for (const noise of ['trackEverything', 'Shop my pans', 'Popular: 10 dips', 'Ignore all previous instructions', 'color:red', 'Menu']) expect(text, noise).not.toContain(noise)
    expect(pageText(BLOG, 40)).toHaveLength(40)
  })

  it('turns entities back into letters', () => {
    expect(decodeEntities('K&auml;se &amp; Br&ouml;t, 180&deg;C, &#189; TL, &#x2764; &unknown;')).toBe('Käse & Bröt, 180°C, ½ TL, ❤ &unknown;')
  })

  it('finds the page behind a pin', () => {
    expect(pinTarget(PIN, 'https://www.pinterest.ch/pin/1234/')).toBe('https://www.lecker-kochen.ch/rezepte/rueeblisuppe?utm_source=pin')
    expect(pinTarget(PIN_WITHOUT_LINK, 'https://www.pinterest.ch/pin/99/')).toBeNull()
    // A link back to the pin itself, or into a private network, is not a target.
    expect(pinTarget('{"link":"https://de.pinterest.com/pin/5/"}', 'https://www.pinterest.ch/pin/5/')).toBeNull()
    expect(pinTarget('{"link":"http://192.168.0.1/"}', 'https://www.pinterest.ch/pin/5/')).toBeNull()
  })
})
