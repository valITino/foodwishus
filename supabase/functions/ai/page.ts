// Reading a web page for the kitchen's helper. Only public web addresses, a size limit,
// a time limit, and nothing but a page. The helpers that take text apart are plain
// functions, tested under Node (tests/unit/ai.page.test.ts).

export type PageErrorCode = 'bad_link' | 'blocked' | 'unreachable' | 'too_big' | 'not_a_page'

export class PageError extends Error {
  readonly code: PageErrorCode
  constructor(code: PageErrorCode) {
    super(code)
    this.name = 'PageError'
    this.code = code
  }
}

/** The part of fetch this file needs, so tests can hand in pages from memory. */
export type FetchLike = (url: string, init: { redirect: 'manual'; headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>

/** A link the way people paste it: with or without https://, with spaces or a sentence around it. Null when there is no web address in it. */
export function cleanLink(input: string): URL | null {
  const found = /https?:\/\/[^\s<>"']+/i.exec(input)?.[0] ?? /(?:^|\s)((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/i.exec(input)?.[1]
  if (!found) return null
  try {
    const url = new URL(/^https?:\/\//i.test(found) ? found : `https://${found}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url
  } catch {
    return null
  }
}

/**
 * True for an address no public page lives at: this machine, a home or company network,
 * a bare number, an unusual port. The function runs on a server, and a pasted link must
 * never make it fetch something only that server can see.
 */
export function isPrivateAddress(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (url.port !== '' && url.port !== '80' && url.port !== '443') return true
  if (url.username !== '' || url.password !== '') return true
  if (host === '' || host === 'localhost' || !host.includes('.')) return true
  if (/\.(local|localhost|internal|lan|home|intranet|corp|test|invalid|example)$/.test(host)) return true
  // Any bare number is refused: recipe pages have names. That covers every private range, and IPv6.
  if (/^[0-9.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return true
  return false
}

export interface PageLimits {
  /** Largest page that is read, in bytes. */
  maxBytes: number
  timeoutMs: number
  maxRedirects: number
}

export const PAGE_LIMITS: PageLimits = { maxBytes: 1_500_000, timeoutMs: 9000, maxRedirects: 4 }

const BROWSER = { 'user-agent': 'Mozilla/5.0 (compatible; FoodwishUs recipe helper)', accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'de-CH,de;q=0.9,en;q=0.8' }

/** Let go of a response nobody is going to read. Not waited for: the answer does not depend on it. */
function drop(response: Response): void {
  void response.body?.cancel().catch(() => {})
}

/** Read a response's body up to a limit. Throws too_big past it. */
async function bodyBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(await response.arrayBuffer()).slice(0, maxBytes)
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      void reader.cancel().catch(() => {})
      throw new PageError('too_big')
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    all.set(chunk, at)
    at += chunk.byteLength
  }
  return all
}

/** Follow a link, checking every stop on the way, and hand back what answered. */
async function follow(link: URL, fetch: FetchLike, limits: PageLimits, accept: string): Promise<{ url: URL; response: Response }> {
  let url = link
  for (let hop = 0; hop <= limits.maxRedirects; hop++) {
    if (isPrivateAddress(url)) throw new PageError('blocked')
    let response: Response
    try {
      response = await fetch(url.href, { redirect: 'manual', headers: { ...BROWSER, accept }, signal: AbortSignal.timeout(limits.timeoutMs) })
    } catch {
      throw new PageError('unreachable')
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location')
      drop(response)
      if (!next) throw new PageError('unreachable')
      try {
        url = new URL(next, url)
      } catch {
        throw new PageError('unreachable')
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new PageError('blocked')
      continue
    }
    if (!response.ok) {
      drop(response)
      throw new PageError('unreachable')
    }
    return { url, response }
  }
  throw new PageError('unreachable')
}

export interface Page {
  /** Where the page really lives, after redirects. */
  url: string
  html: string
}

/** Fetch one web page as text. Throws PageError. */
export async function readPage(link: URL, fetch: FetchLike, limits: PageLimits = PAGE_LIMITS): Promise<Page> {
  const { url, response } = await follow(link, fetch, limits, BROWSER.accept)
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  if (type !== '' && !type.includes('html') && !type.includes('text/plain')) {
    drop(response)
    throw new PageError('not_a_page')
  }
  const bytes = await bodyBytes(response, limits.maxBytes)
  const charset = /charset=([\w-]+)/.exec(type)?.[1] ?? 'utf-8'
  let html: string
  try {
    html = new TextDecoder(charset).decode(bytes)
  } catch {
    html = new TextDecoder().decode(bytes)
  }
  return { url: url.href, html }
}

export interface Picture {
  /** "image/jpeg" */
  type: string
  bytes: Uint8Array
}

/** Fetch a page's picture, if it is a photo of a sensible size. Null when anything is off: a card works without one. */
export async function readPicture(link: string, base: string, fetch: FetchLike, maxBytes = 4_000_000): Promise<Picture | null> {
  try {
    const { response } = await follow(new URL(link, base), fetch, { ...PAGE_LIMITS, maxBytes }, 'image/avif,image/webp,image/jpeg,image/png;q=0.9')
    const type = (response.headers.get('content-type') ?? '').toLowerCase().split(';')[0].trim()
    if (!/^image\/(jpeg|png|webp|avif)$/.test(type)) {
      drop(response)
      return null
    }
    return { type, bytes: await bodyBytes(response, maxBytes) }
  } catch {
    return null
  }
}

// ------------------------------------------------------- taking a page apart --

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' }

/** "&amp;" and friends back into letters. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name] ?? whole
  })
}

/** Text with its tags taken out and its spaces tidied. */
export function plain(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (name?.toLowerCase() !== key) continue
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag)?.[1]
    if (content) return decodeEntities(content).trim()
  }
  return null
}

export interface PageMeta {
  title: string | null
  image: string | null
  site: string | null
  /** "de", "en": the page's own word for its language. */
  lang: string | null
}

/** What a page says about itself in its head. */
export function pageMeta(html: string): PageMeta {
  const title = metaContent(html, 'og:title') ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]) : null)
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z]{2})/i.exec(html)?.[1]?.toLowerCase() ?? metaContent(html, 'og:locale')?.slice(0, 2).toLowerCase() ?? null
  return { title: title || null, image: metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image'), site: metaContent(html, 'og:site_name'), lang }
}

