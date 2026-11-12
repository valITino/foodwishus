// Bundles the kitchen's helper (supabase/functions/ai) into ONE plain file:
// supabase/functions/ai/dist/index.js. That file is what gets deployed: pasted into the
// Supabase dashboard's function editor, or handed to a connector.
// Readable on purpose: not minified, nothing imported, comments dropped.
// Prints its size and SHA-256, so a pasted copy can be checked against it.
// Run with: npm run build:ai

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = join(root, 'supabase/functions/ai/dist/index.js')

await build({
  entryPoints: [join(root, 'supabase/functions/ai/index.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  target: 'esnext',
  platform: 'neutral',
  minify: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
})

const plain = readFileSync(outfile, 'utf8').replaceAll('/* @__PURE__ */ ', '')
if (/^\s*(import|export)\s/m.test(plain)) throw new Error('The bundle still imports or exports something. It has to stand alone.')
// The helper never gets the key in its code: it asks its environment, and only for these.
const asked = [...plain.matchAll(/Deno\.env\.get\("(\w+)"\)/g)].map(([, name]) => name).sort()
if (asked.join() !== 'AI_MODEL,AI_MODEL_CHAT,ANTHROPIC_API_KEY,SUPABASE_ANON_KEY,SUPABASE_URL') throw new Error(`The bundle asks its environment for something unexpected: ${asked.join(', ')}`)
if (/sk-ant-|pretend/i.test(plain)) throw new Error('The bundle contains a key or a piece of the pretend web. Neither belongs in it.')
writeFileSync(outfile, plain)

const bytes = Buffer.from(plain, 'utf8')
console.log(relative(root, outfile))
console.log(`size    ${bytes.length} bytes, ${plain.length} characters, ${plain.split('\n').length - 1} lines`)
console.log(`sha256  ${createHash('sha256').update(bytes).digest('hex')}`)
