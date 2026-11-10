// The design system on one page: tokens, type, components, the deco kit and Fork.
// Open it at #/styleguide. Everything the app is built from lives here first.

import { useState, type ReactNode } from 'react'
import { setLang, useLang, useT } from '../../i18n'
import type { Reaction } from '../../data/types'
import { Avatar, AVATARS, Button, Card, Chip, EmptyState, Field, HeartMeter, Polaroid, ReactionBar, SpoonMeter, Stamp, Stat, StatusBubble, SteamLoader, Stepper, SyncPill, Tag, TextArea, Toggle } from '../../ui/components'
import { Bow, Cherry, Cloche, Flower, Heart, Mascot, RollingPin, Sparkle, Sprig, Teacup, WashiTape, Whisk } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { setTheme, useTheme } from '../../ui/theme'
import { SamplePlate } from './SamplePlate'
import { TodayPreview } from './TodayPreview'

function Section({ id, title, rule, children }: { id: string; title: string; rule?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <h2 id={`${id}-title`} className="text-xl">
        {title}
      </h2>
      {rule && <p className="mt-1 max-w-[58ch] text-sm text-ink-soft">{rule}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const swatches = [
  { name: 'Cream', token: 'ground', use: 'The tablecloth: page background' },
  { name: 'Paper', token: 'surface', use: 'Cards' },
  { name: 'Blush', token: 'blush', use: 'Awning, notes, soft panels' },
  { name: 'Rose', token: 'rose', use: 'Main buttons' },
  { name: 'Rose ink', token: 'rose-ink', use: 'Links, handwriting, active tab' },
  { name: 'Cherry', token: 'cherry', use: 'Hearts and the wax seal, sparingly' },
  { name: 'Sage', token: 'sage', use: 'Calm and "all good"' },
  { name: 'Butter', token: 'butter', use: 'Highlights, waiting' },
  { name: 'Cocoa', token: 'ink', use: 'Text' },
]

const deco: { name: string; job: string; art: ReactNode }[] = [
  { name: 'Bow', job: 'Marks her proposals', art: <Bow /> },
  { name: 'Heart', job: 'Craving and favourites', art: <Heart /> },
  { name: 'Cherry', job: 'Dessert and treats', art: <Cherry /> },
  { name: 'Whisk', job: 'The Chef', art: <Whisk /> },
  { name: 'Rolling pin', job: 'Prep and effort', art: <RollingPin /> },
  { name: 'Teacup', job: 'Breakfast and breaks', art: <Teacup /> },
  { name: 'Cloche', job: 'Served, and loading', art: <Cloche /> },
  { name: 'Herb sprig', job: 'Fresh and light', art: <Sprig /> },
  { name: 'Flower', job: 'Celebrations', art: <Flower /> },
  { name: 'Sparkle', job: 'New and special', art: <Sparkle /> },
]

export function Styleguide() {
  const t = useT()
  const lang = useLang()
  const theme = useTheme()
  const [craving, setCraving] = useState<number | null>(4)
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [scores, setScores] = useState<Record<string, number | null>>({ Taste: 5, Texture: 4, Smell: null })
  const [chip, setChip] = useState('All')
  const [calories, setCalories] = useState(true)
  const [servings, setServings] = useState(2)
  const [stampKey, setStampKey] = useState(0)

  return (
    <div className="gingham min-h-dvh bg-ground pb-16">
      <header className="scallop-bottom bg-blush [--scallop:12px]">
        <div className="app-column flex flex-col items-center px-5 pb-5 pt-8 text-center">
          <Mascot size={132} mood="love" />
          <p className="mt-2 font-display text-[2.6rem] font-bold leading-none tracking-tight font-soft" aria-label="FoodwishUs">
            Food<span className="font-semibold italic text-cherry">wish</span>
            <span className="text-rose-ink">Us</span>
          </p>
          <p className="mt-1 font-script text-3xl text-rose-ink">{t.brand.slogan}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Chip selected={theme !== 'dark'} onClick={() => setTheme('light')}>
              Light
            </Chip>
            <Chip selected={theme === 'dark'} onClick={() => setTheme('dark')}>
              Candlelight
            </Chip>
            <Chip selected={lang === 'en'} onClick={() => setLang('en')}>
              English
            </Chip>
            <Chip selected={lang === 'de'} onClick={() => setLang('de')}>
              Deutsch
            </Chip>
          </div>
        </div>
      </header>

      <main className="app-column flex flex-col gap-12 px-4 pt-8">
        <Section id="preview" title="A first taste: Today" rule="Built only from the parts below, with sample content.">
          <TodayPreview embedded />
        </Section>

        <Section id="colour" title="Colour" rule="Paper and fabric: flat colour and hairlines. Cherry is for hearts and the seal only.">
          <div className="grid grid-cols-3 gap-3">
            {swatches.map((s) => (
              <div key={s.token}>
                <div className="h-16 rounded-2xl border border-line" style={{ background: `var(--color-${s.token})` }} />
                <p className="mt-1.5 text-xs font-extrabold">{s.name}</p>
                <p className="text-2xs leading-snug text-ink-soft">{s.use}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="Type" rule="Fraunces, set soft, for headings. Nunito for everything you tap and read. Parisienne only for handwriting.">
          <Card className="flex flex-col gap-4">
            <div>
              <p className="font-display text-2xl font-bold leading-none font-soft">Zürcher Geschnetzeltes</p>
              <p className="mt-1 text-2xs font-bold text-ink-soft">Fraunces soft, headings</p>
            </div>
            <div>
              <p className="text-base">Creamy veal in white wine sauce with a golden Rösti on the side. Serves two, ready in 35 minutes.</p>
              <p className="mt-1 text-2xs font-bold text-ink-soft">Nunito, body and buttons</p>
            </div>
            <div>
              <p className="font-script text-3xl leading-tight text-rose-ink">Every plate is a tiny love letter.</p>
              <p className="mt-1 text-2xs font-bold text-ink-soft">Parisienne, quotes and notes only</p>
            </div>
          </Card>
        </Section>

        <Section id="buttons" title="Buttons" rule="Candy buttons: a pastel face on a darker edge that squashes when pressed. One main button per screen.">
          <div className="flex flex-col items-start gap-4">
            <Button size="lg" icon={<Icon name="camera" size={22} />}>
              {t.actions.takeProof}
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <Button>{t.actions.served}</Button>
              <Button variant="secondary">{t.actions.plan}</Button>
              <Button variant="quiet">{t.actions.cancel}</Button>
            </div>
            <Button disabled>{t.actions.save}</Button>
          </div>
        </Section>

        <Section id="cards" title="Cards and notes" rule="Cards are flat paper with a hairline. Only things that float get the pink shadow. Stitching marks a note written for the other person.">
          <div className="flex flex-col gap-4">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg">Lasagne al forno</h3>
                  <p className="mt-0.5 text-sm text-ink-soft">Main, 75 minutes, 640 kcal per serving</p>
                </div>
                <Bow size={34} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Tag>Italian</Tag>
                <Tag tone="sage">Comfort</Tag>
                <Tag tone="butter">Fancy</Tag>
              </div>
            </Card>
            <Card tone="note">
              <p className="text-2xs font-extrabold text-ink-soft">A note from Mia</p>
              <p className="font-script text-2xl leading-tight text-rose-ink">Extra cheese, just for you</p>
            </Card>
            <Card tone="blush" className="grid grid-cols-3 gap-3">
              <Stat value={23} label="meals eaten" />
              <Stat value="4.3" label="average rating" />
              <Stat value={4} unit="days" label="in a row" />
            </Card>
          </div>
        </Section>

        <Section id="controls" title="Chips and fields">
          <div className="flex flex-col gap-5">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {['All', 'Not rated yet', 'Planned', 'Desserts'].map((label) => (
                <Chip key={label} selected={chip === label} onClick={() => setChip(label)}>
                  {label}
                </Chip>
              ))}
            </div>
            <Field label="Dish name" placeholder="Älplermagronen" defaultValue="" />
            <TextArea label="A note for your Taster" placeholder="Extra cheese, just for you" />
            <Card pad={false} className="divide-y divide-line px-4 py-1">
              <Toggle label="Show calories" checked={calories} onChange={setCalories} />
              <Stepper label="Servings" value={servings} onChange={setServings} />
            </Card>
          </div>
        </Section>

        <Section id="ratings" title="Hearts, spoons and faces" rule="Hearts say how much he wants it. Faces are the fast verdict while still chewing. Spoons rate the details.">
          <div className="flex flex-col gap-4">
            <Card>
              <p className="mb-1 text-xs font-extrabold">{t.craving.title}</p>
              <HeartMeter value={craving} onChange={setCraving} />
            </Card>
            <Card>
              <p className="mb-2 text-xs font-extrabold">{t.reactions.title}</p>
              <ReactionBar value={reaction} onChange={setReaction} />
            </Card>
            <Card pad={false} className="px-4 py-2">
              {Object.keys(scores).map((label) => (
                <SpoonMeter key={label} label={label} value={scores[label]} onChange={(v) => setScores({ ...scores, [label]: v })} />
              ))}
            </Card>
          </div>
        </Section>

        <Section id="proof" title="Proof photo and seal" rule="The photo develops like a polaroid, held by washi tape. Sending the review stamps the seal.">
          <div className="grid grid-cols-2 items-center gap-5">
            <Polaroid caption="10 November" source="camera" tilt={-3}>
              <SamplePlate dish="magronen" label="Älplermagronen" />
            </Polaroid>
            <div className="flex flex-col items-center gap-3">
              <Stamp key={stampKey} />
              <Button variant="secondary" onClick={() => setStampKey((k) => k + 1)}>
                Stamp again
              </Button>
            </div>
          </div>
        </Section>

        <Section id="deco" title="Deco kit" rule="Kitchen objects in one hand-drawn style. Each has a job. At most one per screen area.">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {deco.map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface border border-line">{d.art}</span>
                <span>
                  <span className="block text-sm font-extrabold">{d.name}</span>
                  <span className="block text-xs leading-snug text-ink-soft">{d.job}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-around">
            <WashiTape tone="rose" />
            <WashiTape tone="sage" />
            <WashiTape tone="butter" />
          </div>
        </Section>

        <Section id="fork" title="Fork, our mascot" rule="Heart-eyed when food is coming, happy when all is well, asleep when there is nothing to do.">
          <div className="grid grid-cols-3 gap-3 text-center">
            {(['love', 'happy', 'sleepy'] as const).map((mood) => (
              <Card key={mood} pad={false} className="flex flex-col items-center px-2 py-4">
                <Mascot size={84} mood={mood} bib={mood === 'happy' ? '#b5c4a8' : mood === 'sleepy' ? '#edb93a' : '#e58a9c'} />
                <span className="mt-1 text-xs font-extrabold capitalize">{mood}</span>
              </Card>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {AVATARS.map((a, i) => (
              <Avatar key={a} avatar={a} color={['rose', 'sage', 'butter', 'sky'][i % 4]} size={52} name={a} />
            ))}
          </div>
        </Section>

        <Section id="profiles" title="Profiles and status" rule="Each of you builds an avatar and writes a status line. The other one sees it on Today.">
          <div className="flex flex-col gap-3">
            <StatusBubble name="Mia" status="Chef mode: on. Bring an appetite." avatar="whisk" color="rose" />
            <StatusBubble name="Leo" status="Always Huuungryyyyy" avatar="fork" color="sage" />
          </div>
        </Section>

        <Section id="states" title="Empty, loading and sync" rule="An empty screen is an invitation. Loading is steam from a cloche. Sync is one quiet line.">
          <div className="flex flex-col gap-4">
            <Card pad={false}>
              <EmptyState title={t.empty.wishlistTitle} body={t.empty.wishlistBody} action={<Button>{t.empty.wishlistAction}</Button>} />
            </Card>
            <Card>
              <SteamLoader />
            </Card>
            <div className="flex flex-wrap gap-2">
              <SyncPill status={{ state: 'idle', pending: 0, uploads: 0 }} />
              <SyncPill status={{ state: 'idle', pending: 2, uploads: 1 }} />
              <SyncPill status={{ state: 'offline', pending: 3, uploads: 0 }} />
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}