/** Line breaks and tabs inside the quoted texts of a JSON document, written the way JSON wants them. Everything else is left alone. */
export function mendLineBreaks(json: string): string {
  let out = ''
  let inText = false
  for (let at = 0; at < json.length; at++) {
    const letter = json[at]
    if (inText && letter === '\\') {
      out += letter + (json[at + 1] ?? '')
      at += 1
    } else if (letter === '"') {
      inText = !inText
      out += letter
    } else if (inText && letter === '\n') out += '\\n'
    else if (inText && letter === '\r') out += ''
    else if (inText && letter === '\t') out += ' '
    else out += letter
  }
  return out
}

/** Every block of data a page carries for search engines, parsed. Broken blocks are skipped. */
function dataBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    try {
      blocks.push(JSON.parse(match[1].trim()))
    } catch {
      // Some pages put real line breaks inside their texts, which JSON does not allow. One more try with those written properly.
      try {
        blocks.push(JSON.parse(mendLineBreaks(match[1]).trim()))
      } catch {
        /* not ours to repair */
      }
    }
  }
  return blocks
}

const isRecipeType = (type: unknown): boolean => (Array.isArray(type) ? type.some(isRecipeType) : typeof type === 'string' && type.toLowerCase().replace(/^https?:\/\/schema\.org\//, '') === 'recipe')

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || node === null || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1)
      if (found) return found
    }
    return null
  }
  const object = node as Record<string, unknown>
  if (isRecipeType(object['@type'])) return object
  return findRecipe(object['@graph'], depth + 1) ?? findRecipe(object.mainEntity, depth + 1) ?? findRecipe(object.mainEntityOfPage, depth + 1)
}

/** The recipe a page describes for search engines (schema.org), if it does. Most recipe sites do. */
export function recipeData(html: string): Record<string, unknown> | null {
  return findRecipe(dataBlocks(html))
}

/**
 * The words of a page without its machinery: no scripts, styles, menus or footers. Cut
 * at a limit that leaves room for a long recipe and keeps a request small.
 */
export function pageText(html: string, limit = 24_000): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2]
  const kept = (main && main.length > 800 ? main : body)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe|template|button|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|ul|ol)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
  return plain(kept).slice(0, limit)
}

/**
 * A pin is a picture with a link to the page the recipe lives on. Find that link.
 * Null when the page gives none (then the pin itself is all there is to read).
 */
export function pinTarget(html: string, pageUrl: string): string | null {
  const candidates = [metaContent(html, 'og:see_also'), metaContent(html, 'pinterestapp:source'), ...[...html.matchAll(/"(?:link|source_url|canonical_url|url)"\s*:\s*"(https?:[^"\\]*(?:\\.[^"\\]*)*)"/g)].map((match) => match[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/'))]
  const here = hostFamily(pageUrl)
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && hostFamily(url.href) !== here && !isPrivateAddress(url)) return url.href
    } catch {
      /* next */
    }
  }
  return null
}

/** "www.pinterest.ch" and "pin.it" are one family; so are "www.betty.ch" and "betty.ch". */
export function hostFamily(link: string): string {
  try {
    const host = new URL(link).hostname.toLowerCase()
    if (host === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(host)) return 'pinterest'
    return host.replace(/^www\./, '')
  } catch {
    return ''
  }
}
