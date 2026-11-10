// Draws the small one-colour icon Android shows in the status bar next to a
// notification: Fork's outline with a heart, white on nothing. Android tints it itself.
// Run with: node tools/make-badge.mjs   (the other icons come from tools/make-icons.mjs)
import sharp from 'sharp'

const HEART = 'M110 186C46 140 24 106 28 72c4-32 30-46 54-42 14 2 23 12 28 22 5-10 14-20 28-22 24-4 50 10 54 42 4 34-18 68-82 114Z'
const HEAD = 'M58 30c0-7.5 11-7.5 11 0v36h13.3V30c0-7.5 11-7.5 11 0v36h13.4V30c0-7.5 11-7.5 11 0v36H131V30c0-7.5 11-7.5 11 0v68c0 24-19 40-42 40S58 122 58 98V30Z'

const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="96" height="96">
  <defs>
    <mask id="cut">
      <rect x="-20" width="260" height="240" fill="#fff"/>
      <path d="${HEART}" transform="translate(100 102) scale(.2) translate(-110 -108)" fill="#000"/>
    </mask>
  </defs>
  <g transform="translate(20 0)" fill="#fff" mask="url(#cut)">
    <rect x="89" y="120" width="22" height="106" rx="11"/>
    <path d="${HEAD}"/>
  </g>
</svg>`

await sharp(Buffer.from(badge)).resize(96, 96).png().toFile('public/icons/badge-96.png')
console.log('Badge written to public/icons/badge-96.png')
