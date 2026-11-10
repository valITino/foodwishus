// Builds the brand files and app icons from one source of truth: Fork, the mascot.
// Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const HEART = 'M110 186C46 140 24 106 28 72c4-32 30-46 54-42 14 2 23 12 28 22 5-10 14-20 28-22 24-4 50 10 54 42 4 34-18 68-82 114Z'

/** Fork on a 200 x 240 canvas. */
const fork = (bib = '#e58a9c') => `
  <defs>
    <pattern id="gingham" width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="#fdf1f3"/>
      <rect width="6" height="12" fill="${bib}" opacity=".55"/>
      <rect width="12" height="6" fill="${bib}" opacity=".55"/>
    </pattern>
  </defs>
  <path d="${HEART}" transform="translate(166 46) rotate(12) scale(.17) translate(-110 -108)" fill="#e58a9c"/>
  <path d="M0-15C2-4 4-2 15 0 4 2 2 4 0 15-2 4-4 2-15 0-4-2-2-4 0-15Z" transform="translate(30 36)" fill="#edb93a"/>
  <rect x="91" y="120" width="18" height="100" rx="9" fill="#f3ece6" stroke="#4a3833" stroke-width="3.5"/>
  <path d="${HEART}" transform="translate(100 202) scale(.065) translate(-110 -108)" fill="#e58a9c"/>
  <path d="M58 30c0-7.5 11-7.5 11 0v36h13.3V30c0-7.5 11-7.5 11 0v36h13.4V30c0-7.5 11-7.5 11 0v36H131V30c0-7.5 11-7.5 11 0v68c0 24-19 40-42 40S58 122 58 98V30Z" fill="#f3ece6" stroke="#4a3833" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M65 78v20c0 10 3 18 9 24M63.5 32v20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>
  <path d="${HEART}" transform="translate(84 95) scale(.13) translate(-110 -108)" fill="#c8414b"/>
  <path d="${HEART}" transform="translate(116 95) scale(.13) translate(-110 -108)" fill="#c8414b"/>
  <circle cx="79.5" cy="91" r="2.2" fill="#fff"/><circle cx="111.5" cy="91" r="2.2" fill="#fff"/>
  <ellipse cx="71" cy="112" rx="7" ry="4" fill="#fbc4cf"/><ellipse cx="129" cy="112" rx="7" ry="4" fill="#fbc4cf"/>
  <path d="M88 110q12 18 24 0Z" fill="#4a3833" stroke="#4a3833" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="100" cy="117" rx="5" ry="2.6" fill="#f28c9e"/>
  <path d="M113 112c3.6 7 7 12 0 18-7-6-3.6-11 0-18Z" fill="#a9d4e8" stroke="#4a3833" stroke-width="1.6"/>
  <path d="M68 136h64l-32 50-32-50Z" fill="url(#gingham)" stroke="#4a3833" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M70 137 57 125l20 6-7 6ZM130 137l13-12-20 6 7 6Z" fill="${bib}" stroke="#4a3833" stroke-width="2.2" stroke-linejoin="round"/>
`

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="400" height="480">${fork()}</svg>`

/** Square app icon. "bleed" fills the whole square (Android crops it to its own shape). */
const icon = ({ bleed }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${bleed ? 0 : 116}" fill="#f6d5dc"/>
  <g transform="translate(${bleed ? 131 : 106} ${bleed ? 106 : 76}) scale(${bleed ? 1.25 : 1.5})">${fork()}</g>
</svg>`

await mkdir('brand', { recursive: true })
await mkdir('public/icons', { recursive: true })
await writeFile('brand/foodwishus-mark.svg', mark)
await writeFile('brand/foodwishus-icon.svg', icon({ bleed: false }))
await writeFile('public/icons/icon.svg', icon({ bleed: false }))

const rounded = Buffer.from(icon({ bleed: false }))
const full = Buffer.from(icon({ bleed: true }))
await sharp(rounded).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(rounded).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(full).resize(512, 512).png().toFile('public/icons/maskable-512.png')
await sharp(full).resize(192, 192).png().toFile('public/icons/maskable-192.png')
await sharp(Buffer.from(mark)).resize(800).png().toFile('brand/foodwishus-mark.png')
console.log('Icons written to public/icons and brand/')
